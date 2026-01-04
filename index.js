import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "api-rotator";

const defaultSettings = {
    apiList: [],
    currentIndex: 0,
    enabled: true,
    mode: "round-robin", // round-robin | random
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

    // 点击连接按钮
    setTimeout(() => {
        const connectBtn = document.getElementById("api_button_openai");
        if (connectBtn) connectBtn.click();
    }, 100);
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
    const api = settings.apiList.find(api => api.id === id);
    if (api) {
        api.enabled = !api.enabled;
        // 重新计算索引
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

    // 交换位置
    [settings.apiList[index], settings.apiList[newIndex]] = 
    [settings.apiList[newIndex], settings.apiList[index]];

    saveSettings();
    updateUI();
}

async function testAPI(api) {
    try {
        const testUrl = api.endpoint.replace(/\/+$/, "") + "/v1/models";
        const response = await fetch(testUrl, {
            method: "GET",
            headers: api.apiKey ? { "Authorization": `Bearer ${api.apiKey}` } : {}
        });

        if (response.ok) {
            const data = await response.json();
            const modelCount = data.data ? data.data.length : 0;
            toastr.success(`✅ ${api.name} 连接成功！发现 ${modelCount} 个模型`);
            return true;
        } else {
            toastr.error(`❌ ${api.name} 连接失败: ${response.status}`);
            return false;
        }
    } catch (e) {
        toastr.error(`❌ ${api.name} 连接错误: ${e.message}`);
        return false;
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
                    // 检查是否已存在
                    const exists = settings.apiList.some(
                        a => a.endpoint === api.endpoint && a.name === api.name
                    );
                    if (!exists) {
                        settings.apiList.push({
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                            name: api.name,
                            endpoint: api.endpoint,
                            apiKey: api.apiKey,
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

// ========== 请求拦截（自动轮询） ==========
function setupRequestInterceptor() {
    const originalFetch = window.fetch;

    window.fetch = async function(url, options = {}) {
        const settings = getSettings();

        // 检查是否启用轮询
        if (!settings.enabled || getEnabledAPIs().length === 0) {
            return originalFetch.apply(this, arguments);
        }

        // 检测是否是AI API请求
        const urlStr = url.toString();
        const isAPIRequest = 
            urlStr.includes("/v1/chat/completions") ||
            urlStr.includes("/v1/completions") ||
            urlStr.includes("/v1/messages") ||
            urlStr.includes("/api/v1/generate");

        if (!isAPIRequest) {
            return originalFetch.apply(this, arguments);
        }

        // 获取下一个API
        const api = getNextAPI();
        if (!api) {
            return originalFetch.apply(this, arguments);
        }

        // 构建新请求
        try {
            // 提取路径
            let path = "";
            if (urlStr.includes("/v1/chat/completions")) path = "/v1/chat/completions";
            else if (urlStr.includes("/v1/completions")) path = "/v1/completions";
            else if (urlStr.includes("/v1/messages")) path = "/v1/messages";
            else if (urlStr.includes("/api/v1/generate")) path = "/api/v1/generate";

            const newUrl = api.endpoint.replace(/\/+$/, "") + path;

            // 复制并修改headers
            const newOptions = JSON.parse(JSON.stringify(options));
            if (!newOptions.headers) newOptions.headers = {};

            // 处理Headers对象
            if (options.headers instanceof Headers) {
                options.headers.forEach((value, key) => {
                    newOptions.headers[key] = value;
                });
            }

            if (api.apiKey) {
                newOptions.headers["Authorization"] = `Bearer ${api.apiKey}`;
            }

            console.log(`[API轮询] 使用: ${api.name}`);
            
            if (settings.showNotification) {
                updateCurrentDisplay(api.name);
            }

            // 发送请求
            const response = await originalFetch.call(this, newUrl, newOptions);

            // 如果请求失败且开启了自动切换
            if (!response.ok && settings.autoSwitchOnError && getEnabledAPIs().length > 1) {
                console.log(`[API轮询] ${api.name} 请求失败，尝试下一个...`);
                toastr.warning(`${api.name} 请求失败，正在切换...`);
                // 递归调用，使用下一个API
                return window.fetch(url, options);
            }

            return response;
        } catch (e) {
            console.error(`[API轮询] 请求错误:`, e);
            
            // 如果出错且开启了自动切换
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
                    <label>名称</label>
                    <input type="text" id="input-name" placeholder="例如：中转站A">

                    <label>API地址</label>
                    <input type="text" id="input-endpoint" placeholder="https://api.example.com/v1">

                    <label>API Key</label>
                    <input type="password" id="input-apikey" placeholder="sk-xxx">

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

    // 更新当前API显示
    const nameEl = document.getElementById("current-api-name");
    if (nameEl) {
        nameEl.textContent = currentAPI ? currentAPI.name : "未配置";
    }

    // 更新统计
    const statsEl = document.getElementById("rotator-stats");
    if (statsEl) {
        statsEl.textContent = `已启用 ${enabledList.length}/${settings.apiList.length} 个API`;
    }

    // 更新列表
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
                        </div>
                    </div>
                    <div class="api-item-actions">
                        <button class="menu_button btn-use" title="使用此API" ${!isEnabled ? "disabled" : ""}>
                            <i class="fa-solid fa-play"></i>
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

    // 测试新API
    document.getElementById("btn-test-new")?.addEventListener("click", async () => {
        const name = document.getElementById("input-name").value.trim() || "新API";
        const endpoint = document.getElementById("input-endpoint").value.trim();
        const apiKey = document.getElementById("input-apikey").value.trim();

        if (!endpoint) {
            toastr.error("请填写API地址");
            return;
        }

        await testAPI({ name, endpoint, apiKey });
    });

    // 保存API
    document.getElementById("btn-save-api")?.addEventListener("click", () => {
        const name = document.getElementById("input-name").value.trim();
        const endpoint = document.getElementById("input-endpoint").value.trim();
        const apiKey = document.getElementById("input-apikey").value.trim();

        if (!name || !endpoint) {
            toastr.error("请填写名称和API地址");
            return;
        }

        addAPI(name, endpoint, apiKey);
        document.getElementById("api-add-form").style.display = "none";
        document.getElementById("btn-show-add").style.display = "block";
        clearForm();
    });

    // 导出
    document.getElementById("btn-export")?.addEventListener("click", exportConfig);

    // 导入
    document.getElementById("btn-import")?.addEventListener("click", () => {
        document.getElementById("import-file").click();
    });

    document.getElementById("import-file")?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            importConfig(file);
            e.target.value = "";
        }
    });

    // API列表事件委托
    document.getElementById("api-list-container")?.addEventListener("click", async (e) => {
        const item = e.target.closest(".api-item");
        if (!item) return;
        const id = item.dataset.id;

        if (e.target.closest(".btn-use")) {
            useAPI(id);
        } else if (e.target.closest(".btn-test")) {
            const api = settings.apiList.find(a => a.id === id);
            if (api) await testAPI(api);
        } else if (e.target.closest(".btn-up")) {
            moveAPI(id, "up");
        } else if (e.target.closest(".btn-down")) {
            moveAPI(id, "down");
        } else if (e.target.closest(".btn-delete")) {
            if (confirm("确定要删除这个API吗？")) {
                deleteAPI(id);
            }
        } else if (e.target.classList.contains("api-toggle")) {
            toggleAPIEnabled(id);
        }
    });
}

// ========== 初始化 ==========
jQuery(async () => {
    loadSettings();
    createUI();
    bindEvents();
    updateUI();
    setupRequestInterceptor();
    console.log("[API轮询切换器] 插件已加载");
});
