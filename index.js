import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "api-rotator";

const defaultSettings = {
    apiList: [],
    currentIndex: 0,
    enabled: true,
    mode: "round-robin",
    autoSwitchOnError: true
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
        const baseUrl = api.endpoint.replace(/\/+$/, "").replace(/\/v1$/, "");
        const testUrl = baseUrl + "/v1/models";
        const headers = {};
        if (api.apiKey) {
            headers["Authorization"] = `Bearer ${api.apiKey}`;
        }
        
        const response = await fetch(testUrl, {
            method: "GET",
            headers: headers
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

// ========== 应用API ==========
function applyAPI(api) {
    if (!api) return;

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
        setTimeout(() => setModel(api.model), 300);
    }

    setTimeout(() => {
        const connectBtn = document.getElementById("api_button_openai");
        if (connectBtn) connectBtn.click();
    }, 100);
}

function setModel(modelName) {
    if (!modelName) return;
    
    const modelSelect = document.getElementById("model_openai_select");
    if (modelSelect) {
        const exists = Array.from(modelSelect.options).some(opt => opt.value === modelName);
        if (!exists) {
            const option = document.createElement("option");
            option.value = modelName;
            option.textContent = modelName;
            modelSelect.appendChild(option);
        }
        modelSelect.value = modelName;
        modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const customInput = document.getElementById("custom_model_id");
    if (customInput) {
        customInput.value = modelName;
        customInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
}

function switchToNext() {
    const enabledList = getEnabledAPIs();
    if (enabledList.length <= 1) {
        toastr.warning("需要至少2个启用的API才能切换");
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
    const api = settings.apiList.find(a => a.id === id);
    if (!api) return;
    
    const enabledList = getEnabledAPIs();
    const index = enabledList.findIndex(a => a.id === id);
    if (index > -1) {
        settings.currentIndex = index;
    }
    
    applyAPI(api);
    saveSettings();
    updateUI();
    toastr.success(`已切换到: ${api.name}`);
}

function addAPI(name, endpoint, apiKey, model) {
    const settings = getSettings();
    settings.apiList.push({
        id: Date.now().toString(),
        name,
        endpoint,
        apiKey,
        model: model || "",
        enabled: true
    });
    saveSettings();
    updateUI();
    toastr.success(`已添加: ${name}`);
}

function updateAPIModel(id, model) {
    const settings = getSettings();
    const api = settings.apiList.find(a => a.id === id);
    if (api) {
        api.model = model;
        saveSettings();
        updateUI();
        toastr.success(`已更新模型: ${model}`);
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
    const api = settings.apiList.find(a => a.id === id);
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

    const temp = settings.apiList[index];
    settings.apiList[index] = settings.apiList[newIndex];
    settings.apiList[newIndex] = temp;

    saveSettings();
    updateUI();
    toastr.info("已移动");
}

async function testAPI(api) {
    toastr.info(`正在测试 ${api.name}...`);
    const models = await fetchModels(api);
    
    if (models.length > 0) {
        toastr.success(`✅ ${api.name} 连接成功！发现 ${models.length} 个模型`);
        return { success: true, models };
    } else {
        toastr.error(`❌ ${api.name} 连接失败或无模型`);
        return { success: false, models: [] };
    }
}

// ========== 导入导出 ==========
function exportConfig() {
    const settings = getSettings();
    const data = {
        version: "1.0",
        exportTime: new Date().toISOString(),
        apiList: settings.apiList
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `api-config-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toastr.success("配置已导出");
}

function importConfig(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.apiList && Array.isArray(data.apiList)) {
                const settings = getSettings();
                let count = 0;
                data.apiList.forEach(api => {
                    settings.apiList.push({
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                        name: api.name || "未命名",
                        endpoint: api.endpoint || "",
                        apiKey: api.apiKey || "",
                        model: api.model || "",
                        enabled: api.enabled !== false
                    });
                    count++;
                });
                saveSettings();
                updateUI();
                toastr.success(`已导入 ${count} 个API`);
            } else {
                toastr.error("无效的配置文件");
            }
        } catch (err) {
            toastr.error("导入失败: " + err.message);
        }
    };
    reader.readAsText(file);
}

// ========== 请求拦截 ==========
function setupInterceptor() {
    const originalFetch = window.fetch;

    window.fetch = async function(url, options = {}) {
        const settings = getSettings();
        if (!settings.enabled || getEnabledAPIs().length === 0) {
            return originalFetch.apply(this, arguments);
        }

        const urlStr = url.toString();
        const isAPI = urlStr.includes("/v1/chat/completions") || 
                      urlStr.includes("/v1/completions");

        if (!isAPI) {
            return originalFetch.apply(this, arguments);
        }

        const api = getNextAPI();
        if (!api) return originalFetch.apply(this, arguments);

        try {
            const baseUrl = api.endpoint.replace(/\/+$/, "").replace(/\/v1$/, "");
            const path = urlStr.includes("/v1/chat/completions") ? "/v1/chat/completions" : "/v1/completions";
            const newUrl = baseUrl + path;

            const newHeaders = {};
            if (options.headers) {
                if (options.headers instanceof Headers) {
                    options.headers.forEach((v, k) => newHeaders[k] = v);
                } else {
                    Object.assign(newHeaders, options.headers);
                }
            }
            
            if (api.apiKey) {
                newHeaders["Authorization"] = `Bearer ${api.apiKey}`;
            }

            let newBody = options.body;
            if (api.model && newBody) {
                try {
                    const bodyObj = JSON.parse(newBody);
                    bodyObj.model = api.model;
                    newBody = JSON.stringify(bodyObj);
                } catch (e) {}
            }

            console.log(`[API轮询] ${api.name} ${api.model || ""}`);
            updateCurrentDisplay();

            const response = await originalFetch.call(this, newUrl, {
                ...options,
                headers: newHeaders,
                body: newBody
            });

            if (!response.ok && settings.autoSwitchOnError && getEnabledAPIs().length > 1) {
                toastr.warning(`${api.name} 失败，切换中...`);
                return window.fetch(url, options);
            }

            return response;
        } catch (e) {
            if (settings.autoSwitchOnError && getEnabledAPIs().length > 1) {
                toastr.warning(`${api.name} 出错，切换中...`);
                return window.fetch(url, options);
            }
            throw e;
        }
    };
}

// ========== UI ==========
function createUI() {
    const html = `
    <div id="api-rotator-ext">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🔄 API轮询切换器</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                
                <!-- 顶部状态 -->
                <div class="ar-header">
                    <label class="ar-enable-label">
                        <input type="checkbox" id="ar-chk-enabled">
                        <span>启用轮询</span>
                    </label>
                    <div class="ar-current-display">
                        当前: <strong id="ar-current-name">无</strong>
                    </div>
                </div>

                <!-- 控制区 -->
                <div class="ar-control-row">
                    <select id="ar-select-mode" class="ar-mode-select">
                        <option value="round-robin">顺序轮询</option>
                        <option value="random">随机选择</option>
                    </select>
                    <button id="ar-btn-next" class="ar-btn ar-btn-primary">
                        <i class="fa-solid fa-forward-step"></i>
                        <span>下一个</span>
                    </button>
                </div>

                <!-- 选项 -->
                <div class="ar-option-row">
                    <label>
                        <input type="checkbox" id="ar-chk-auto">
                        <span>请求失败自动切换</span>
                    </label>
                </div>

                <!-- 统计 -->
                <div class="ar-stats-bar" id="ar-stats">已启用 0/0 个API</div>

                <!-- API列表 -->
                <div class="ar-api-list" id="ar-api-list"></div>

                <!-- 添加表单 -->
                <div id="ar-add-section">
                    <button id="ar-btn-show-add" class="ar-btn ar-btn-add-main">
                        <i class="fa-solid fa-plus"></i>
                        <span>添加新API</span>
                    </button>
                    
                    <div id="ar-add-form" class="ar-form-panel" style="display:none;">
                        <div class="ar-form-title">添加新API</div>
                        
                        <div class="ar-form-group">
                            <label>名称 <span class="ar-required">*</span></label>
                            <input type="text" id="ar-add-name" placeholder="例如：中转站A">
                        </div>
                        
                        <div class="ar-form-group">
                            <label>API地址 <span class="ar-required">*</span></label>
                            <input type="text" id="ar-add-endpoint" placeholder="https://api.example.com/v1">
                        </div>
                        
                        <div class="ar-form-group">
                            <label>API密钥</label>
                            <input type="password" id="ar-add-key" placeholder="sk-xxxx">
                        </div>
                        
                        <div class="ar-form-group">
                            <label>模型 <span class="ar-optional">(可选)</span></label>
                            <div class="ar-model-input-row">
                                <input type="text" id="ar-add-model" placeholder="留空使用默认模型">
                                <button id="ar-btn-fetch-models" class="ar-btn ar-btn-small" title="获取模型列表">
                                    <i class="fa-solid fa-rotate"></i>
                                </button>
                            </div>
                            <select id="ar-add-model-select" class="ar-model-dropdown" style="display:none;">
                                <option value="">-- 从列表选择模型 --</option>
                            </select>
                        </div>
                        
                        <div class="ar-form-actions">
                            <button id="ar-btn-test-new" class="ar-btn">
                                <i class="fa-solid fa-plug"></i>
                                <span>测试连接</span>
                            </button>
                            <button id="ar-btn-save-new" class="ar-btn ar-btn-primary">
                                <i class="fa-solid fa-check"></i>
                                <span>保存</span>
                            </button>
                            <button id="ar-btn-cancel-add" class="ar-btn">
                                <i class="fa-solid fa-xmark"></i>
                                <span>取消</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 导入导出 -->
                <div class="ar-io-section">
                    <button id="ar-btn-export" class="ar-btn ar-btn-io">
                        <i class="fa-solid fa-file-export"></i>
                        <span>导出配置</span>
                    </button>
                    <button id="ar-btn-import" class="ar-btn ar-btn-io">
                        <i class="fa-solid fa-file-import"></i>
                        <span>导入配置</span>
                    </button>
                    <input type="file" id="ar-import-file" accept=".json" style="display:none;">
                </div>

            </div>
        </div>
    </div>`;

    const container = document.getElementById("extensions_settings");
    if (container) {
        container.insertAdjacentHTML("beforeend", html);
        console.log("[API轮询] UI已创建");
    } else {
        console.error("[API轮询] 找不到 extensions_settings");
    }
}

function updateUI() {
    const settings = getSettings();
    const current = getCurrentAPI();
    const enabled = getEnabledAPIs();

    // 开关
    const chkEnabled = document.getElementById("ar-chk-enabled");
    if (chkEnabled) chkEnabled.checked = settings.enabled;

    // 模式
    const selectMode = document.getElementById("ar-select-mode");
    if (selectMode) selectMode.value = settings.mode;

    // 自动切换
    const chkAuto = document.getElementById("ar-chk-auto");
    if (chkAuto) chkAuto.checked = settings.autoSwitchOnError;

    // 当前API
    const currentName = document.getElementById("ar-current-name");
    if (currentName) {
        if (current) {
            currentName.textContent = current.name + (current.model ? ` (${current.model})` : "");
        } else {
            currentName.textContent = "无";
        }
    }

    // 统计
    const stats = document.getElementById("ar-stats");
    if (stats) {
        stats.textContent = `已启用 ${enabled.length}/${settings.apiList.length} 个API`;
    }

    // 列表
    renderAPIList();
}

function renderAPIList() {
    const settings = getSettings();
    const current = getCurrentAPI();
    const listEl = document.getElementById("ar-api-list");
    
    if (!listEl) return;

    if (settings.apiList.length === 0) {
        listEl.innerHTML = '<div class="ar-empty-tip">暂无API，请点击上方按钮添加</div>';
        return;
    }

    listEl.innerHTML = settings.apiList.map((api, index) => {
        const isCurrent = current && current.id === api.id;
        const isEnabled = api.enabled !== false;
        const isFirst = index === 0;
        const isLast = index === settings.apiList.length - 1;

        return `
        <div class="ar-api-item ${isCurrent ? 'ar-current' : ''} ${!isEnabled ? 'ar-disabled' : ''}" data-id="${api.id}">
            <div class="ar-api-item-header">
                <label class="ar-api-toggle-label">
                    <input type="checkbox" class="ar-api-toggle" ${isEnabled ? 'checked' : ''}>
                </label>
                <div class="ar-api-info">
                    <div class="ar-api-name">${isCurrent ? '▶ ' : ''}${escapeHtml(api.name)}</div>
                    <div class="ar-api-endpoint">${escapeHtml(api.endpoint)}</div>
                </div>
            </div>
            
            <div class="ar-api-model-row">
                <span class="ar-model-label">模型:</span>
                <select class="ar-api-model-select" data-id="${api.id}">
                    <option value="">默认</option>
                    ${api.model ? `<option value="${escapeHtml(api.model)}" selected>${escapeHtml(api.model)}</option>` : ''}
                </select>
                <button class="ar-btn ar-btn-icon ar-btn-load-models" data-id="${api.id}" title="加载模型列表">
                    <i class="fa-solid fa-rotate"></i>
                </button>
            </div>
            
            <div class="ar-api-actions">
                <button class="ar-btn ar-btn-icon ar-btn-use" title="使用此API" ${!isEnabled ? 'disabled' : ''}>
                    <i class="fa-solid fa-play"></i>
                </button>
                <button class="ar-btn ar-btn-icon ar-btn-test" title="测试连接">
                    <i class="fa-solid fa-plug"></i>
                </button>
                <button class="ar-btn ar-btn-icon ar-btn-move-up" title="上移" ${isFirst ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-up"></i>
                </button>
                <button class="ar-btn ar-btn-icon ar-btn-move-down" title="下移" ${isLast ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
                <button class="ar-btn ar-btn-icon ar-btn-delete" title="删除">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>`;
    }).join('');
}

function updateCurrentDisplay() {
    const current = getCurrentAPI();
    const el = document.getElementById("ar-current-name");
    if (el && current) {
        el.textContent = current.name + (current.model ? ` (${current.model})` : "");
    }
}

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function showAddForm() {
    document.getElementById("ar-add-form").style.display = "block";
    document.getElementById("ar-btn-show-add").style.display = "none";
}

function hideAddForm() {
    document.getElementById("ar-add-form").style.display = "none";
    document.getElementById("ar-btn-show-add").style.display = "flex";
    // 清空表单
    document.getElementById("ar-add-name").value = "";
    document.getElementById("ar-add-endpoint").value = "";
    document.getElementById("ar-add-key").value = "";
    document.getElementById("ar-add-model").value = "";
    document.getElementById("ar-add-model-select").style.display = "none";
    document.getElementById("ar-add-model-select").innerHTML = '<option value="">-- 从列表选择模型 --</option>';
}

async function loadModelsForSelect(selectEl, api) {
    toastr.info("正在获取模型列表...");
    const models = await fetchModels(api);
    
    if (models.length === 0) {
        toastr.warning("未获取到模型");
        return;
    }

    // 保留当前选中值
    const currentValue = selectEl.value;
    
    // 重建选项
    selectEl.innerHTML = '<option value="">默认</option>';
    models.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        if (m === currentValue) opt.selected = true;
        selectEl.appendChild(opt);
    });

    toastr.success(`已加载 ${models.length} 个模型`);
}

function bindEvents() {
    const settings = getSettings();

    // 启用开关
    document.getElementById("ar-chk-enabled")?.addEventListener("change", (e) => {
        settings.enabled = e.target.checked;
        saveSettings();
        toastr.info(settings.enabled ? "轮询已启用" : "轮询已禁用");
    });

    // 模式选择
    document.getElementById("ar-select-mode")?.addEventListener("change", (e) => {
        settings.mode = e.target.value;
        saveSettings();
    });

    // 自动切换
    document.getElementById("ar-chk-auto")?.addEventListener("change", (e) => {
        settings.autoSwitchOnError = e.target.checked;
        saveSettings();
    });

    // 下一个按钮
    document.getElementById("ar-btn-next")?.addEventListener("click", switchToNext);

    // 显示添加表单
    document.getElementById("ar-btn-show-add")?.addEventListener("click", showAddForm);

    // 取消添加
    document.getElementById("ar-btn-cancel-add")?.addEventListener("click", hideAddForm);

    // 获取模型列表（添加表单）
    document.getElementById("ar-btn-fetch-models")?.addEventListener("click", async () => {
        const endpoint = document.getElementById("ar-add-endpoint").value.trim();
        const apiKey = document.getElementById("ar-add-key").value.trim();
        
        if (!endpoint) {
            toastr.error("请先填写API地址");
            return;
        }

        toastr.info("正在获取模型列表...");
        const models = await fetchModels({ endpoint, apiKey });
        
        if (models.length > 0) {
            const select = document.getElementById("ar-add-model-select");
            select.innerHTML = '<option value="">-- 从列表选择模型 --</option>';
            models.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m;
                select.appendChild(opt);
            });
            select.style.display = "block";
            toastr.success(`发现 ${models.length} 个模型`);
        } else {
            toastr.warning("未获取到模型");
        }
    });

    // 模型下拉选择（添加表单）
    document.getElementById("ar-add-model-select")?.addEventListener("change", (e) => {
        if (e.target.value) {
            document.getElementById("ar-add-model").value = e.target.value;
        }
    });

    // 测试新API
    document.getElementById("ar-btn-test-new")?.addEventListener("click", async () => {
        const name = document.getElementById("ar-add-name").value.trim() || "测试";
        const endpoint = document.getElementById("ar-add-endpoint").value.trim();
        const apiKey = document.getElementById("ar-add-key").value.trim();
        
        if (!endpoint) {
            toastr.error("请填写API地址");
            return;
        }

        await testAPI({ name, endpoint, apiKey });
    });

    // 保存新API
    document.getElementById("ar-btn-save-new")?.addEventListener("click", () => {
        const name = document.getElementById("ar-add-name").value.trim();
        const endpoint = document.getElementById("ar-add-endpoint").value.trim();
        const apiKey = document.getElementById("ar-add-key").value.trim();
        const model = document.getElementById("ar-add-model").value.trim();

        if (!name) {
            toastr.error("请填写名称");
            return;
        }
        if (!endpoint) {
            toastr.error("请填写API地址");
            return;
        }

        addAPI(name, endpoint, apiKey, model);
        hideAddForm();
    });

    // 导出
    document.getElementById("ar-btn-export")?.addEventListener("click", exportConfig);

    // 导入按钮
    document.getElementById("ar-btn-import")?.addEventListener("click", () => {
        document.getElementById("ar-import-file").click();
    });

    // 导入文件
    document.getElementById("ar-import-file")?.addEventListener("change", (e) => {
        if (e.target.files[0]) {
            importConfig(e.target.files[0]);
            e.target.value = "";
        }
    });

    // API列表事件委托
    document.getElementById("ar-api-list")?.addEventListener("click", async (e) => {
        const item = e.target.closest(".ar-api-item");
        if (!item) return;
        const id = item.dataset.id;

        // 使用按钮
        if (e.target.closest(".ar-btn-use")) {
            useAPI(id);
            return;
        }

        // 测试
