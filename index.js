import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";
import { oai_settings, saveOpenAISettings } from "../../../openai.js";

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

// 核心函数：直接修改ST官方设置
function applyToOfficialSettings(api) {
    if (!api) return false;
    
    try {
        // 直接修改 oai_settings 对象（ST内部设置）
        oai_settings.reverse_proxy = api.endpoint;
        oai_settings.proxy_password = api.apiKey || "";
        
        if (api.model) {
            oai_settings.openai_model = api.model;
        }
        
        // 同步更新UI显示
        const proxyInput = document.getElementById("openai_reverse_proxy");
        if (proxyInput) proxyInput.value = api.endpoint;
        
        const keyInput = document.getElementById("api_key_openai");
        if (keyInput) keyInput.value = api.apiKey || "";
        
        if (api.model) {
            const modelSelect = document.getElementById("model_openai_select");
            if (modelSelect) {
                // 确保选项存在
                if (!Array.from(modelSelect.options).some(o => o.value === api.model)) {
                    const opt = document.createElement("option");
                    opt.value = api.model;
                    opt.textContent = api.model;
                    modelSelect.appendChild(opt);
                }
                modelSelect.value = api.model;
            }
        }
        
        // 保存设置
        saveOpenAISettings();
        
        console.log(`[API轮询] ✓ 已应用: ${api.name} → ${api.endpoint} [${api.model || '默认'}]`);
        return true;
        
    } catch (e) {
        console.error("[API轮询] 应用失败:", e);
        return false;
    }
}

// 显示通知
function showNotification(api) {
    const s = getSettings();
    if (!s.showNotification) return;
    
    toastr.info(`🔄 ${api.name}${api.model ? ` [${api.model}]` : ""}`, "API已切换", {
        timeOut: 2000,
        positionClass: "toast-top-center"
    });
}

// 切换到下一个API
function switchToNext() {
    const s = getSettings();
    const list = getEnabledAPIs();
    if (list.length <= 1) return getCurrentAPI();
    
    s.currentIndex = (s.currentIndex + 1) % list.length;
    lastUsedIndex = s.currentIndex;
    savePluginSettings();
    return list[s.currentIndex];
}

// 手动切换
async function manualSwitch() {
    const list = getEnabledAPIs();
    if (list.length < 2) {
        toastr.warning("需要至少2个API");
        return;
    }
    const api = switchToNext();
    applyToOfficialSettings(api);
    updateUI();
    toastr.success("已切换: " + api.name);
}

// 使用指定API
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

// 立即应用当前API
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

// 监听发送按钮
function setupSendHook() {
    const hook = () => {
        const s = getSettings();
        if (!s.enabled) return;
        
        const list = getEnabledAPIs();
        if (list.length === 0) return;
        
        const api = getAPIForRequest();
        if (api) {
            requestCount++;
            console.log(`[API轮询] 请求 #${requestCount} → ${api.name}`);
            applyToOfficialSettings(api);
            showNotification(api);
            updateUI();
        }
    };
    
    // 监听发送按钮
    const patchSendButton = () => {
        const btn = document.getElementById("send_but");
        if (btn && !btn._arHooked) {
            btn._arHooked = true;
            btn.addEventListener("mousedown", hook, true);
            console.log("[API轮询] 发送按钮已挂钩");
        }
    };
    
    // 监听回车
    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            const ta = document.getElementById("send_textarea");
            if (ta && document.activeElement === ta && ta.value.trim()) {
                hook();
            }
        }
    }, true);
    
    patchSendButton();
    new MutationObserver(patchSendButton).observe(document.body, { childList: true, subtree: true });
}

// API管理函数
function addAPI(name, endpoint, apiKey, model) {
    const s = getSettings();
    s.apiList.push({
        id: Date.now().toString(),
        name, endpoint, apiKey,
        model: model || "",
        enabled: true
    });
    savePluginSettings();
    updateUI();
    toastr.success("已添加: " + name);
}

function deleteAPI(id) {
    const s = getSettings();
    const idx = s.apiList.findIndex(a => a.id === id);
    if (idx >= 0) {
        const name = s.apiList[idx].name;
        s.apiList.splice(idx, 1);
        if (s.currentIndex >= getEnabledAPIs().length) s.currentIndex = 0;
        savePluginSettings();
        updateUI();
        toastr.info("已删除: " + name);
    }
}

function toggleAPI(id) {
    const s = getSettings();
    const api = s.apiList.find(a => a.id === id);
    if (api) {
        api.enabled = !api.enabled;
        if (s.currentIndex >= getEnabledAPIs().length) s.currentIndex = 0;
        savePluginSettings();
        updateUI();
    }
}

function moveAPI(id, dir) {
    const s = getSettings();
    const idx = s.apiList.findIndex(a => a.id === id);
    const newIdx = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || newIdx < 0 || newIdx >= s.apiList.length) return;
    [s.apiList[idx], s.apiList[newIdx]] = [s.apiList[newIdx], s.apiList[idx]];
    savePluginSettings();
    updateUI();
}

function setAPIModel(id, model) {
    const s = getSettings();
    const api = s.apiList.find(a => a.id === id);
    if (api) {
        api.model = model;
        savePluginSettings();
        updateUI();
    }
}

async function fetchModels(endpoint, apiKey) {
    try {
        const base = endpoint.replace(/\/+$/, "").replace(/\/v1$/, "");
        const res = await fetch(base + "/v1/models", {
            headers: apiKey ? { "Authorization": "Bearer " + apiKey } : {}
        });
        if (res.ok) {
            const data = await res.json();
            if (data.data) return data.data.map(m => m.id).sort();
        }
    } catch (e) {}
    return [];
}

async function testAPI(api) {
    toastr.info("测试: " + api.name);
    const models = await fetchModels(api.endpoint, api.apiKey);
    if (models.length > 0) {
        toastr.success(`${api.name} 成功！${models.length}个模型`);
        return models;
    }
    toastr.error(api.name + " 失败");
    return [];
}

function exportConfig() {
    const blob = new Blob([JSON.stringify({ apiList: getSettings().apiList }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "api-config.json";
    a.click();
}

function importConfig(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.apiList) {
                const s = getSettings();
                data.apiList.forEach(api => {
                    s.apiList.push({
                        id: Date.now().toString() + Math.random(),
                        name: api.name || "未命名",
                        endpoint: api.endpoint || "",
                        apiKey: api.apiKey || "",
                        model: api.model || "",
                        enabled: true
                    });
                });
                savePluginSettings();
                updateUI();
                toastr.success("已导入");
            }
        } catch (e) {
            toastr.error("导入失败");
        }
    };
    reader.readAsText(file);
}

function esc(t) {
    const d = document.createElement("div");
    d.textContent = t || "";
    return d.innerHTML;
}

function createUI() {
    const html = `
<div id="ar-panel">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>🔄 API轮询切换器</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="ar-row">
                <label><input type="checkbox" id="ar-enabled"> 启用</label>
                <span>当前: <b id="ar-current">无</b></span>
            </div>
            
            <div class="ar-section">切换模式</div>
            <div class="ar-row">
                <select id="ar-switch-mode" class="ar-select">
                    <option value="every-request">每次请求切换</option>
                    <option value="on-error">固定使用</option>
                </select>
                <select id="ar-rotate-mode" class="ar-select">
                    <option value="round-robin">顺序</option>
                    <option value="random">随机</option>
                </select>
            </div>
            
            <div class="ar-row">
                <button id="ar-next" class="menu_button">⏭ 下一个</button>
                <button id="ar-apply" class="menu_button">⚡ 立即应用</button>
            </div>
            
            <div class="ar-row">
                <label><input type="checkbox" id="ar-notify"> 显示切换提示</label>
            </div>
            
            <div id="ar-stats" class="ar-stats">0/0 | 请求: 0</div>
            <div id="ar-list" class="ar-list"></div>
            
            <button id="ar-add-btn" class="menu_button ar-wide">➕ 添加API</button>
            <div id="ar-form" style="display:none" class="ar-form">
                <input id="ar-f-name" placeholder="名称">
                <input id="ar-f-endpoint" placeholder="API地址">
                <input id="ar-f-key" type="password" placeholder="API密钥">
                <div class="ar-row">
                    <input id="ar-f-model" placeholder="模型(可选)">
                    <button id="ar-f-fetch" class="menu_button">🔄</button>
                </div>
                <select id="ar-f-models" style="display:none"></select>
                <div class="ar-row">
                    <button id="ar-f-test" class="menu_button">🔌</button>
                    <button id="ar-f-save" class="menu_button">💾</button>
                    <button id="ar-f-cancel" class="menu_button">❌</button>
                </div>
            </div>
            <div class="ar-row">
                <button id="ar-export" class="menu_button">📤</button>
                <button id="ar-import" class="menu_button">📥</button>
                <input type="file" id="ar-file" accept=".json" style="display:none">
            </div>
        </div>
    </div>
</div>`;
    document.getElementById("extensions_settings")?.insertAdjacentHTML("beforeend", html);
}

function updateUI() {
    const s = getSettings();
    const cur = getCurrentAPI();
    const list = getEnabledAPIs();
    
    const el = (id) => document.getElementById(id);
    
    if (el("ar-enabled")) el("ar-enabled").checked = s.enabled;
    if (el("ar-switch-mode")) el("ar-switch-mode").value = s.switchMode;
    if (el("ar-rotate-mode")) el("ar-rotate-mode").value = s.rotateMode;
    if (el("ar-notify")) el("ar-notify").checked = s.showNotification;
    if (el("ar-current")) el("ar-current").textContent = cur ? `${cur.name}${cur.model ? ` (${cur.model})` : ""}` : "无";
    if (el("ar-stats")) el("ar-stats").textContent = `${list.length}/${s.apiList.length} | 请求: ${requestCount}`;
    
    const listEl = el("ar-list");
    if (!listEl) return;
    
    if (s.apiList.length === 0) {
        listEl.innerHTML = '<div class="ar-empty">暂无API</div>';
        return;
    }
    
    listEl.innerHTML = s.apiList.map((api, i) => {
        const isCur = cur && cur.id === api.id;
        const isOn = api.enabled !== false;
        return `
<div class="ar-item ${isCur ? 'ar-cur' : ''} ${isOn ? '' : 'ar-off'}" data-id="${api.id}">
    <div class="ar-item-top">
        <input type="checkbox" class="ar-chk" ${isOn ? 'checked' : ''}>
        <div class="ar-info">
            <div class="ar-name">${isCur ? '▶ ' : ''}${esc(api.name)}</div>
            <div class="ar-url">${esc(api.endpoint)}</div>
            ${api.model ? `<div class="ar-model-tag">${esc(api.model)}</div>` : ''}
        </div>
    </div>
    <div class="ar-model-row">
        <select class="ar-model-sel">
            <option value="">默认模型</option>
            ${api.model ? `<option value="${esc(api.model)}" selected>${esc(api.model)}</option>` : ''}
        </select>
        <button class="menu_button ar-load-m">🔄</button>
    </div>
    <div class="ar-btns">
        <button class="menu_button ar-use" ${isOn ? '' : 'disabled'}>▶</button>
        <button class="menu_button ar-test">🔌</button>
        <button class="menu_button ar-up" ${i === 0 ? 'disabled' : ''}>⬆</button>
        <button class="menu_button ar-down" ${i === s.apiList.length - 1 ? 'disabled' : ''}>⬇</button>
        <button class="menu_button ar-del">🗑</button>
    </div>
</div>`;
    }).join('');
}

function showForm() {
    document.getElementById("ar-form").style.display = "block";
    document.getElementById("ar-add-btn").style.display = "none";
}

function hideForm() {
    document.getElementById("ar-form").style.display = "none";
    document.getElementById("ar-add-btn").style.display = "block";
    ["ar-f-name", "ar-f-endpoint", "ar-f-key", "ar-f-model"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    document.getElementById("ar-f-models").style.display = "none";
}

function bindEvents() {
    const el = (id) => document.getElementById(id);
    const s = getSettings();
    
    el("ar-enabled")?.addEventListener("change", e => { s.enabled = e.target.checked; savePluginSettings(); });
    el("ar-switch-mode")?.addEventListener("change", e => { s.switchMode = e.target.value; savePluginSettings(); updateUI(); });
    el("ar-rotate-mode")?.addEventListener("change", e => { s.rotateMode = e.target.value; savePluginSettings(); });
    el("ar-notify")?.addEventListener("change", e => { s.showNotification = e.target.checked; savePluginSettings(); });
    
    el("ar-next")?.addEventListener("click", manualSwitch);
    el("ar-apply")?.addEventListener("click", applyNow);
    el("ar-add-btn")?.addEventListener("click", showForm);
    el("ar-f-cancel")?.addEventListener("click", hideForm);
    
    el("ar-f-fetch")?.addEventListener("click", async () => {
        const ep = el("ar-f-endpoint").value.trim();
        const key = el("ar-f-key").value.trim();
        if (!ep) return toastr.error("填写地址");
        
        const models = await fetchModels(ep, key);
        if (models.length > 0) {
            const sel = el("ar-f-models");
            sel.innerHTML = '<option value="">选择</option>' + models.map(m => `<option value="${m}">${m}</option>`).join('');
            sel.style.display = "block";
            sel.onchange = () => el("ar-f-model").value = sel.value;
            toastr.success(models.length + "个模型");
        } else {
            toastr.error("获取失败");
        }
    });
    
    el("ar-f-test")?.addEventListener("click", async () => {
        const ep = el("ar-f-endpoint").value.trim();
        const key = el("ar-f-key").value.trim();
        if (ep) await testAPI({ name: "测试", endpoint: ep, apiKey: key });
    });
    
    el("ar-f-save")?.addEventListener("click", () => {
        const name = el("ar-f-name").value.trim();
        const ep = el("ar-f-endpoint").value.trim();
        const key = el("ar-f-key").value.trim();
        const model = el("ar-f-model").value.trim();
        if (!name || !ep) return toastr.error("填写名称和地址");
        addAPI(name, ep, key, model);
        hideForm();
    });
    
    el("ar-export")?.addEventListener("click", exportConfig);
    el("ar-import")?.addEventListener("click", () => el("ar-file").click());
    el("ar-file")?.addEventListener("change", e => { if (e.target.files[0]) { importConfig(e.target.files[0]); e.target.value = ""; } });
    
    el("ar-list")?.addEventListener("click", async e => {
        const item = e.target.closest(".ar-item");
        if (!item) return;
        const id = item.dataset.id;
        const api = s.apiList.find(a => a.id === id);
        
        if (e.target.classList.contains("ar-chk")) toggleAPI(id);
        else if (e.target.closest(".ar-use")) useAPI(id);
        else if (e.target.closest(".ar-test") && api) await testAPI(api);
        else if (e.target.closest(".ar-up")) moveAPI(id, "up");
        else if (e.target.closest(".ar-down")) moveAPI(id, "down");
        else if (e.target.closest(".ar-del") && confirm("删除?")) deleteAPI(id);
        else if (e.target.closest(".ar-load-m") && api) {
            const models = await fetchModels(api.endpoint, api.apiKey);
            if (models.length > 0) {
                const sel = item.querySelector(".ar-model-sel");
                sel.innerHTML = '<option value="">默认</option>' + models.map(m => `<option value="${m}"${m === api.model ? ' selected' : ''}>${m}</option>`).join('');
                toastr.success(models.length + "个模型");
            }
        }
    });
    
    el("ar-list")?.addEventListener("change", e => {
        if (e.target.classList.contains("ar-model-sel")) {
            const item = e.target.closest(".ar-item");
            if (item) setAPIModel(item.dataset.id, e.target.value);
        }
    });
}

// 初始化
jQuery(() => {
    try {
        loadSettings();
        createUI();
        updateUI();
        bindEvents();
        setupSendHook();
        
        // 启动时应用当前API
        setTimeout(() => {
            const api = getCurrentAPI();
            if (api && getSettings().enabled) {
                applyToOfficialSettings(api);
                console.log("[API轮询] 初始化完成，当前:", api.name);
            }
        }, 1500);
        
        console.log("[API轮询] 插件已加载");
    } catch (e) {
        console.error("[API轮询] 错误:", e);
    }
});
