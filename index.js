import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "api-rotator";

const defaultSettings = {
    apiList: [],
    currentIndex: 0,
    enabled: true,
    mode: "round-robin",
    autoSwitchOnError: true,
    showNotification: true
};

// ========== 设置管理 ==========
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

// ========== API管理 ==========
function getEnabledAPIs() {
    return getSettings().apiList.filter(api => api.enabled !== false);
}

function getCurrentAPI() {
    const enabledList = getEnabledAPIs();
    if (enabledList.length === 0) return null;
    const settings = getSettings();
    const index = settings.currentIndex % enabledList.length;
    return enabledList[index];
}

function getNextAPI() {
    const settings = getSettings();
    const enabledList = getEnabledAPIs();
    if (enabledList.length === 0) return null;

    let selected;
    if (settings.mode === "random") {
        const randomIndex = Math.floor(Math.random() * enabledList.length);
        selected = enabledList[randomIndex];
        settings.currentIndex = randomIndex;
    } else {
        settings.currentIndex = settings.currentIndex % enabledList.length;
        selected = enabledList[settings.currentIndex];
        settings.currentIndex = (settings.currentIndex + 1) % enabledList.length;
    }

    saveSettings();
    return selected;
}

// ========== 获取模型列表 ==========
async function fetchModels(api) {
    try {
        const testUrl = api.endpoint.replace(/\/+$/, "") + "/v1/models";
        const response = await fetch(testUrl, {
            method: "GET",
            headers: api.apiKey ? { "Authorization": `Bearer ${api.apiKey}` } : {}
        });

        if (response.ok) {
            const data = await response.json();
            if (data.data && Array.isArray(data.data)) {
                return data.data.map(m => m.id).sort();
            }
        }
        return [];
    } catch (e) {
        console.error("获取模型列表失败:", e);
        return [];
    }
}

// ========== 应用API配置 ==========
function applyAPI(api) {
    if (!api) return;

    // 设置代理地址
    const proxyInput = document.getElementById("openai_reverse_proxy");
    if (proxyInput) {
        proxyInput.value = api.endpoint;
        proxyInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // 设置API Key
    const keyInput = document.getElementById("api_key_openai");
    if (keyInput) {
        keyInput.value = api.apiKey;
        keyInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // 设置模型（如果有指定）
    if (api.model) {
        setTimeout(() => {
            setModel(api.model);
        }, 200);
    }

    // 点击连接按钮
    setTimeout(() => {
        const connectBtn = document.getElementById("api_button_openai");
        if (connectBtn) connectBtn.click();
    }, 100);
}

// 设置模型
function setModel(modelName) {
    // 尝试多种方式设置模型
    
    // 方式1: 直接设置输入框
    const modelInput = document.getElementById("model_openai_select");
    if (modelInput) {
        modelInput.value = modelName;
        modelInput.dispatchEvent(new Event("change", { bubbles: true }));
        return;
    }

    // 方式2: 自定义模型输入框
    const customModelInput = document.getElementById("custom_model_id");
    if (customModelInput) {
        customModelInput.value = modelName;
        customModelInput.dispatchEvent(new Event("input", { bubbles: true }));
        return;
    }

    // 方式3: 查找下拉选择框
    const modelSelect = document.querySelector('select[name="model"], #model_openai_select, [data-model-select]');
    if (modelSelect) {
        // 检查选项是否存在
        const option = Array.from(modelSelect.options).find(opt => opt.value === modelName);
        if (option) {
            modelSelect.value = modelName;
        } else {
            // 添加新选项
            const newOption = document.createElement("option");
            newOption.value = modelName;
            newOption.textContent = modelName;
            modelSelect.appendChild(newOption);
            modelSelect.value = modelName;
        }
        modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
}

function switchToNext() {
    const enabledList = getEnabledAPIs();
    if (enabledList.length <= 1) {
        toastr.warning("只有一个或没有可用API");
        return;
    }

    const settings = getSettings();
    settings.currentIndex = (settings.currentIndex + 1) % enabledList.length;
    const newAPI = enabledList[settings.currentIndex];
    applyAPI(newAPI);
    saveSettings();
    updateUI();
    toastr.success(`已切换到: ${newAPI.name}`);
}

function useAPI(id) {
    const settings = getSettings();
    const enabledList = getEnabledAPIs();
    const index = enabledList.findIndex(api => api.id === id);
    if (index > -1) {
        settings.currentIndex = index;
        applyAPI(enabledList[index]);
        saveSettings();
        updateUI();
        toastr.success(`已切换到: ${enabledList[index].name}`);
    }
}

function addAPI(name, endpoint, apiKey, model) {
    const settings = getSettings();
    settings.apiList.push({
        id: Date.now().toString(),
        name: name,
        endpoint: endpoint,
        apiKey: apiKey,
        model: model || "",
        enabled: true
    });
    saveSettings();
    updateUI();
    toastr.success(`已添加: ${name}`);
}

function updateAPI(id, data) {
    const settings = getSettings();
    const api = settings.apiList.find(a => a.id === id);
    if (api) {
        Object.assign(api, data);
        saveSettings();
        updateUI();
    }
}

function deleteAPI(id) {
    const settings = getSettings();
    const index = settings.apiList.findIndex(api => api.id === id);
    if (index > -1) {
        const name = settings.apiList[index].name;
        settings.apiList.splice(index, 1);
        if (settings.currentIndex >= getEnabledAPIs().length) {
            settings.currentIndex = 0;
        }
        saveSettings();
        updateUI();
        toastr.info(`已删除: ${name}`);
    }
}

function toggleAPIEnabled(id) {
    const settings = getSettings();
    const api = settings.apiList.find(api => api.id === id);
    if (api) {
        api.enabled = !api.enabled;
        if (settings.currentIndex >= getEnabledAPIs().length) {
            settings.currentIndex = 0;
        }
        saveSettings();
        updateUI();
    }
}

function moveAPI(id, direction) {
    const settings = getSettings();
    const index = settings.apiList.findIndex(api => api.id === id);
    if (index === -1) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= settings.apiList.length) return;

    [settings.apiList[index], settings.apiList[newIndex]] = 
    [settings.apiList[newIndex], settings.apiList[index]];

    saveSettings();
    updateUI();
}

async function testAPI(api) {
    try {
        toastr.info(`正在测试 ${api.name}...`);
        const models = await fetchModels(api);
        
        if (models.length > 0) {
            toastr.success(`✅ ${api.name} 连接成功！发现 ${models.length} 个模型`);
            return { success: true, models };
        } else {
            toastr.warning(`⚠️ ${api.name} 连接成功但未发现模型`);
            return { success: true, models: [] };
        }
    } catch (e) {
        toastr.error(`❌ ${api.name} 连接错误: ${e.message}`);
        return { success: false, models: [] };
    }
}

// ========== 导入导出 ==========
function exportConfig() {
    const settings = getSettings();
    const data = {
        version: "1.0",
        exportTime: new Date().toISOString(),
        apiList: settings.apiList.map(api => ({
            name: api.name,
            endpoint: api.endpoint,
            apiKey: api.apiKey,
            model: api.model,
            enabled: api.enabled
        }))
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `api-rotator-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toastr.success("配置已导出");
}

function importConfig(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.apiList && Array.isArray(data.apiList)) {
                const settings = getSettings();
                let importCount = 0;

                data.apiList.forEach(api => {
                    const exists = settings.apiList.some(
                        a => a.endpoint === api.endpoint && a.name === api.name
                    );
                    if (!exists) {
                        settings.apiList.push({
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                            name: api.name,
                            endpoint: api.endpoint,
                            apiKey: api.apiKey,
                            model: api.model || "",
                            enabled: api.enabled !== false
                        });
                        importCount++;
                    }
                });

                saveSettings();
                updateUI();
                toastr.success(`已导入 ${importCount} 个API配置`);
            } else {
                toastr.error("无效的配置文件格式");
            }
        } catch (err) {
            toastr.error(`导入失败: ${err.message}`);
        }
    };
    reader.readAsText(file);
}

// ========== 请求拦截 ==========
function setupRequestInterceptor() {
    const originalFetch = window.fetch;

    window.fetch = async function(url, options = {}) {
        const settings = getSettings();

        if (!settings.enabled || getEnabledAPIs().length === 0) {
            return originalFetch.apply(this, arguments);
        }

        const urlStr = url.toString();
        const isAPIRequest = 
            urlStr.includes("/v1/chat/completions") ||
            urlStr.includes("/v1/completions") ||
            urlStr.includes("/v1/messages");

        if (!isAPIRequest) {
            return originalFetch.apply(this, arguments);
        }

        const api = getNextAPI();
        if (!api) {
            return originalFetch.apply(this, arguments);
        }

        try {
            let path = "";
            if (urlStr.includes("/v1/chat/completions")) path = "/v1/chat/completions";
            else if (urlStr.includes("/v1/completions")) path = "/v1/completions";
            else if (urlStr.includes("/v1/messages")) path = "/v1/messages";

            const newUrl = api.endpoint.replace(/\/+$/, "") + path;

            const newOptions = JSON.parse(JSON.stringify(options));
            if (!newOptions.headers) newOptions.headers = {};

            if (options.headers instanceof Headers) {
                options.headers.forEach((value, key) => {
                    newOptions.headers[key] = value;
                });
            }

            if (api.apiKey) {
                newOptions.headers["Authorization"] = `Bearer ${api.apiKey}`;
            }

            // 如果指定了模型，替换请求体中的模型
            if (api.model && newOptions.body) {
                try {
                    const body = JSON.parse(newOptions.body);
                    body.model = api.model;
                    newOptions.body = JSON.stringify(body);
                } catch (e) {}
            }

            console.log(`[API轮询] 使用: ${api.name}${api.model ? ` (${api.model})` : ""}`);
            
            if (settings.showNotification) {
                updateCurrentDisplay(api.name);
            }

            const response = await originalFetch.call(this, newUrl, newOptions);

            if (!response.ok && settings.autoSwitchOnError && getEnabledAPIs().length > 1) {
                console.log(`[API轮询] ${api.name} 请求失败，尝试下一个...`);
                toastr.warning(`${api.name} 请求失败，正在切换...`);
                return window.fetch(url, options);
            }

            return response;
        } catch (e) {
            console.error(`[API轮询] 请求错误:`, e);
            
            if (settings.autoSwitchOnError && getEnabledAPIs().length > 1) {
                toastr.warning(`${api.name} 连接失败，正在切换...`);
                return window.fetch(url, options);
            }
            
            throw e;
        }
    };
}

// ========== UI ==========
function createUI() {
    const settings = getSettings();

    const html = `
    <div id="api-rotator-panel">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🔄 API轮询切换器</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
            </div>
            <div class="inline-drawer-content">
                <!-- 状态栏 -->
                <div class="api-rotator-status">
                    <div class="status-left">
                        <label class="toggle-label">
                            <input type="checkbox" id="rotator-enabled" ${settings.enabled ? "checked" : ""}>
                            启用轮询
                        </label>
                        <span class="current-api">当前: <strong id="current-api-name">未配置</strong></span>
                    </div>
                    <div class="status-right">
                        <select id="rotator-mode">
                            <option value="round-robin" ${settings.mode === "round-robin" ? "selected" : ""}>顺序轮询</option>
                            <option value="random" ${settings.mode === "random" ? "selected" : ""}>随机选择</option>
                        </select>
                        <button id="btn-switch-next" class="menu_button" title="手动切换到下一个">
                            <i class="fa-solid fa-forward"></i>
                        </button>
                    </div>
                </div>

                <!-- 统计信息 -->
                <div class="api-rotator-stats" id="rotator-stats">
                    已启用 0/0 个API
                </div>

                <!-- 设置选项 -->
                <div class="api-rotator-options">
                    <label>
                        <input type="checkbox" id="rotator-auto-switch" ${settings.autoSwitchOnError ? "checked" : ""}>
                        请求失败时自动切换
                    </label>
                    <label>
                        <input type="checkbox" id="rotator-show-notify" ${settings.showNotification ? "checked" : ""}>
                        显示切换通知
                    </label>
                </div>

                <!-- API列表 -->
                <h4>API列表</h4>
                <div id="api-list-container" class="api-list-container"></div>

                <!-- 添加按钮 -->
                <button id="btn-show-add" class="menu_button wide-btn">
                    <i class="fa-solid fa-plus"></i> 添加新API
                </button>

                <!-- 添加表单 -->
                <div id="api-add-form" class="api-add-form" style="display:none;">
                    <label>名称 <span class="required">*</span></label>
                    <input type="text" id="input-name" placeholder="例如：中转站A">

                    <label>API地址 <span class="required">*</span></label>
                    <input type="text" id="input-endpoint" placeholder="https://api.example.com/v1">

                    <label>API Key</label>
                    <input type="password" id="input-apikey" placeholder="sk-xxx">

                    <label>模型 <span class="optional">(可选，留空则使用酒馆设置)</span></label>
                    <div class="model-input-group">
                        <input type="text" id="input-model" placeholder="例如：gpt-4o-mini">
                        <button id="btn-fetch-models" class="menu_button" title="获取模型列表">
                            <i class="fa-solid fa-list"></i>
                        </button>
                    </div>
                    <select id="select-model" class="model-select" style="display:none;">
                        <option value="">-- 选择模型 --</option>
                    </select>

                    <div class="form-buttons">
                        <button id="btn-test-new" class="menu_button">
                            <i class="fa-solid fa-plug"></i> 测试
                        </button>
                        <button id="btn-save-api" class="menu_button">
                            <i class="fa-solid fa-check"></i> 保存
                        </button>
                        <button id="btn-cancel-add" class="menu_button">
                            <i class="fa-solid fa-times"></i> 取消
                        </button>
                    </div>
                </div>

                <!-- 编辑表单（弹窗） -->
                <div id="api-edit-modal" class="api-edit-modal" style="display:none;">
                    <div class="modal-content">
                        <h4>编辑API</h4>
                        <input type="hidden" id="edit-id">
                        
                        <label>名称</label>
                        <input type="text" id="edit-name">

                        <label>API地址</label>
                        <input type="text" id="edit-endpoint">

                        <label>API Key</label>
                        <input type="password" id="edit-apikey">

                        <label>模型</label>
                        <div class="model-input-group">
                            <input type="text" id="edit-model" placeholder="留空使用酒馆设置">
                            <button id="btn-edit-fetch-models" class="menu_button" title="获取模型列表">
                                <i class="fa-solid fa-list"></i>
                            </button>
                        </div>
                        <select id="edit-select-model" class="model-select" style="display:none;">
                            <option value="">-- 选择模型 --</option>
                        </select>

                        <div class="form-buttons">
                            <button id="btn-save-edit" class="menu_button">
                                <i class="fa-solid fa-check"></i> 保存
                            </button>
                            <button id="btn-cancel-edit" class="menu_button">
                                <i class="fa-solid fa-times"></i> 取消
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 导入导出 -->
                <div class="api-rotator-io">
                    <button id="btn-export" class="menu_button">
                        <i class="fa-solid fa-download"></i> 导出
                    </button>
                    <button id="btn-import" class="menu_button">
                        <i class="fa-solid fa-upload"></i> 导入
                    </button>
                    <input type="file" id="import-file" accept=".json" style="display:none">
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
    const enabledList = getEnabledAPIs();

    const nameEl = document.getElementById("current-api-name");
    if (nameEl) {
        if (currentAPI) {
            nameEl.textContent = currentAPI.name + (currentAPI.model ? ` (${currentAPI.model})` : "");
        } else {
            nameEl.textContent = "未配置";
        }
    }

    const statsEl = document.getElementById("rotator-stats");
    if (statsEl) {
        statsEl.textContent = `已启用 ${enabledList.length}/${settings.apiList.length} 个API`;
    }

    const listContainer = document.getElementById("api-list-container");
    if (listContainer) {
        if (settings.apiList.length === 0) {
            listContainer.innerHTML = '<div class="empty-list">还没有添加API，点击下方按钮添加</div>';
        } else {
            listContainer.innerHTML = settings.apiList.map((api, index) => {
                const isCurrent = currentAPI && currentAPI.id === api.id;
                const isEnabled = api.enabled !== false;
                const isFirst = index === 0;
                const isLast = index === settings.apiList.length - 1;

                return `
                <div class="api-item ${isCurrent ? "current" : ""} ${!isEnabled ? "disabled" : ""}" data-id="${api.id}">
                    <div class="api-item-main">
                        <input type="checkbox" class="api-toggle" ${isEnabled ? "checked" : ""} title="启用/禁用">
                        <div class="api-item-info">
                            <div class="api-item-name">${isCurrent ? "▶ " : ""}${escapeHtml(api.name)}</div>
                            <div class="api-item-endpoint">${escapeHtml(api.endpoint)}</div>
                            ${api.model ? `<div class="api-item-model">模型: ${escapeHtml(api.model)}</div>` : ""}
                        </div>
                    </div>
                    <div class="api-item-actions">
                        <button class="menu_button btn-use" title="使用此API" ${!isEnabled ? "disabled" : ""}>
                            <i class="fa-solid fa-play"></i>
                        </button>
                        <button class="menu_button btn-edit" title="编辑">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="menu_button btn-test" title="测试连接">
                            <i class="fa-solid fa-plug"></i>
                        </button>
                        <button class="menu_button btn-up" title="上移" ${isFirst ? "disabled" : ""}>
                            <i class="fa-solid fa-arrow-up"></i>
                        </button>
                        <button class="menu_button btn-down" title="下移" ${isLast ? "disabled" : ""}>
                            <i class="fa-solid fa-arrow-down"></i>
                        </button>
                        <button class="menu_button btn-delete" title="删除">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>`;
            }).join("");
        }
    }
}

function updateCurrentDisplay(name) {
    const nameEl = document.getElementById("current-api-name");
    if (nameEl) {
        nameEl.textContent = name;
        nameEl.classList.add("flash");
        setTimeout(() => nameEl.classList.remove("flash"), 500);
    }
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function clearForm() {
    document.getElementById("input-name").value = "";
    document.getElementById("input-endpoint").value = "";
    document.getElementById("input-apikey").value = "";
    document.getElementById("input-model").value = "";
    document.getElementById("select-model").style.display = "none";
    document.getElementById("select-model").innerHTML = '<option value="">-- 选择模型 --</option>';
}

function openEditModal(id) {
    const settings = getSettings();
    const api = settings.apiList.find(a => a.id === id);
    if (!api) return;

    document.getElementById("edit-id").value = id;
    document.getElementById("edit-name").value = api.name;
    document.getElementById("edit-endpoint").value = api.endpoint;
    document.getElementById("edit-apikey").value = api.apiKey || "";
    document.getElementById("edit-model").value = api.model || "";
    document.getElementById("edit-select-model").style.display = "none";
    
    document.getElementById("api-edit-modal").style.display = "flex";
}

function closeEditModal() {
    document.getElementById("api-edit-modal").style.display = "none";
}

async function loadModelsToSelect(selectId, inputId, endpoint, apiKey) {
    const select = document.getElementById(selectId);
    const input = document.getElementById(inputId);
    
    toastr.info("正在获取模型列表...");
    
    const models = await fetchModels({ endpoint, apiKey });
    
    if (models.length === 0) {
        toastr.warning("未获取到模型列表");
        return;
    }

    select.innerHTML = '<option value="">-- 选择模型 --</option>';
    models.forEach(model => {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        select.appendChild(option);
    });

    select.style.display = "block";
    select.onchange = () => {
        if (select.value) {
            input.value = select.value;
        }
    };

    toastr.success(`获取到 ${models.length} 个模型`);
}

function bindEvents() {
    const settings = getSettings();

    // 启用开关
    document.getElementById("rotator-enabled")?.addEventListener("change", (e) => {
        settings.enabled = e.target.checked;
        saveSettings();
        toastr.info(settings.enabled ? "轮询已启用" : "轮询已禁用");
    });

    // 模式切换
    document.getElementById("rotator-mode")?.addEventListener("change", (e) => {
        settings.mode = e.target.value;
        saveSettings();
        toastr.info(`已切换到${e.target.value === "random" ? "随机" : "顺序"}模式`);
    });

    // 自动切换选项
    document.getElementById("rotator-auto-switch")?.addEventListener("change", (e) => {
        settings.autoSwitchOnError = e.target.checked;
        saveSettings();
    });

    // 显示通知选项
    document.getElementById("rotator-show-notify")?.addEventListener("change", (e) => {
        settings.showNotification = e.target.checked;
        saveSettings();
    });

    // 手动切换下一个
    document.getElementById("btn-switch-next")?.addEventListener("click", switchToNext);

    // 显示添加表单
    document.getElementById("btn-show-add")?.addEventListener("click", () => {
        document.getElementById("api-add-form").style.display = "block";
        document.getElementById("btn-show-add").style.display = "none";
    });

    // 取消添加
    document.getElementById("btn-cancel-add")?.addEventListener("click", () => {
        document.getElementById("api-add-form").style.display = "none";
        document.getElementById("btn-show-add").style.display = "block";
        clearForm();
    });

    // 获取模型列表（添加表单）
    document.getElementById("btn-fetch-models")?.addEventListener("click", async () => {
        const endpoint = document.getElementById("input-endpoint").value.trim();
        const apiKey = document.getElementById("input-apikey").value.trim();
        
        if (!endpoint) {
            toastr.error("请先填写API地址");
            return;
        }

        await loadModelsToSelect("select-model", "input-model", endpoint, apiKey);
    });

    // 测试新API
    document.getElementById("btn-test-new")?.addEventListener("click", async () => {
        const name = document.getElementById("input-name").value.trim() || "新API";
        const endpoint = document.getElementById("input-endpoint").value.trim();
        const apiKey = document.getElementById("input-apikey").value.trim();

        if (!endpoint) {
            toastr.error("请填写API地址");
            return;
        }

        const result = await testAPI({ name, endpoint, apiKey });
        
        // 如果测试成功，自动加载模型列表
        if (result.success && result.models.length > 0) {
            const select = document.getElementById("select-model");
            select.innerHTML = '<option value="">-- 选择模型 --</option>';
            result.models.forEach(model => {
                const option = document.createElement("option");
                option.value = model;
                option.textContent = model;
                select.appendChild(option);
            });
            select.style.display = "block";
            select.onchange = () => {
                if
