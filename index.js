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

    // 设置模型
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
    
    // 尝试设置OpenAI模型选择
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

    // 尝试设置自定义模型输入框
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

    [settings.apiList[index], settings.apiList[newIndex]] = 
    [settings.apiList[newIndex], settings.apiList[index]];

    saveSettings();
    updateUI();
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
        apiList: settings.apiList
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `api-config-${Date.now()}.json`;
    a.click();
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
                        ...api,
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 5)
                    });
                    count++;
                });
                saveSettings();
                updateUI();
                toastr.success(`已导入 ${count} 个API`);
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

            const newOptions = { ...options };
            newOptions.headers = { ...(options.headers || {}) };
            
            if (api.apiKey) {
                newOptions.headers["Authorization"] = `Bearer ${api.apiKey}`;
            }

            // 替换模型
            if (api.model && newOptions.body) {
                try {
                    const body = JSON.parse(newOptions.body);
                    body.model = api.model;
                    newOptions.body = JSON.stringify(body);
                } catch (e) {}
            }

            console.log(`[API轮询] ${api.name} ${api.model || ""}`);
            updateCurrentDisplay();

            const response = await originalFetch.call(this, newUrl, newOptions);

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
    <div id="api-rotator-panel">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🔄 API轮询切换器</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="ar-status-bar">
                    <label class="ar-toggle">
                        <input type="checkbox" id="ar-enabled">
                        <span>启用轮询</span>
                    </label>
                    <div class="ar-current">
                        当前: <strong id="ar-current-name">无</strong>
                    </div>
                </div>

                <div class="ar-controls">
                    <select id="ar-mode" title="轮询模式">
                        <option value="round-robin">顺序轮询</option>
                        <option value="random">随机选择</option>
                    </select>
                    <button id="ar-btn-next" class="menu_button">
                        <i class="fa-solid fa-forward"></i> 下一个
                    </button>
                </div>

                <div class="ar-options">
                    <label>
                        <input type="checkbox" id="ar-auto-switch">
                        失败自动切换
                    </label>
                </div>

                <div class="ar-stats" id="ar-stats">0/0 个API</div>

                <div class="ar-list" id="ar-list"></div>

                <button id="ar-btn-add" class="menu_button ar-btn-wide">
                    <i class="fa-solid fa-plus"></i> 添加API
                </button>

                <div id="ar-form" class="ar-form" style="display:none;">
                    <div class="ar-form-row">
                        <label>名称</label>
                        <input type="text" id="ar-input-name" placeholder="中转站A">
                    </div>
                    <div class="ar-form-row">
                        <label>地址</label>
                        <input type="text" id="ar-input-endpoint" placeholder="https://api.example.com/v1">
                    </div>
                    <div class="ar-form-row">
                        <label>密钥</label>
                        <input type="password" id="ar-input-key" placeholder="sk-xxx">
                    </div>
                    <div class="ar-form-row">
                        <label>模型</label>
                        <div class="ar-model-group">
                            <input type="text" id="ar-input-model" placeholder="留空使用默认">
                            <button id="ar-btn-fetch" class="menu_button" title="获取模型列表">
                                <i class="fa-solid fa-sync"></i>
                            </button>
                        </div>
                    </div>
                    <select id="ar-select-model" style="display:none;">
                        <option value="">-- 选择模型 --</option>
                    </select>
                    <div class="ar-form-buttons">
                        <button id="ar-btn-test" class="menu_button">测试</button>
                        <button id="ar-btn-save" class="menu_button">保存</button>
                        <button id="ar-btn-cancel" class="menu_button">取消</button>
                    </div>
                </div>

                <div class="ar-io">
                    <button id="ar-btn-export" class="menu_button">
                        <i class="fa-solid fa-download"></i> 导出
                    </button>
                    <button id="ar-btn-import" class="menu_button">
                        <i class="fa-solid fa-upload"></i> 导入
                    </button>
                    <input type="file" id="ar-file" accept=".json" style="display:none;">
                </div>
            </div>
        </div>
    </div>`;

    const container = document.getElementById("extensions_settings");
    if (container) {
        container.insertAdjacentHTML("beforeend", html);
        console.log("[API轮询] UI已创建");
    } else {
        console.error("[API轮询] 找不到extensions_settings容器");
    }
}

function updateUI() {
    const settings = getSettings();
    const current = getCurrentAPI();
    const enabled = getEnabledAPIs();

    // 更新开关状态
    const enabledChk = document.getElementById("ar-enabled");
    if (enabledChk) enabledChk.checked = settings.enabled;

    // 更新模式
    const modeSelect = document.getElementById("ar-mode");
    if (modeSelect) modeSelect.value = settings.mode;

    // 更新自动切换
    const autoChk = document.getElementById("ar-auto-switch");
    if (autoChk) autoChk.checked = settings.autoSwitchOnError;

    // 更新当前显示
    const nameEl = document.getElementById("ar-current-name");
    if (nameEl) {
        nameEl.textContent = current ? 
            (current.name + (current.model ? ` (${current.model})` : "")) : "无";
    }

    // 更新统计
    const statsEl = document.getElementById("ar-stats");
    if (statsEl) {
        statsEl.textContent = `${enabled.length}/${settings.apiList.length} 个API已启用`;
    }

    // 更新列表
    const listEl = document.getElementById("ar-list");
    if (listEl) {
        if (settings.apiList.length === 0) {
            listEl.innerHTML = '<div class="ar-empty">暂无API，请添加</div>';
        } else {
            listEl.innerHTML = settings.apiList.map((api, idx) => {
                const isCurrent = current && current.id === api.id;
                const isEnabled = api.enabled !== false;
                return `
                <div class="ar-item ${isCurrent ? 'current' : ''} ${!isEnabled ? 'disabled' : ''}" data-id="${api.id}">
                    <div class="ar-item-left">
                        <input type="checkbox" class="ar-item-toggle" ${isEnabled ? 'checked' : ''}>
                        <div class="ar-item-info">
                            <div class="ar-item-name">${isCurrent ? '▶ ' : ''}${escapeHtml(api.name)}</div>
                            <div class="ar-item-url">${escapeHtml(api.endpoint)}</div>
                            ${api.model ? `<div class="ar-item-model">模型: ${escapeHtml(api.model)}</div>` : ''}
                        </div>
                    </div>
                    <div class="ar-item-actions">
                        <button class="menu_button ar-btn-use" title="使用" ${!isEnabled ? 'disabled' : ''}>
                            <i class="fa-solid fa-play"></i>
                        </button>
                        <button class="menu_button ar-btn-test" title="测试">
                            <i class="fa-solid fa-plug"></i>
                        </button>
                        <button class="menu_button ar-btn-up" title="上移" ${idx === 0 ? 'disabled' : ''}>
                            <i class="fa-solid fa-up"></i>
                        </button>
                        <button class="menu_button ar-btn-down" title="下移" ${idx === settings.apiList.length - 1 ? 'disabled' : ''}>
                            <i class="fa-solid fa-down"></i>
                        </button>
                        <button class="menu_button ar-btn-del" title="删除">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>`;
            }).join('');
        }
    }
}

function updateCurrentDisplay() {
    const current = getCurrentAPI();
    const nameEl = document.getElementById("ar-current-name");
    if (nameEl && current) {
        nameEl.textContent = current.name + (current.model ? ` (${current.model})` : "");
    }
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
}

function showForm() {
    document.getElementById("ar-form").style.display = "block";
    document.getElementById("ar-btn-add").style.display = "none";
}

function hideForm() {
    document.getElementById("ar-form").style.display = "none";
    document.getElementById("ar-btn-add").style.display = "block";
    document.getElementById("ar-input-name").value = "";
    document.getElementById("ar-input-endpoint").value = "";
    document.getElementById("ar-input-key").value = "";
    document.getElementById("ar-input-model").value = "";
    document.getElementById("ar-select-model").style.display = "none";
}

function bindEvents() {
    const settings = getSettings();

    // 启用开关
    document.getElementById("ar-enabled")?.addEventListener("change", (e) => {
        settings.enabled = e.target.checked;
        saveSettings();
    });

    // 模式
    document.getElementById("ar-mode")?.addEventListener("change", (e) => {
        settings.mode = e.target.value;
        saveSettings();
    });

    // 自动切换
    document.getElementById("ar-auto-switch")?.addEventListener("change", (e) => {
        settings.autoSwitchOnError = e.target.checked;
        saveSettings();
    });

    // 下一个
    document.getElementById("ar-btn-next")?.addEventListener("click", switchToNext);

    // 显示表单
    document.getElementById("ar-btn-add")?.addEventListener("click", showForm);

    // 取消
    document.getElementById("ar-btn-cancel")?.addEventListener("click", hideForm);

    // 获取模型
    document.getElementById("ar-btn-fetch")?.addEventListener("click", async () => {
        const endpoint = document.getElementById("ar-input-endpoint").value.trim();
        const apiKey = document.getElementById("ar-input-key").value.trim();
        
        if (!endpoint) {
            toastr.error("请先填写API地址");
            return;
        }

        toastr.info("获取模型中...");
        const models = await fetchModels({ endpoint, apiKey });
        
        if (models.length > 0) {
            const select = document.getElementById("ar-select-model");
            select.innerHTML = '<option value="">-- 选择模型 --</option>';
            models.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m;
                select.appendChild(opt);
            });
            select.style.display = "block";
            select.onchange = () => {
                document.getElementById("ar-input-model").value = select.value;
            };
            toastr.success(`发现 ${models.length} 个模型`);
        } else {
            toastr.warning("未获取到模型");
        }
    });

    // 测试
    document.getElementById("ar-btn-test")?.addEventListener("click", async () => {
        const endpoint = document.getElementById("ar-input-endpoint").value.trim();
        const apiKey = document.getElementById("ar-input-key").value.trim();
        const name = document.getElementById("ar-input-name").value.trim() || "测试";
        
        if (!endpoint) {
            toastr.error("请填写API地址");
            return;
        }

        await testAPI({ name, endpoint, apiKey });
    });

    // 保存
    document.getElementById("ar-btn-save")?.addEventListener("click", () => {
        const name = document.getElementById("ar-input-name").value.trim();
        const endpoint = document.getElementById("ar-input-endpoint").value.trim();
        const apiKey = document.getElementById("ar-input-key").value.trim();
        const model = document.getElementById("ar-input-model").value.trim();

        if (!name || !endpoint) {
            toastr.error("请填写名称和地址");
            return;
        }

        addAPI(name, endpoint, apiKey, model);
        hideForm();
    });

    // 导出
    document.getElementById("ar-btn-export")?.addEventListener("click", exportConfig);

    // 导入
    document.getElementById("ar-btn-import")?.addEventListener("click", () => {
        document.getElementById("ar-file").click();
    });

    document.getElementById("ar-file")?.addEventListener("change", (e) => {
        if (e.target.files[0]) {
            importConfig(e.target.files[0]);
            e.target.value = "";
        }
    });

    // 列表事件委托
    document.getElementById("ar-list")?.addEventListener("click", async (e) => {
        const item = e.target.closest(".ar-item");
        if (!item) return;
        const id = item.dataset.id;

        if (e.target.closest(".ar-btn-use")) {
            useAPI(id);
        } else if (e.target.closest(".ar-btn-test")) {
            const api = settings.apiList.find(a => a.id === id);
            if (api) await testAPI(api);
        } else if (e.target.closest(".ar-btn-up")) {
            moveAPI(id, "up");
        } else if (e.target.closest(".ar-btn-down")) {
            moveAPI(id, "down");
        } else if (e.target.closest(".ar-btn-del")) {
            if (confirm("确定删除？")) deleteAPI(id);
        } else if (e.target.classList.contains("ar-item-toggle")) {
            toggleAPIEnabled(id);
        }
    });
}

// ========== 初始化 ==========
jQuery(async () => {
    loadSettings();
    createUI();
    updateUI();
    bindEvents();
    setupInterceptor();
    console.log("[API轮询切换器] 已加载");
});
