import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "multi-api-switcher";

const defaultSettings = {
    apiList: [],
    currentIndex: 0,
    autoSwitch: false
};

function loadSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = {};
    }
    Object.keys(defaultSettings).forEach(key => {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    });
}

function getSettings() {
    return extension_settings[extensionName];
}

function saveSettings() {
    saveSettingsDebounced();
}

function getCurrentAPI() {
    const settings = getSettings();
    const enabledList = settings.apiList.filter(api => api.enabled !== false);
    if (enabledList.length === 0) return null;
    const index = settings.currentIndex % enabledList.length;
    return enabledList[index];
}

function switchToNext() {
    const settings = getSettings();
    const enabledList = settings.apiList.filter(api => api.enabled !== false);
    if (enabledList.length <= 1) {
        toastr.warning("只有一个可用API");
        return;
    }
    settings.currentIndex = (settings.currentIndex + 1) % enabledList.length;
    const newAPI = enabledList[settings.currentIndex];
    applyAPI(newAPI);
    saveSettings();
    updateUI();
    toastr.success("已切换到: " + newAPI.name);
}

function applyAPI(api) {
    if (!api) return;
    
    const proxyInput = document.getElementById("openai_reverse_proxy");
    if (proxyInput) {
        proxyInput.value = api.endpoint;
        proxyInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    
    const keyInput = document.getElementById("api_key_openai");
    if (keyInput) {
        keyInput.value = api.apiKey;
        keyInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    
    setTimeout(() => {
        const connectBtn = document.getElementById("api_button_openai");
        if (connectBtn) connectBtn.click();
    }, 100);
}

function addAPI(name, endpoint, apiKey) {
    const settings = getSettings();
    settings.apiList.push({
        id: Date.now().toString(),
        name: name,
        endpoint: endpoint,
        apiKey: apiKey,
        enabled: true
    });
    saveSettings();
    updateUI();
    toastr.success("已添加: " + name);
}

function deleteAPI(id) {
    const settings = getSettings();
    const index = settings.apiList.findIndex(api => api.id === id);
    if (index > -1) {
        const name = settings.apiList[index].name;
        settings.apiList.splice(index, 1);
        if (settings.currentIndex >= settings.apiList.length) {
            settings.currentIndex = 0;
        }
        saveSettings();
        updateUI();
        toastr.info("已删除: " + name);
    }
}

function useAPI(id) {
    const settings = getSettings();
    const enabledList = settings.apiList.filter(api => api.enabled !== false);
    const index = enabledList.findIndex(api => api.id === id);
    if (index > -1) {
        settings.currentIndex = index;
        applyAPI(enabledList[index]);
        saveSettings();
        updateUI();
        toastr.success("已切换到: " + enabledList[index].name);
    }
}

function toggleEnabled(id) {
    const settings = getSettings();
    const api = settings.apiList.find(api => api.id === id);
    if (api) {
        api.enabled = !api.enabled;
        saveSettings();
        updateUI();
    }
}

function createUI() {
    const html = `
    <div id="multi-api-switcher-panel">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🔄 多API轮换</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="api-switcher-status">
                    <span>当前: <strong id="current-api-display">未配置</strong></span>
                    <button id="btn-switch-next" class="menu_button">
                        <i class="fa-solid fa-forward"></i> 切换下一个
                    </button>
                </div>
                
                <div class="api-settings-section">
                    <label>
                        <input type="checkbox" id="chk-auto-switch">
                        请求出错时自动切换
                    </label>
                </div>
                
                <h4>API列表</h4>
                <div id="api-list-box" class="api-list-box"></div>
                
                <button id="btn-show-add-form" class="menu_button" style="width:100%;margin-top:10px;">
                    <i class="fa-solid fa-plus"></i> 添加新API
                </button>
                
                <div id="api-add-form" class="api-add-form" style="display:none;">
                    <label>名称</label>
                    <input type="text" id="input-api-name" placeholder="例如：中转站A">
                    
                    <label>API地址</label>
                    <input type="text" id="input-api-endpoint" placeholder="https://api.example.com/v1">
                    
                    <label>API Key</label>
                    <input type="text" id="input-api-key" placeholder="sk-xxx">
                    
                    <div class="api-add-form-buttons">
                        <button id="btn-save-api" class="menu_button">
                            <i class="fa-solid fa-check"></i> 保存
                        </button>
                        <button id="btn-cancel-add" class="menu_button">
                            <i class="fa-solid fa-times"></i> 取消
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    
    const container = document.getElementById("extensions_settings");
    if (container) {
        container.insertAdjacentHTML("beforeend", html);
    }
}

function updateUI() {
    const settings = getSettings();
    const currentAPI = getCurrentAPI();
    
    const display = document.getElementById("current-api-display");
    if (display) {
        display.textContent = currentAPI ? currentAPI.name : "未配置";
    }
    
    const autoChk = document.getElementById("chk-auto-switch");
    if (autoChk) {
        autoChk.checked = settings.autoSwitch;
    }
    
    const listBox = document.getElementById("api-list-box");
    if (listBox) {
        if (settings.apiList.length === 0) {
            listBox.innerHTML = '<div style="padding:20px;text-align:center;opacity:0.6;">还没有添加API</div>';
        } else {
            listBox.innerHTML = settings.apiList.map(api => {
                const isCurrent = currentAPI && currentAPI.id === api.id;
                const isEnabled = api.enabled !== false;
                return `
                <div class="api-item ${isCurrent ? 'current' : ''} ${!isEnabled ? 'disabled' : ''}" data-id="${api.id}">
                    <div class="api-item-info">
                        <div class="api-item-name">${isCurrent ? '✓ ' : ''}${api.name}</div>
                        <div class="api-item-endpoint">${api.endpoint}</div>
                    </div>
                    <div class="api-item-actions">
                        <button class="menu_button btn-use" title="使用" ${!isEnabled ? 'disabled' : ''}>
                            <i class="fa-solid fa-play"></i>
                        </button>
                        <button class="menu_button btn-toggle" title="${isEnabled ? '禁用' : '启用'}">
                            <i class="fa-solid fa-${isEnabled ? 'eye' : 'eye-slash'}"></i>
                        </button>
                        <button class="menu_button btn-delete" title="删除">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>`;
            }).join('');
        }
    }
}

function bindEvents() {
    document.getElementById("btn-switch-next")?.addEventListener("click", () => {
        switchToNext();
    });
    
    document.getElementById("chk-auto-switch")?.addEventListener("change", (e) => {
        getSettings().autoSwitch = e.target.checked;
        saveSettings();
    });
    
    document.getElementById("btn-show-add-form")?.addEventListener("click", () => {
        document.getElementById("api-add-form").style.display = "block";
        document.getElementById("btn-show-add-form").style.display = "none";
    });
    
    document.getElementById("btn-cancel-add")?.addEventListener("click", () => {
        document.getElementById("api-add-form").style.display = "none";
        document.getElementById("btn-show-add-form").style.display = "block";
        clearForm();
    });
    
    document.getElementById("btn-save-api")?.addEventListener("click", () => {
        const name = document.getElementById("input-api-name").value.trim();
        const endpoint = document.getElementById("input-api-endpoint").value.trim();
        const apiKey = document.getElementById("input-api-key").value.trim();
        
        if (!name || !endpoint || !apiKey) {
            toastr.error("请填写完整信息");
            return;
        }
        
        addAPI(name, endpoint, apiKey);
        document.getElementById("api-add-form").style.display = "none";
        document.getElementById("btn-show-add-form").style.display = "block";
        clearForm();
    });
    
    document.getElementById("api-list-box")?.addEventListener("click", (e) => {
        const item = e.target.closest(".api-item");
        if (!item) return;
        const id = item.dataset.id;
        
        if (e.target.closest(".btn-use")) {
            useAPI(id);
        } else if (e.target.closest(".btn-toggle")) {
            toggleEnabled(id);
        } else if (e.target.closest(".btn-delete")) {
            if (confirm("确定删除？")) {
                deleteAPI(id);
            }
        }
    });
}

function clearForm() {
    document.getElementById("input-api-name").value = "";
    document.getElementById("input-api-endpoint").value = "";
    document.getElementById("input-api-key").value = "";
}

jQuery(async () => {
    loadSettings();
    createUI();
    bindEvents();
    updateUI();
    console.log("[多API轮换] 插件已加载");
});
