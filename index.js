import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "multi-api-switcher";
const defaultSettings = {
    apiList: [],
    currentId: null,
    autoSwitch: true,
    autoSwitchOnError: true
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
    if (!settings.currentId) return null;
    return settings.apiList.find(api => api.id === settings.currentId) || null;
}

async function testConnection(api) {
    try {
        const response = await fetch(api.endpoint + "/models", {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + api.apiKey,
                "Content-Type": "application/json"
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const models = data.data || data.models || [];
            return { 
                success: true, 
                models: models.map(m => m.id || m.name || m),
                message: "连接成功，找到 " + models.length + " 个模型"
            };
        } else {
            const errorText = await response.text();
            return { 
                success: false, 
                models: [],
                message: "连接失败: " + response.status + " " + errorText.substring(0, 100)
            };
        }
    } catch (error) {
        return { 
            success: false, 
            models: [],
            message: "连接错误: " + error.message
        };
    }
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
    
    if (api.model) {
        const modelInput = document.getElementById("model_openai_select");
        if (modelInput) {
            modelInput.value = api.model;
            modelInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
        const modelTextInput = document.querySelector('input[name="model_openai"]');
        if (modelTextInput) {
            modelTextInput.value = api.model;
            modelTextInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }
    
    setTimeout(() => {
        const connectBtn = document.getElementById("api_button_openai");
        if (connectBtn) connectBtn.click();
    }, 200);
}

function useAPI(id) {
    const settings = getSettings();
    const api = settings.apiList.find(a => a.id === id);
    if (!api) return;
    
    settings.currentId = id;
    applyAPI(api);
    saveSettings();
    updateUI();
    toastr.success("已切换到: " + api.name);
}

function switchToNext() {
    const settings = getSettings();
    const enabledList = settings.apiList.filter(api => api.enabled !== false);
    if (enabledList.length <= 1) {
        toastr.warning("没有其他可用的API");
        return;
    }
    
    const currentIndex = enabledList.findIndex(api => api.id === settings.currentId);
    const nextIndex = (currentIndex + 1) % enabledList.length;
    const nextAPI = enabledList[nextIndex];
    
    useAPI(nextAPI.id);
}

function addAPI(data) {
    const settings = getSettings();
    const newAPI = {
        id: Date.now().toString(),
        name: data.name,
        endpoint: data.endpoint.replace(/\/$/, ""),
        apiKey: data.apiKey,
        model: data.model || "",
        models: data.models || [],
        enabled: true,
        lastTest: null,
        lastTestSuccess: null
    };
    settings.apiList.push(newAPI);
    
    if (!settings.currentId) {
        settings.currentId = newAPI.id;
    }
    
    saveSettings();
    updateUI();
    toastr.success("已添加: " + newAPI.name);
    return newAPI;
}

function updateAPI(id, data) {
    const settings = getSettings();
    const api = settings.apiList.find(a => a.id === id);
    if (!api) return;
    
    Object.assign(api, data);
    saveSettings();
    updateUI();
    toastr.success("已更新: " + api.name);
}

function deleteAPI(id) {
    const settings = getSettings();
    const index = settings.apiList.findIndex(a => a.id === id);
    if (index === -1) return;
    
    const name = settings.apiList[index].name;
    settings.apiList.splice(index, 1);
    
    if (settings.currentId === id) {
        settings.currentId = settings.apiList[0]?.id || null;
    }
    
    saveSettings();
    updateUI();
    toastr.info("已删除: " + name);
}

function toggleEnabled(id) {
    const settings = getSettings();
    const api = settings.apiList.find(a => a.id === id);
    if (!api) return;
    
    api.enabled = !api.enabled;
    saveSettings();
    updateUI();
}

function createUI() {
    const html = `
    <div id="multi-api-panel">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🔄 多API轮换管理</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
            </div>
            <div class="inline-drawer-content">
                
                <div class="api-current-box">
                    <h4>📡 当前使用</h4>
                    <div class="api-current-info" id="current-api-info">
                        <div><span class="label">名称:</span><span class="value" id="cur-name">未配置</span></div>
                        <div><span class="label">地址:</span><span class="value" id="cur-endpoint">-</span></div>
                        <div><span class="label">模型:</span><span class="value" id="cur-model">-</span></div>
                    </div>
                </div>
                
                <div class="api-actions-bar">
                    <button id="btn-switch-next" class="menu_button">
                        <i class="fa-solid fa-forward"></i> 切换下一个
                    </button>
                    <button id="btn-test-current" class="menu_button">
                        <i class="fa-solid fa-plug"></i> 测试当前
                    </button>
                    <button id="btn-refresh-models" class="menu_button">
                        <i class="fa-solid fa-rotate"></i> 刷新模型
                    </button>
                </div>
                
                <div id="test-result-box"></div>
                
                <div class="settings-section">
                    <label>
                        <input type="checkbox" id="chk-auto-switch-error">
                        请求出错时自动切换到下一个API
                    </label>
                </div>
                
                <h4 style="margin: 15px 0 10px 0;">📋 API列表</h4>
                <div class="api-list-container" id="api-list-container">
                    <div style="padding: 20px; text-align: center; opacity: 0.6;">
                        还没有添加API，点击下方按钮添加
                    </div>
                </div>
                
                <button id="btn-add-api" class="menu_button" style="width: 100%;">
                    <i class="fa-solid fa-plus"></i> 添加新API
                </button>
                
                <div class="api-form-box" id="api-form-box">
                    <h4 id="form-title">添加新API</h4>
                    <input type="hidden" id="form-edit-id">
                    
                    <label>备注名称 *</label>
                    <input type="text" id="form-name" placeholder="例如：中转站A、官方API">
                    
                    <label>API地址 *</label>
                    <input type="text" id="form-endpoint" placeholder="https://api.example.com/v1">
                    
                    <label>API Key *</label>
                    <input type="password" id="form-apikey" placeholder="sk-xxx...">
                    
                    <div style="margin-top: 10px;">
                        <button id="btn-form-test" class="menu_button" style="width: 100%;">
                            <i class="fa-solid fa-plug"></i> 测试连接并获取模型
                        </button>
                    </div>
                    
                    <div id="form-test-result"></div>
                    
                    <div class="model-select-box" id="model-select-box" style="display: none;">
                        <label>选择模型</label>
                        <select id="form-model">
                            <option value="">-- 请先测试连接 --</option>
                        </select>
                    </div>
                    
                    <div class="api-form-buttons">
                        <button id="btn-form-save" class="menu_button">
                            <i class="fa-solid fa-check"></i> 保存
                        </button>
                        <button id="btn-form-cancel" class="menu_button">
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
    
    document.getElementById("cur-name").textContent = currentAPI?.name || "未配置";
    document.getElementById("cur-endpoint").textContent = currentAPI?.endpoint || "-";
    document.getElementById("cur-model").textContent = currentAPI?.model || "-";
    
    document.getElementById("chk-auto-switch-error").checked = settings.autoSwitchOnError;
    
    const listContainer = document.getElementById("api-list-container");
    if (settings.apiList.length === 0) {
        listContainer.innerHTML = `
            <div style="padding: 20px; text-align: center; opacity: 0.6;">
                还没有添加API，点击下方按钮添加
            </div>`;
    } else {
        listContainer.innerHTML = settings.apiList.map(api => {
            const isActive = api.id === settings.currentId;
            const isEnabled = api.enabled !== false;
            let statusClass = "";
            if (api.lastTestSuccess === true) statusClass = "online";
            else if (api.lastTestSuccess === false) statusClass = "offline";
            
            return `
            <div class="api-card ${isActive ? 'active' : ''} ${!isEnabled ? 'disabled' : ''}" data-id="${api.id}">
                <div class="api-card-header">
                    <div class="api-card-name">
                        <span class="status-dot ${statusClass}"></span>
                        ${isActive ? '✓ ' : ''}${api.name}
                    </div>
                </div>
                <div class="api-card-details">
                    <div>📍 ${api.endpoint}</div>
                    <div>🤖 ${api.model || '未选择模型'}</div>
                    ${api.lastTest ? '<div>🕐 上次测试: ' + new Date(api.lastTest).toLocaleString() + '</div>' : ''}
                </div>
                <div class="api-card-actions">
                    <button class="menu_button btn-use" ${!isEnabled ? 'disabled' : ''}>
                        <i class="fa-solid fa-play"></i> 使用
                    </button>
                    <button class="menu_button btn-test">
                        <i class="fa-solid fa-plug"></i> 测试
                    </button>
                    <button class="menu_button btn-edit">
                        <i class="fa-solid fa-pen"></i> 编辑
                    </button>
                    <button class="menu_button btn-toggle">
                        <i class="fa-solid fa-${isEnabled ? 'eye' : 'eye-slash'}"></i>
                    </button>
                    <button class="menu_button btn-delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;
        }).join("");
    }
}

function showForm(editId = null) {
    const formBox = document.getElementById("api-form-box");
    const settings = getSettings();
    
    document.getElementById("form-edit-id").value = editId || "";
    document.getElementById("form-title").textContent = editId ? "编辑API" : "添加新API";
    
    if (editId) {
        const api = settings.apiList.find(a => a.id === editId);
        if (api) {
            document.getElementById("form-name").value = api.name;
            document.getElementById("form-endpoint").value = api.endpoint;
            document.getElementById("form-apikey").value = api.apiKey;
            document.getElementById("form-model").value = api.model || "";
            
            if (api.models && api.models.length > 0) {
                updateModelSelect(api.models, api.model);
            }
        }
    } else {
        document.getElementById("form-name").value = "";
        document.getElementById("form-endpoint").value = "";
        document.getElementById("form-apikey").value = "";
        document.getElementById("form-model").innerHTML = '<option value="">-- 请先测试连接 --</option>';
        document.getElementById("model-select-box").style.display = "none";
    }
    
    document.getElementById("form-test-result").innerHTML = "";
    formBox.classList.add("show");
    document.getElementById("btn-add-api").style.display = "none";
}

function hideForm() {
    document.getElementById("api-form-box").classList.remove("show");
    document.getElementById("btn-add-api").style.display = "block";
}

function updateModelSelect(models, selectedModel = "") {
    const select = document.getElementById("form-model");
    select.innerHTML = models.map(m => 
        `<option value="${m}" ${m === selectedModel ? 'selected' : ''}>${m}</option>`
    ).join("");
    document.getElementById("model-select-box").style.display = "block";
}

function bindEvents() {
    document.getElementById("btn-switch-next")?.addEventListener("click", switchToNext);
    
    document.getElementById("btn-test-current")?.addEventListener("click", async () => {
        const api = getCurrentAPI();
        if (!api) {
            toastr.warning("请先选择一个API");
            return;
        }
        
        const resultBox = document.getElementById("test-result-box");
        resultBox.innerHTML = '<div class="test-result loading">⏳ 正在测试连接...</div>';
        
        const result = await testConnection(api);
        
        api.lastTest = Date.now();
        api.lastTestSuccess = result.success;
        if (result.success && result.models.length > 0) {
            api.models = result.models;
        }
        saveSettings();
        updateUI();
        
        resultBox.innerHTML = `<div class="test-result ${result.success ? 'success' : 'error'}">
            ${result.success ? '✅' : '❌'} ${result.message}
        </div>`;
    });
    
    document.getElementById("btn-refresh-models")?.addEventListener("click", async () => {
        const api = getCurrentAPI();
        if (!api) {
            toastr.warning("请先选择一个API");
            return;
        }
        
        toastr.info("正在获取模型列表...");
        const result = await testConnection(api);
        
        if (result.success && result.models.length > 0) {
            api.models = result.models;
            saveSettings();
            toastr.success("获取到 " + result.models.length + " 个模型");
        } else {
            toastr.error(result.message);
        }
    });
    
    document.getElementById("chk-auto-switch-error")?.addEventListener("change", (e) => {
        getSettings().autoSwitchOnError = e.target.checked;
        saveSettings();
    });
    
    document.getElementById("btn-add-api")?.addEventListener("click", () => showForm());
    
    document.getElementById("btn-form-test")?.addEventListener("click", async () => {
        const endpoint = document.getElementById("form-endpoint").value.trim();
        const apiKey = document.getElementById("form-apikey").value.trim();
        
        if (!endpoint || !apiKey) {
            toastr.error("请填写API地址和Key");
            return;
        }
        
        const resultBox = document.getElementById("form-test-result");
        resultBox.innerHTML = '<div class="test-result loading">⏳ 正在测试连接...</div>';
        
        const result = await testConnection({ endpoint: endpoint.replace(/\/$/, ""), apiKey });
        
        resultBox.innerHTML = `<div class="test-result ${result.success ? 'success' : 'error'}">
            ${result.success ? '✅' : '❌'} ${result.message}
        </div>`;
        
        if (result.success && result.models.length > 0) {
            updateModelSelect(result.models);
        }
    });
    
    document.getElementById("btn-form-save")?.addEventListener("click", () => {
        const editId = document.getElementById("form-edit-id").value;
        const name = document.getElementById("form-name").value.trim();
        const endpoint = document.getElementById("form-endpoint").value.trim();
        const apiKey = document.getElementById("form-apikey").value.trim();
        const model = document.getElementById("form-model").value;
        
        if (!name || !endpoint || !apiKey) {
            toastr.error("请填写完整信息（名称、地址、Key）");
            return;
        }
        
        const data = { name, endpoint: endpoint.replace(/\/$/, ""), apiKey, model };
        
        if (editId) {
            updateAPI(editId, data);
        } else {
            addAPI(data);
        }
        
        hideForm();
    });
    
    document.getElementById("btn-form-cancel")?.addEventListener("click", hideForm);
    
    document.getElementById("api-list-container")?.addEventListener("click", async (e) => {
        const card = e.target.closest(".api-card");
        if (!card) return;
        
        const id = card.dataset.id;
        const settings = getSettings();
        const api = settings.apiList.find(a => a.id === id);
        
        if (e.target.closest(".btn-use")) {
            useAPI(id);
        } else if (e.target.closest(".btn-test")) {
            const statusDot = card.querySelector(".status-dot");
            statusDot.className = "status-dot testing";
            
            const result = await testConnection(api);
            api.lastTest = Date.now();
            api.lastTestSuccess = result.success;
            if (result.success) {
                api.models = result.models;
            }
            saveSettings();
            updateUI();
            
            toastr.info(result.message);
        } else if (e.target.closest(".btn-edit")) {
            showForm(id);
        } else if (e.target.closest(".btn-toggle")) {
            toggleEnabled(id);
        } else if (e.target.closest(".btn-delete")) {
            if (confirm("确定要删除 " + api.name + " 吗？")) {
                deleteAPI(id);
            }
        }
    });
}

jQuery(async () => {
    loadSettings();
    createUI();
    bindEvents();
    updateUI();
    console.log("[多API轮换] 插件v2.0已加载");
});}

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
