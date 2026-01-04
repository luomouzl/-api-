import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "api-rotator";
const defaultSettings = {
    apiList: [],
    currentIndex: 0,
    enabled: true,
    switchMode: "every-request",
    rotateMode: "round-robin",
    showNotification: true
};

let requestCount = 0;
let lastUsedIndex = -1;

function loadSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = {};
    }
    for (const key in defaultSettings) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }
}

function getSettings() {
    return extension_settings[extensionName];
}

function savePluginSettings() {
    saveSettingsDebounced();
}

function getEnabledAPIs() {
    return getSettings().apiList.filter(a => a.enabled !== false);
}

function getCurrentAPI() {
    const list = getEnabledAPIs();
    if (list.length === 0) return null;
    const s = getSettings();
    return list[s.currentIndex % list.length];
}

function getNextAPI() {
    const s = getSettings();
    const list = getEnabledAPIs();
    if (list.length === 0) return null;
    
    if (list.length === 1) {
        s.currentIndex = 0;
        return list[0];
    }
    
    if (s.rotateMode === "random") {
        let newIndex;
        do {
            newIndex = Math.floor(Math.random() * list.length);
        } while (newIndex === lastUsedIndex && list.length > 1);
        s.currentIndex = newIndex;
    } else {
        s.currentIndex = (s.currentIndex + 1) % list.length;
    }
    
    lastUsedIndex = s.currentIndex;
    savePluginSettings();
    return list[s.currentIndex];
}

function getAPIForRequest() {
    const s = getSettings();
    return s.switchMode === "every-request" ? getNextAPI() : getCurrentAPI();
}

// 获取ST的oai_settings对象
function getOaiSettings() {
    // 尝试多种方式获取
    if (typeof window.oai_settings !== 'undefined') {
        return window.oai_settings;
    }
    if (typeof oai_settings !== 'undefined') {
        return oai_settings;
    }
    return null;
}

// 核心：修改ST官方设置
function applyToOfficialSettings(api) {
    if (!api) return false;
    
    try {
        const oai = getOaiSettings();
        
        if (oai) {
            oai.reverse_proxy = api.endpoint;
            oai.proxy_password = api.apiKey || "";
            if (api.model) {
                oai.openai_model = api.model;
            }
            console.log("[API轮询] 内部设置已修改");
        }
        
        // 同步UI
        const proxyInput = document.getElementById("openai_reverse_proxy");
        if (proxyInput) {
            proxyInput.value = api.endpoint;
            proxyInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        
        const keyInput = document.getElementById("api_key_openai");
        if (keyInput) {
            keyInput.value = api.apiKey || "";
            keyInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        
        if (api.model) {
            const modelSelect = document.getElementById("model_openai_select");
            if (modelSelect) {
                if (!Array.from(modelSelect.options).some(o => o.value === api.model)) {
                    const opt = document.createElement("option");
                    opt.value = api.model;
                    opt.textContent = api.model;
                    modelSelect.appendChild(opt);
                }
                modelSelect.value = api.model;
                modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }
        
        console.log(`[API轮询] 已应用: ${api.name} → ${api.endpoint}`);
        return true;
    } catch (e) {
        console.error("[API轮询] 应用失败:", e);
        return false;
    }
}

function showNotification(api) {
    if (!getSettings().showNotification) return;
    toastr.info(`🔄 ${api.name}${api.model ? ` [${api.model}]` : ""}`, "API切换", { timeOut: 2000 });
}

function switchToNext() {
    const s = getSettings();
    const list = getEnabledAPIs();
    if (list.length <= 1) return getCurrentAPI();
    s.currentIndex = (s.currentIndex + 1) % list.length;
    lastUsedIndex = s.currentIndex;
    savePluginSettings();
    return list[s.currentIndex];
}

function manualSwitch() {
    if (getEnabledAPIs().length < 2) return toastr.warning("需要至少2个API");
    const api = switchToNext();
    applyToOfficialSettings(api);
    updateUI();
    toastr.success("已切换: " + api.name);
}

function useAPI(id) {
    const s = getSettings();
    const api = s.apiList.find(a => a.id === id);
    if (!api) return;
    const list = getEnabledAPIs();
    const idx = list.findIndex(a => a.id === id);
    if (idx >= 0) {
        s.currentIndex = idx;
        lastUsedIndex = idx;
        savePluginSettings();
    }
    applyToOfficialSettings(api);
    updateUI();
    toastr.success("已切换: " + api.name);
}

function applyNow() {
    const api = getCurrentAPI();
    if (api) {
        applyToOfficialSettings(api);
        updateUI();
        toastr.success("已应用: " + api.name);
    } else {
        toastr.warning("没有可用的API");
    }
}

function setupSendHook() {
    const hook = () => {
        const s = getSettings();
        if (!s.enabled || getEnabledAPIs().length === 0) return;
        const api = getAPIForRequest();
        if (api) {
            requestCount++;
            applyToOfficialSettings(api);
            showNotification(api);
            updateUI();
        }
    };
    
    const patchBtn = () => {
        const btn = document.getElementById("send_but");
        if (btn && !btn._arHooked) {
            btn._arHooked = true;
            btn.addEventListener("mousedown", hook, true);
        }
    };
    
    document.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            const ta = document.getElementById("send_textarea");
            if (ta && document.activeElement === ta && ta.value.trim()) hook();
        }
    }, true);
    
    patchBtn();
    new MutationObserver(patchBtn).observe(document.body, { childList: true, subtree: true });
}

function addAPI(name, endpoint, apiKey, model) {
    getSettings().apiList.push({ id: Date.now().toString(), name, endpoint, apiKey, model: model || "", enabled: true });
    savePluginSettings();
    updateUI();
    toastr.success("已添加: " + name);
}

function deleteAPI(id) {
    const s = getSettings();
    const idx = s.apiList.findIndex(a => a.id === id);
    if (idx >= 0) {
        s.apiList.splice(idx, 1);
        if (s.currentIndex >= getEnabledAPIs().length) s.currentIndex = 0;
        savePluginSettings();
        updateUI();
    }
}

function toggleAPI(id) {
    const api = getSettings().apiList.find(a => a.id === id);
    if (api) {
        api.enabled = !api.enabled;
        const s = getSettings();
        if (s.currentIndex >= getEnabledAPIs().length) s.currentIndex = 0;
        savePluginSettings();
        updateUI();
    }
}

function moveAPI(id, dir) {
    const s = getSettings();
    const idx = s.apiList.findIndex(a => a.id === id);
    const newIdx = dir === "up" ? idx - 1 : idx + 1;
    if (idx >= 0 && newIdx >= 0 && newIdx < s.apiList.length) {
        [s.apiList[idx], s.apiList[newIdx]] = [s.apiList[newIdx], s.apiList[idx]];
        savePluginSettings();
        updateUI();
    }
}

function setAPIModel(id, model) {
    const api = getSettings().apiList.find(a => a.id === id);
    if (api) { api.model = model; savePluginSettings(); updateUI(); }
}

async function fetchModels(endpoint, apiKey) {
    try {
        const base = endpoint.replace(/\/+$/, "").replace(/\/v1$/, "");
        const res = await fetch(base + "/v1/models", { headers: apiKey ? { Authorization: "Bearer " + apiKey } : {} });
        if (res.ok) { const d = await res.json(); if (d.data) return d.data.map(m => m.id).sort(); }
    } catch (e) {}
    return [];
}

async function testAPI(api) {
    toastr.info("测试: " + api.name);
    const m = await fetchModels(api.endpoint, api.apiKey);
    m.length > 0 ? toastr.success(`${api.name} 成功 (${m.length}模型)`) : toastr.error(api.name + " 失败");
    return m;
}

function exportConfig() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ apiList: getSettings().apiList }, null, 2)], { type: "application/json" }));
    a.download = "api-config.json";
    a.click();
}

function importConfig(file) {
    const r = new FileReader();
    r.onload = e => {
        try {
            const d = JSON.parse(e.target.result);
            if (d.apiList) {
                d.apiList.forEach(a => getSettings().apiList.push({ id: Date.now() + "" + Math.random(), name: a.name || "未命名", endpoint: a.endpoint || "", apiKey: a.apiKey || "", model: a.model || "", enabled: true }));
                savePluginSettings();
                updateUI();
                toastr.success("已导入");
            }
        } catch (e) { toastr.error("导入失败"); }
    };
    r.readAsText(file);
}

function esc(t) { const d = document.createElement("div"); d.textContent = t || ""; return d.innerHTML; }

function createUI() {
    document.getElementById("extensions_settings")?.insertAdjacentHTML("beforeend", `
<div id="ar-panel">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>🔄 API轮询切换器</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="ar-row"><label><input type="checkbox" id="ar-enabled"> 启用</label> <span>当前: <b id="ar-current">无</b></span></div>
            <div class="ar-section">切换模式</div>
            <div class="ar-row">
                <select id="ar-switch-mode" class="ar-sel"><option value="every-request">每次切换</option><option value="on-error">固定</option></select>
                <select id="ar-rotate-mode" class="ar-sel"><option value="round-robin">顺序</option><option value="random">随机</option></select>
            </div>
            <div class="ar-row">
                <button id="ar-next" class="menu_button">⏭下一个</button>
                <button id="ar-apply" class="menu_button">⚡应用</button>
                <label><input type="checkbox" id="ar-notify"> 提示</label>
            </div>
            <div id="ar-stats" class="ar-stats">0/0 | 请求:0</div>
            <div id="ar-list" class="ar-list"></div>
            <button id="ar-add-btn" class="menu_button ar-w">➕ 添加API</button>
            <div id="ar-form" style="display:none" class="ar-form">
                <input id="ar-f-name" placeholder="名称">
                <input id="ar-f-endpoint" placeholder="API地址">
                <input id="ar-f-key" type="password" placeholder="密钥">
                <div class="ar-row"><input id="ar-f-model" placeholder="模型"><button id="ar-f-fetch" class="menu_button">🔄</button></div>
                <select id="ar-f-models" style="display:none"></select>
                <div class="ar-row"><button id="ar-f-test" class="menu_button">🔌</button><button id="ar-f-save" class="menu_button">💾</button><button id="ar-f-cancel" class="menu_button">❌</button></div>
            </div>
            <div class="ar-row"><button id="ar-export" class="menu_button">📤</button><button id="ar-import" class="menu_button">📥</button><input type="file" id="ar-file" accept=".json" style="display:none"></div>
        </div>
    </div>
</div>`);
}

function updateUI() {
    const s = getSettings(), cur = getCurrentAPI(), list = getEnabledAPIs();
    const el = id => document.getElementById(id);
    if (el("ar-enabled")) el("ar-enabled").checked = s.enabled;
    if (el("ar-switch-mode")) el("ar-switch-mode").value = s.switchMode;
    if (el("ar-rotate-mode")) el("ar-rotate-mode").value = s.rotateMode;
    if (el("ar-notify")) el("ar-notify").checked = s.showNotification;
    if (el("ar-current")) el("ar-current").textContent = cur ? cur.name : "无";
    if (el("ar-stats")) el("ar-stats").textContent = `${list.length}/${s.apiList.length} | 请求:${requestCount}`;
    
    const listEl = el("ar-list");
    if (!listEl) return;
    if (s.apiList.length === 0) { listEl.innerHTML = '<div class="ar-empty">无API</div>'; return; }
    
    listEl.innerHTML = s.apiList.map((api, i) => {
        const isCur = cur && cur.id === api.id, isOn = api.enabled !== false;
        return `<div class="ar-item ${isCur ? 'ar-cur' : ''} ${isOn ? '' : 'ar-off'}" data-id="${api.id}">
            <div class="ar-top"><input type="checkbox" class="ar-chk" ${isOn ? 'checked' : ''}><div class="ar-info"><div class="ar-name">${isCur ? '▶' : ''}${esc(api.name)}</div><div class="ar-url">${esc(api.endpoint)}</div>${api.model ? `<div class="ar-m">${esc(api.model)}</div>` : ''}</div></div>
            <div class="ar-mrow"><select class="ar-msel"><option value="">默认</option>${api.model ? `<option value="${esc(api.model)}" selected>${esc(api.model)}</option>` : ''}</select><button class="menu_button ar-loadm">🔄</button></div>
            <div class="ar-btns"><button class="menu_button ar-use" ${isOn ? '' : 'disabled'}>▶</button><button class="menu_button ar-test">🔌</button><button class="menu_button ar-up" ${i === 0 ? 'disabled' : ''}>⬆</button><button class="menu_button ar-down" ${i === s.apiList.length - 1 ? 'disabled' : ''}>⬇</button><button class="menu_button ar-del">🗑</button></div>
        </div>`;
    }).join('');
}

function showForm() { document.getElementById("ar-form").style.display = "block"; document.getElementById("ar-add-btn").style.display = "none"; }
function hideForm() { document.getElementById("ar-form").style.display = "none"; document.getElementById("ar-add-btn").style.display = "block"; ["ar-f-name","ar-f-endpoint","ar-f-key","ar-f-model"].forEach(id => { const e = document.getElementById(id); if(e) e.value = ""; }); document.getElementById("ar-f-models").style.display = "none"; }

function bindEvents() {
    const el = id => document.getElementById(id), s = getSettings();
    el("ar-enabled")?.addEventListener("change", e => { s.enabled = e.target.checked; savePluginSettings(); });
    el("ar-switch-mode")?.addEventListener("change", e => { s.switchMode = e.target.value; savePluginSettings(); updateUI(); });
    el("ar-rotate-mode")?.addEventListener("change", e => { s.rotateMode = e.target.value; savePluginSettings(); });
    el("ar-notify")?.addEventListener("change", e => { s.showNotification = e.target.checked; savePluginSettings(); });
    el("ar-next")?.addEventListener("click", manualSwitch);
    el("ar-apply")?.addEventListener("click", applyNow);
    el("ar-add-btn")?.addEventListener("click", showForm);
    el("ar-f-cancel")?.addEventListener("click", hideForm);
    el("ar-f-fetch")?.addEventListener("click", async () => { const ep = el("ar-f-endpoint").value.trim(), key = el("ar-f-key").value.trim(); if (!ep) return; const m = await fetchModels(ep, key); if (m.length) { const sel = el("ar-f-models"); sel.innerHTML = '<option value="">选择</option>' + m.map(x => `<option value="${x}">${x}</option>`).join(''); sel.style.display = "block"; sel.onchange = () => el("ar-f-model").value = sel.value; toastr.success(m.length + "模型"); } });
    el("ar-f-test")?.addEventListener("click", async () => { const ep = el("ar-f-endpoint").value.trim(); if (ep) await testAPI({ name: "测试", endpoint: ep, apiKey: el("ar-f-key").value.trim() }); });
    el("ar-f-save")?.addEventListener("click", () => { const n = el("ar-f-name").value.trim(), ep = el("ar-f-endpoint").value.trim(); if (!n || !ep) return toastr.error("填写名称和地址"); addAPI(n, ep, el("ar-f-key").value.trim(), el("ar-f-model").value.trim()); hideForm(); });
    el("ar-export")?.addEventListener("click", exportConfig);
    el("ar-import")?.addEventListener("click", () => el("ar-file").click());
    el("ar-file")?.addEventListener("change", e => { if (e.target.files[0]) { importConfig(e.target.files[0]); e.target.value = ""; } });
    
    el("ar-list")?.addEventListener("click", async e => {
        const item = e.target.closest(".ar-item"); if (!item) return;
        const id = item.dataset.id, api = s.apiList.find(a => a.id === id);
        if (e.target.classList.contains("ar-chk")) toggleAPI(id);
        else if (e.target.closest(".ar-use")) useAPI(id);
        else if (e.target.closest(".ar-test") && api) await testAPI(api);
        else if (e.target.closest(".ar-up")) moveAPI(id, "up");
        else if (e.target.closest(".ar-down")) moveAPI(id, "down");
        else if (e.target.closest(".ar-del") && confirm("删除?")) deleteAPI(id);
        else if (e.target.closest(".ar-loadm") && api) { const m = await fetchModels(api.endpoint, api.apiKey); if (m.length) { item.querySelector(".ar-msel").innerHTML = '<option value="">默认</option>' + m.map(x => `<option value="${x}"${x === api.model ? ' selected' : ''}>${x}</option>`).join(''); } }
    });
    
    el("ar-list")?.addEventListener("change", e => { if (e.target.classList.contains("ar-msel")) { const item = e.target.closest(".ar-item"); if (item) setAPIModel(item.dataset.id, e.target.value); } });
}

jQuery(() => {
    loadSettings();
    createUI();
    updateUI();
    bindEvents();
    setupSendHook();
    setTimeout(() => { const api = getCurrentAPI(); if (api && getSettings().enabled) { applyToOfficialSettings(api); } }, 1500);
    console.log("[API轮询] 已加载");
});
