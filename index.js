// API轮询切换器插件 for SillyTavern
(function () {
    'use strict';

    const PLUGIN_NAME = 'API轮询切换器';
    const STORAGE_KEY = 'api_rotator_data';

    // 插件状态
    let state = {
        enabled: true,
        mode: 'round-robin', // round-robin | random
        currentIndex: 0,
        apiList: []
    };

    // ========== 存储管理 ==========
    function loadState() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                state = { ...state, ...data };
            }
        } catch (e) {
            console.error(`[${PLUGIN_NAME}] 加载配置失败:`, e);
        }
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error(`[${PLUGIN_NAME}] 保存配置失败:`, e);
        }
    }

    // ========== API轮询逻辑 ==========
    function getNextApi() {
        const enabledApis = state.apiList.filter(api => api.enabled);
        if (enabledApis.length === 0) return null;

        let selected;
        if (state.mode === 'random') {
            const idx = Math.floor(Math.random() * enabledApis.length);
            selected = enabledApis[idx];
        } else {
            state.currentIndex = state.currentIndex % enabledApis.length;
            selected = enabledApis[state.currentIndex];
            state.currentIndex++;
        }

        saveState();
        return selected;
    }

    // ========== 请求拦截 ==========
    function initRequestInterceptor() {
        const originalFetch = window.fetch;

        window.fetch = async function (url, options = {}) {
            // 检查是否启用且有可用API
            if (!state.enabled || state.apiList.length === 0) {
                return originalFetch.apply(this, arguments);
            }

            // 检测是否是AI API请求
            const apiEndpoints = [
                '/v1/chat/completions',
                '/v1/completions',
                '/api/v1/generate',
                '/v1/messages'
            ];

            const isApiRequest = apiEndpoints.some(endpoint => 
                url.toString().includes(endpoint)
            );

            if (!isApiRequest) {
                return originalFetch.apply(this, arguments);
            }

            // 获取下一个API
            const nextApi = getNextApi();
            if (!nextApi) {
                return originalFetch.apply(this, arguments);
            }

            // 构建新请求
            try {
                const newUrl = buildUrl(url, nextApi);
                const newOptions = buildOptions(options, nextApi);

                console.log(`[${PLUGIN_NAME}] 使用: ${nextApi.name}`);
                showNotification(`使用API: ${nextApi.name}`, 'info');
                updateCurrentDisplay(nextApi.name);

                return originalFetch.call(this, newUrl, newOptions);
            } catch (e) {
                console.error(`[${PLUGIN_NAME}] 请求构建失败:`, e);
                return originalFetch.apply(this, arguments);
            }
        };
    }

    function buildUrl(originalUrl, api) {
        const urlStr = originalUrl.toString();
        
        // 提取路径部分
        let path = '';
        const pathPatterns = [
            '/v1/chat/completions',
            '/v1/completions',
            '/api/v1/generate',
            '/v1/messages'
        ];
        
        for (const pattern of pathPatterns) {
            if (urlStr.includes(pattern)) {
                path = pattern;
                break;
            }
        }

        // 组合新URL
        const baseUrl = api.endpoint.replace(/\/+$/, '');
        return baseUrl + path;
    }

    function buildOptions(options, api) {
        const newOptions = JSON.parse(JSON.stringify(options));
        
        if (!newOptions.headers) {
            newOptions.headers = {};
        }

        // 处理Headers对象
        if (options.headers instanceof Headers) {
            const headerObj = {};
            options.headers.forEach((value, key) => {
                headerObj[key] = value;
            });
            newOptions.headers = headerObj;
        }

        // 设置API密钥
        if (api.apiKey) {
            newOptions.headers['Authorization'] = `Bearer ${api.apiKey}`;
        }

        return newOptions;
    }

    // ========== UI相关 ==========
    function createUI() {
        // 创建设置按钮
        createSettingsButton();
        // 创建设置面板
        createSettingsPanel();
    }

    function createSettingsButton() {
        // 在酒馆扩展菜单添加按钮
        const extensionsMenu = document.getElementById('extensionsMenu');
        if (extensionsMenu) {
            const menuItem = document.createElement('div');
            menuItem.id = 'api-rotator-menu-btn';
            menuItem.className = 'list-group-item flex-container flexGap5';
            menuItem.innerHTML = `
                <div class="fa-solid fa-rotate extensionsMenuExtensionButton"></div>
                API轮询切换器
            `;
            menuItem.style.cursor = 'pointer';
            menuItem.addEventListener('click', togglePanel);
            extensionsMenu.appendChild(menuItem);
        }

        // 备用：在页面底部添加浮动按钮
        const floatBtn = document.createElement('div');
        floatBtn.id = 'api-rotator-float-btn';
        floatBtn.innerHTML = '🔄';
        floatBtn.title = 'API轮询切换器';
        floatBtn.addEventListener('click', togglePanel);
        document.body.appendChild(floatBtn);
    }

    function createSettingsPanel() {
        const panel = document.createElement('div');
        panel.id = 'api-rotator-panel';
        panel.className = 'api-rotator-panel';
        panel.innerHTML = `
            <div class="api-rotator-container">
                <div class="api-rotator-header">
                    <h3>🔄 API轮询切换器</h3>
                    <button class="api-rotator-close-btn" id="api-rotator-close">×</button>
                </div>

                <div class="api-rotator-section">
                    <div class="api-rotator-controls">
                        <label class="api-rotator-switch">
                            <input type="checkbox" id="api-rotator-enabled" ${state.enabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                        <span>启用轮询</span>
                        
                        <select id="api-rotator-mode">
                            <option value="round-robin" ${state.mode === 'round-robin' ? 'selected' : ''}>顺序轮询</option>
                            <option value="random" ${state.mode === 'random' ? 'selected' : ''}>随机选择</option>
                        </select>
                    </div>

                    <div class="api-rotator-status" id="api-rotator-status">
                        就绪
                    </div>
                </div>

                <div class="api-rotator-section">
                    <h4>API列表</h4>
                    <div class="api-rotator-list" id="api-rotator-list"></div>
                </div>

                <div class="api-rotator-section">
                    <h4>添加新API</h4>
                    <div class="api-rotator-form">
                        <input type="text" id="api-new-name" placeholder="名称（如：中转站1）">
                        <input type="text" id="api-new-endpoint" placeholder="API地址（如：https://api.example.com）">
                        <input type="password" id="api-new-key" placeholder="API密钥（sk-xxx）">
                        <div class="api-rotator-form-actions">
                            <button id="api-add-btn" class="api-rotator-btn primary">添加</button>
                            <button id="api-test-new-btn" class="api-rotator-btn">测试</button>
                        </div>
                    </div>
                </div>

                <div class="api-rotator-section">
                    <h4>导入/导出</h4>
                    <div class="api-rotator-io">
                        <button id="api-export-btn" class="api-rotator-btn">导出配置</button>
                        <button id="api-import-btn" class="api-rotator-btn">导入配置</button>
                        <input type="file" id="api-import-file" accept=".json" style="display:none">
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        // 绑定事件
        bindPanelEvents();
        renderApiList();
        updateStatus();
    }

    function bindPanelEvents() {
        // 关闭按钮
        document.getElementById('api-rotator-close').addEventListener('click', togglePanel);

        // 点击背景关闭
        document.getElementById('api-rotator-panel').addEventListener('click', (e) => {
            if (e.target.id === 'api-rotator-panel') togglePanel();
        });

        // 启用开关
        document.getElementById('api-rotator-enabled').addEventListener('change', (e) => {
            state.enabled = e.target.checked;
            saveState();
            updateStatus();
        });

        // 模式选择
        document.getElementById('api-rotator-mode').addEventListener('change', (e) => {
            state.mode = e.target.value;
            saveState();
        });

        // 添加按钮
        document.getElementById('api-add-btn').addEventListener('click', addNewApi);

        // 测试新API按钮
        document.getElementById('api-test-new-btn').addEventListener('click', testNewApi);

        // 导出
        document.getElementById('api-export-btn').addEventListener('click', exportConfig);

        // 导入
        document.getElementById('api-import-btn').addEventListener('click', () => {
            document.getElementById('api-import-file').click();
        });
        document.getElementById('api-import-file').addEventListener('change', importConfig);
    }

    function togglePanel() {
        const panel = document.getElementById('api-rotator-panel');
        if (panel) {
            const isVisible = panel.style.display === 'flex';
            panel.style.display = isVisible ? 'none' : 'flex';
            if (!isVisible) {
                renderApiList();
                updateStatus();
            }
        }
    }

    function renderApiList() {
        const container = document.getElementById('api-rotator-list');
        if (!container) return;

        if (state.apiList.length === 0) {
            container.innerHTML = '<div class="api-rotator-empty">暂无API，请添加</div>';
            return;
        }

        container.innerHTML = state.apiList.map((api, index) => `
            <div class="api-item ${api.enabled ? '' : 'disabled'}" data-index="${index}">
                <div class="api-item-main">
                    <label class="api-rotator-switch small">
                        <input type="checkbox" ${api.enabled ? 'checked' : ''} data-action="toggle" data-index="${index}">
                        <span class="slider"></span>
                    </label>
                    <div class="api-item-info">
                        <div class="api-item-name">${escapeHtml(api.name)}</div>
                        <div class="api-item-endpoint">${escapeHtml(api.endpoint)}</div>
                    </div>
                </div>
                <div class="api-item-actions">
                    <button data-action="test" data-index="${index}" title="测试连接">🔗</button>
                    <button data-action="edit" data-index="${index}" title="编辑">✏️</button>
                    <button data-action="up" data-index="${index}" title="上移" ${index === 0 ? 'disabled' : ''}>⬆️</button>
                    <button data-action="down" data-index="${index}" title="下移" ${index === state.apiList.length - 1 ? 'disabled' : ''}>⬇️</button>
                    <button data-action="delete" data-index="${index}" title="删除">🗑️</button>
                </div>
            </div>
        `).join('');

        // 绑定列表事件
        container.querySelectorAll('[data-action]').forEach(el => {
            el.addEventListener('click', handleApiAction);
            el.addEventListener('change', handleApiAction);
        });
    }

    function handleApiAction(e) {
        const action = e.target.dataset.action;
        const index = parseInt(e.target.dataset.index);

        switch (action) {
            case 'toggle':
                state.apiList[index].enabled = e.target.checked;
                saveState();
                renderApiList();
                updateStatus();
                break;

            case 'test':
                testApiConnection(index);
                break;

            case 'edit':
                editApi(index);
                break;

            case 'up':
                if (index > 0) {
                    [state.apiList[index], state.apiList[index - 1]] = 
                    [state.apiList[index - 1], state.apiList[index]];
                    saveState();
                    renderApiList();
                }
                break;

            case 'down':
                if (index < state.apiList.length - 1) {
                    [state.apiList[index], state.apiList[index + 1]] = 
                    [state.apiList[index + 1], state.apiList[index]];
                    saveState();
                    renderApiList();
                }
                break;

            case 'delete':
                if (confirm(`确定要删除 "${state.apiList[index].name}" 吗？`)) {
                    state.apiList.splice(index, 1);
                    saveState();
                    renderApiList();
                    updateStatus();
                }
                break;
        }
    }

    function addNewApi() {
        const name = document.getElementById('api-new-name').value.trim();
        const endpoint = document.getElementById('api-new-endpoint').value.trim();
        const apiKey = document.getElementById('api-new-key').value.trim();

        if (!name) {
            showNotification('请输入API名称', 'error');
            return;
        }
        if (!endpoint) {
            showNotification('请输入API地址', 'error');
            return;
        }

        state.apiList.push({
            name,
            endpoint,
            apiKey,
            enabled: true
        });

        saveState();
        renderApiList();
        updateStatus();

        // 清空输入
        document.getElementById('api-new-name').value = '';
        document.getElementById('api-new-endpoint').value = '';
        document.getElementById('api-new-key').value = '';

        showNotification(`已添加: ${name}`, 'success');
    }

    function editApi(index) {
        const api = state.apiList[index];
        
        const newName = prompt('API名称:', api.name);
        if (newName === null) return;

        const newEndpoint = prompt('API地址:', api.endpoint);
        if (newEndpoint === null) return;

        const newKey = prompt('API密钥:', api.apiKey || '');
        if (newKey === null) return;

        state.apiList[index] = {
            ...api,
            name: newName.trim() || api.name,
            endpoint: newEndpoint.trim() || api.endpoint,
            apiKey: newKey.trim()
        };

        saveState();
        renderApiList();
        showNotification('已更新配置', 'success');
    }

    async function testApiConnection(index) {
        const api = state.apiList[index];
        await doTestConnection(api);
    }

    async function testNewApi() {
        const name = document.getElementById('api-new-name').value.trim() || '新API';
        const endpoint = document.getElementById('api-new-endpoint').value.trim();
        const apiKey = document.getElementById('api-new-key').value.trim();

        if (!endpoint) {
            showNotification('请输入API地址', 'error');
            return;
        }

        await doTestConnection({ name, endpoint, apiKey });
    }

    async function doTestConnection(api) {
        showNotification(`正在测试: ${api.name}...`, 'info');

        try {
            const testUrl = api.endpoint.replace(/\/+$/, '') + '/v1/models';
            const response = await fetch(testUrl, {
                method: 'GET',
                headers: api.apiKey ? {
                    'Authorization': `Bearer ${api.apiKey}`
                } : {}
            });

            if (response.ok) {
                const data = await response.json();
                const modelCount = data.data ? data.data.length : 0;
                showNotification(`✅ ${api.name} 连接成功！发现 ${modelCount} 个模型`, 'success');
            } else {
                const errorText = await response.text();
                showNotification(`❌ ${api.name} 连接失败: ${response.status}`, 'error');
            }
        } catch (e) {
            showNotification(`❌ ${api.name} 连接错误: ${e.message}`, 'error');
        }
    }

    function updateStatus() {
        const statusEl = document.getElementById('api-rotator-status');
        if (!statusEl) return;

        const enabledCount = state.apiList.filter(a => a.enabled).length;
        const totalCount = state.apiList.length;

        if (!state.enabled) {
            statusEl.textContent = `已禁用 | 共 ${totalCount} 个API`;
            statusEl.className = 'api-rotator-status disabled';
        } else if (enabledCount === 0) {
            statusEl.textContent = `无可用API | 共 ${totalCount} 个`;
            statusEl.className = 'api-rotator-status warning';
        } else {
            statusEl.textContent = `已启用 ${enabledCount}/${totalCount} 个API | ${state.mode === 'random' ? '随机' : '顺序'}模式`;
            statusEl.className = 'api-rotator-status active';
        }
    }

    function updateCurrentDisplay(name) {
        const statusEl = document.getElementById('api-rotator-status');
        if (statusEl && state.enabled) {
            const enabledCount = state.apiList.filter(a => a.enabled).length;
            statusEl.textContent = `当前: ${name} | ${enabledCount} 个可用`;
        }
    }

    // ========== 导入导出 ==========
    function exportConfig() {
        const data = {
            version: '1.0',
            exportTime: new Date().toISOString(),
            config: {
                enabled: state.enabled,
                mode: state.mode,
                apiList: state.apiList.map(api => ({
                    name: api.name,
                    endpoint: api.endpoint,
                    apiKey: api.apiKey,
                    enabled: api.enabled
                }))
            }
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `api-rotator-config-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showNotification('配置已导出', 'success');
    }

    function importConfig(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                if (data.config && data.config.apiList) {
                    const importCount = data.config.apiList.length;
                    
                    if (confirm(`确定要导入 ${importCount} 个API配置吗？\n（将与现有配置合并）`)) {
                        // 合并配置
                        data.config.apiList.forEach(api => {
                            const exists = state.apiList.some(
                                a => a.endpoint === api.endpoint && a.name === api.name
                            );
                            if (!exists) {
                                state.apiList.push(api);
                            }
                        });

                        saveState();
                        renderApiList();
                        updateStatus();
                        showNotification(`已导入 ${importCount} 个API配置`, 'success');
                    }
                } else {
                    showNotification('无效的配置文件格式', 'error');
                }
            } catch (err) {
                showNotification('配置文件解析失败: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
        
        // 清空input以便重复导入同一文件
        e.target.value = '';
    }

    // ========== 工具函数 ==========
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showNotification(message, type = 'info') {
        // 尝试使用SillyTavern的toastr
        if (typeof toastr !== 'undefined') {
            switch (type) {
                case 'success': toastr.success(message); break;
                case 'error': toastr.error(message); break;
                case 'warning': toastr.warning(message); break;
                default: toastr.info(message);
            }
            return;
        }

        // 备用：创建自定义通知
        const notification = document.createElement('div');
        notification.className = `api-rotator-notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // ========== 初始化 ==========
    function init() {
        console.log(`[${PLUGIN_NAME}] 正在初始化...`);
        
        loadState();
        createUI();
        initRequestInterceptor();
        
        console.log(`[${PLUGIN_NAME}] 初始化完成，已加载 ${state.apiList.length} 个API配置`);
    }

    // 等待DOM加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // 延迟一点确保酒馆加载完成
        setTimeout(init, 1000);
    }

    // 暴露给全局
    window.ApiRotator = {
        open: togglePanel,
        getState: () => state,
        addApi: (name, endpoint, apiKey) => {
            state.apiList.push({ name, endpoint, apiKey, enabled: true });
            saveState();
            renderApiList();
        }
    };

})();
