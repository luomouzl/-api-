import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "api-rotator";
const defaultSettings = {
    apiList: [],
    currentIndex: 0,
    enabled: true,
    mode: "round-robin",
    autoSwitch: true
};

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

function saveSettings() {
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
    
    if (s.mode === "random") {
        s.currentIndex = Math.floor(Math.random() * list.length);
    } else {
        s.currentIndex = s.currentIndex % list.length;
        s.currentIndex = (s.currentIndex + 1) % list.length;
    }
    saveSettings();
    return list[s.currentIndex];
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
    } catch (e) {
        console.error(e);
    }
    return [];
}

function applyAPI(api) {
    if (!api) return;
    
    const proxy = document.getElementById("openai_reverse_proxy");
    if (proxy) {
        proxy.value = api.endpoint;
        proxy.dispatchEvent(new Event("input", { bubbles: true }));
    }
    
    const key = document.getElementById("api_key_openai");
    if (key) {
        key.value = api.apiKey || "";
        key.dispatchEvent(new Event("input", { bubbles: true }));
    }
    
    if (api.model) {
        setTimeout(() => {
            const sel = document.getElementById("model_openai_select");
            if (sel) {
                let exists = false;
                for (const opt of sel.options) {
                    if (opt.value === api.model) { exists = true; break; }
                }
                if (!exists) {
                    const opt = document.createElement("option");
                    opt.value = api.model;
                    opt.textContent = api.model;
                    sel.appendChild(opt);
                }
                sel.value = api.model;
                sel.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }, 200);
    }
    
    setTimeout(() => {
        const btn = document.getElementById("api_button_openai");
        if (btn) btn.click();
    }, 100);
}

function switchNext() {
    const list = getEnabledAPIs();
    if (list.length < 2) {
        toastr.warning("需要至少2个API");
        return;
    }
    const s = getSettings();
    s.currentIndex = (s.currentIndex + 1) % list.length;
    saveSettings();
    applyAPI(list[s.currentIndex]);
    updateUI();
    toastr.success("已切换: " + list[s.currentIndex].name);
}

function useAPI(id) {
    const s = getSettings();
    const api = s.apiList.find(a => a.id === id);
    if (!api) return;
    const list = getEnabledAPIs();
    const idx = list.findIndex(a => a.id === id);
    if (idx >= 0) s.currentIndex = idx;
    saveSettings();
    applyAPI(api);
    updateUI();
    toastr.success("已切换: " + api.name);
}

function addAPI(name, endpoint, apiKey, model) {
    const s = getSettings();
    s.apiList.push({
        id: Date.now().toString(),
        name: name,
        endpoint: endpoint,
        apiKey: apiKey,
        model: model || "",
        enabled: true
    });
    saveSettings();
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
        saveSettings();
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
        saveSettings();
        updateUI();
    }
}

function moveAPI(id, dir) {
    const s = getSettings();
    const idx = s.apiList.findIndex(a => a.id === id);
    const newIdx = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || newIdx < 0 || newIdx >= s.apiList.length) return;
    const temp = s.apiList[idx];
    s.apiList[idx] = s.apiList[newIdx];
    s.apiList[newIdx] = temp;
    saveSettings();
    updateUI();
}

function setAPIModel(id, model) {
    const s = getSettings();
    const api = s.apiList.find(a => a.id === id);
    if (api) {
        api.model = model;
        saveSettings();
        updateUI();
    }
}

async function testAPI(api) {
    toastr.info("测试中: " + api.name);
    const models = await fetchModels(api.endpoint, api.apiKey);
    if (models.length > 0) {
        toastr.success(api.name + " 成功！" + models.length + "个模型");
        return models;
    } else {
        toastr.error(api.name + " 失败");
        return [];
    }
}

function exportConfig() {
    const s = getSettings();
    const blob = new Blob([JSON.stringify({ apiList: s.apiList }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "api-config.json";
    a.click();
    toastr.success("已导出");
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
                saveSettings();
                updateUI();
                toastr.success("已导入");
            }
        } catch (err) {
            toastr.error("导入失败");
        }
    };
    reader.readAsText(file);
}

function setupInterceptor() {
    const originalFetch = window.fetch;
    window.fetch = async function(url, options) {
        const s = getSettings();
        if (!s.enabled) return originalFetch.apply(this, arguments);
        
        const urlStr = url.toString();
        if (!urlStr.includes("/v1/chat/completions") && !urlStr.includes("/v1/completions")) {
            return originalFetch.apply(this, arguments);
        }
        
        const list = getEnabledAPIs();
        if (list.length === 0) return originalFetch.apply(this, arguments);
        
        const api = getNextAPI();
        if (!api) return originalFetch.apply(this, arguments);
        
        try {
            const base = api.endpoint.replace(/\/+$/, "").replace(/\/v1$/, "");
            const path = urlStr.includes("/v1/chat/completions") ? "/v1/chat/completions" : "/v1/completions";
            const newUrl = base + path;
            
            const newOpts = JSON.parse(JSON.stringify(options || {}));
            newOpts.headers = newOpts.headers || {};
            if (api.apiKey) newOpts.headers["Authorization"] = "Bearer " + api.apiKey;
            
            if (api.model && newOpts.body) {
                try {
                    const body = JSON.parse(newOpts.body);
                    body.model = api.model;
                    newOpts.body = JSON.stringify(body);
                } catch (e) {}
            }
            
            console.log("[API轮询] " + api.name);
            const el = document.getElementById("ar-current");
            if (el) el.textContent = api.name + (api.model ? " (" + api.model + ")" : "");
            
            const res = await originalFetch.call(this, newUrl, newOpts);
            
            if (!res.ok && s.autoSwitch && list.length > 1) {
                toastr.warning(api.name + " 失败，切换中");
                return window.fetch(url, options);
            }
            
            return res;
        } catch (e) {
            if (s.autoSwitch && list.length > 1) {
                toastr.warning(api.name + " 出错，切换中");
                return window.fetch(url, options);
            }
            throw e;
        }
    };
}

function esc(text) {
    const d = document.createElement("div");
    d.textContent = text || "";
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
            <div class="ar-row">
                <select id="ar-mode"><option value="round-robin">顺序</option><option value="random">随机</option></select>
                <button id="ar-next" class="menu_button">下一个</button>
                <label><input type="checkbox" id="ar-auto"> 失败切换</label>
            </div>
            <div id="ar-stats" class="ar-stats">0/0</div>
            <div id="ar-list" class="ar-list"></div>
            <button id="ar-add-btn" class="menu_button ar-wide">➕ 添加API</button>
            <div id="ar-form" style="display:none" class="ar-form">
                <input id="ar-f-name" placeholder="名称">
                <input id="ar-f-endpoint" placeholder="API地址">
                <input id="ar-f-key" type="password" placeholder="密钥">
                <div class="ar-row">
                    <input id="ar-f-model" placeholder="模型(可选)">
                    <button id="ar-f-fetch" class="menu_button">🔄</button>
                </div>
                <select id="ar-f-models" style="display:none"></select>
                <div class="ar-row">
                    <button id="ar-f-test" class="menu_button">测试</button>
                    <button id="ar-f-save" class="menu_button">保存</button>
                    <button id="ar-f-cancel" class="menu_button">取消</button>
                </div>
            </div>
            <div class="ar-row">
                <button id="ar-export" class="menu_button">📤 导出</button>
                <button id="ar-import" class="menu_button">📥 导入</button>
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
    
    const chk = document.getElementById("ar-enabled");
    if (chk) chk.checked = s.enabled;
    
    const mode = document.getElementById("ar-mode");
    if (mode) mode.value = s.mode;
    
    const auto = document.getElementById("ar-auto");
    if (auto) auto.checked = s.autoSwitch;
    
    const curEl = document.getElementById("ar-current");
    if (curEl) curEl.textContent = cur ? cur.name + (cur.model ? " (" + cur.model + ")" : "") : "无";
    
    const stats = document.getElementById("ar-stats");
    if (stats) stats.textContent = list.length + "/" + s.apiList.length + " 已启用";
    
    const listEl = document.getElementById("ar-list");
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
        </div>
    </div>
    <div class="ar-model-row">
        <span>模型:</span>
        <select class="ar-model-sel">
            <option value="">默认</option>
            ${api.model ? '<option value="' + esc(api.model) + '" selected>' + esc(api.model) + '</option>' : ''}
        </select>
        <button class="menu_button ar-load-m" title="加载模型">🔄</button>
    </div>
    <div class="ar-btns">
        <button class="menu_button ar-use" ${isOn ? '' : 'disabled'}>▶ 使用</button>
        <button class="menu_button ar-test">🔌 测试</button>
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
    document.getElementById("ar-f-name").value = "";
    document.getElementById("ar-f-endpoint").value = "";
    document.getElementById("ar-f-key").value = "";
    document.getElementById("ar-f-model").value = "";
    document.getElementById("ar-f-models").style.display = "none";
}

function bindEvents() {
    const s = getSettings();
    
    document.getElementById("ar-enabled")?.addEventListener("change", e => {
        s.enabled = e.target.checked;
        saveSettings();
    });
    
    document.getElementById("ar-mode")?.addEventListener("change", e => {
        s.mode = e.target.value;
        saveSettings();
    });
    
    document.getElementById("ar-auto")?.addEventListener("change", e => {
        s.autoSwitch = e.target.checked;
        saveSettings();
    });
    
    document.getElementById("ar-next")?.addEventListener("click", switchNext);
    document.getElementById("ar-add-btn")?.addEventListener("click", showForm);
    document.getElementById("ar-f-cancel")?.addEventListener("click", hideForm);
    
    document.getElementById("ar-f-fetch")?.addEventListener("click", async () => {
        const ep = document.getElementById("ar-f-endpoint").value.trim();
        const key = document.getElementById("ar-f-key").value.trim();
        if (!ep) { toastr.error("填写地址"); return; }
        
        const models = await fetchModels(ep, key);
        if (models.length > 0) {
            const sel = document.getElementById("ar-f-models");
            sel.innerHTML = '<option value="">选择模型</option>' + models.map(m => '<option value="' + m + '">' + m + '</option>').join('');
            sel.style.display = "block";
            sel.onchange = () => { document.getElementById("ar-f-model").value = sel.value; };
            toastr.success(models.length + "个模型");
        } else {
            toastr.error("获取失败");
        }
    });
    
    document.getElementById("ar-f-test")?.addEventListener("click", async () => {
        const ep = document.getElementById("ar-f-endpoint").value.trim();
        const key = document.getElementById("ar-f-key").value.trim();
        if (!ep) { toastr.error("填写地址"); return; }
        await testAPI({ name: "测试", endpoint: ep, apiKey: key });
    });
    
    document.getElementById("ar-f-save")?.addEventListener("click", () => {
        const name = document.getElementById("ar-f-name").value.trim();
        const ep = document.getElementById("ar-f-endpoint").value.trim();
        const key = document.getElementById("ar-f-key").value.trim();
        const model = document.getElementById("ar-f-model").value.trim();
        if (!name || !ep) { toastr.error("填写名称和地址"); return; }
        addAPI(name, ep, key, model);
        hideForm();
    });
    
    document.getElementById("ar-export")?.addEventListener("click", exportConfig);
    document.getElementById("ar-import")?.addEventListener("click", () => document.getElementById("ar-file").click());
    document.getElementById("ar-file")?.addEventListener("change", e => {
        if (e.target.files[0]) { importConfig(e.target.files[0]); e.target.value = ""; }
    });
    
    document.getElementById("ar-list")?.addEventListener("click", async e => {
        const item = e.target.closest(".ar-item");
        if (!item) return;
        const id = item.dataset.id;
        const s = getSettings();
        const api = s.apiList.find(a => a.id === id);
        
        if (e.target.classList.contains("ar-chk")) { toggleAPI(id); }
        else if (e.target.closest(".ar-use")) { useAPI(id); }
        else if (e.target.closest(".ar-test")) { if (api) await testAPI(api); }
        else if (e.target.closest(".ar-up")) { moveAPI(id, "up"); }
        else if (e.target.closest(".ar-down")) { moveAPI(id, "down"); }
        else if (e.target.closest(".ar-del")) { if (confirm("删除?")) deleteAPI(id); }
        else if (e.target.closest(".ar-load-m")) {
            if (!api) return;
            const models = await fetchModels(api.endpoint, api.apiKey);
            if (models.length > 0) {
                const sel = item.querySelector(".ar-model-sel");
                const cur = sel.value;
                sel.innerHTML = '<option value="">默认</option>' + models.map(m => '<option value="' + m + '"' + (m === cur ? ' selected' : '') + '>' + m + '</option>').join('');
                toastr.success(models.length + "个模型");
            } else {
                toastr.error("获取失败");
            }
        }
    });
    
    document.getElementById("ar-list")?.addEventListener("change", e => {
        if (e.target.classList.contains("ar-model-sel")) {
            const item = e.target.closest(".ar-item");
            if (item) {
                setAPIModel(item.dataset.id, e.target.value);
                toastr.info("模型已更新");
            }
        }
    });
}

jQuery(async () => {
    loadSettings();
    createUI();
    updateUI();
    bindEvents();
    setupInterceptor();
    console.log("[API轮询] 已加载");
});
