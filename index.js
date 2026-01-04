// API轮询切换器 - 简化版
(function() {
    const PLUGIN_NAME = 'api-rotator';
    
    // 状态
    let state = {
        enabled: true,
        mode: 'round-robin',
        currentIndex: 0,
        apiList: []
    };

    // 加载配置
    function load() {
        try {
            const saved = localStorage.getItem(PLUGIN_NAME);
            if (saved) state = { ...state, ...JSON.parse(saved) };
        } catch(e) {}
    }

    // 保存配置
    function save() {
        localStorage.setItem(PLUGIN_NAME, JSON.stringify(state));
    }

    // 获取下一个API
    function getNextApi() {
        const list = state.apiList.filter(x => x.enabled);
        if (list.length === 0) return null;
        
        if (state.mode === 'random') {
            return list[Math.floor(Math.random() * list.length)];
        }
        
        state.currentIndex = state.currentIndex % list.length;
        const api = list[state.currentIndex];
        state.currentIndex++;
        save();
        return api;
    }

    // 创建界面
    function createUI() {
        // 添加按钮到酒馆顶栏
        const topBar = document.getElementById('top-bar') || 
                       document.querySelector('.top-bar') ||
                       document.querySelector('#top-settings-holder');
        
        if (topBar) {
            const btn = document.createElement('div');
            btn.id = 'api-rotator-btn';
            btn.innerHTML = '🔄 API轮询';
            btn.onclick = openPanel;
            topBar.appendChild(btn);
        }

        // 创建浮动按钮（备用）
        const floatBtn = document.createElement('div');
        floatBtn.id = 'api-rotator-float';
        floatBtn.innerHTML = '🔄';
        floatBtn.title = '打开API轮询设置';
        floatBtn.onclick = openPanel;
        document.body.appendChild(floatBtn);

        // 创建面板
        const panel = document.createElement('div');
        panel.id = 'api-rotator-panel';
        panel.innerHTML = getPanelHTML();
        document.body.appendChild(panel);

        // 绑定事件
        bindEvents();
        updateList();
    }

    function getPanelHTML() {
        return `
            <div class="ar-box">
                <div class="ar-header">
                    <span>🔄 API轮询切换器</span>
                    <button class="ar-close" onclick="document.getElementById('api-rotator-panel').style.display='none'">✕</button>
                </div>
                
                <div class="ar-body">
                    <div class="ar-row">
                        <label>
                            <input type="checkbox" id="ar-enabled" ${state.enabled ? 'checked' : ''}> 
                            启用轮询
                        </label>
                        <select id="ar-mode">
                            <option value="round-robin" ${state.mode === 'round-robin' ? 'selected' : ''}>顺序轮询</option>
                            <option value="random" ${state.mode === 'random' ? 'selected' : ''}>随机选择</option>
                        </select>
                    </div>

                    <div class="ar-status" id="ar-status">加载中...</div>

                    <div class="ar-section">
                        <div class="ar-title">API列表</div>
                        <div id="ar-list"></div>
                    </div>

                    <div class="ar-section">
                        <div class="ar-title">添加API</div>
                        <input type="text" id="ar-name" placeholder="名称（如：中转站1）">
                        <input type="text" id="ar-url" placeholder="地址（如：https://api.example.com）">
                        <input type="password" id="ar-key" placeholder="密钥（sk-xxx）">
                        <div class="ar-btns">
                            <button id="ar-add">添加</button>
                            <button id="ar-test">测试</button>
                        </div>
                    </div>

                    <div class="ar-section">
                        <div class="ar-title">导入/导出</div>
                        <div class="ar-btns">
                            <button id="ar-export">导出配置</button>
                            <button id="ar-import">导入配置</button>
                        </div>
                        <input type="file" id="ar-file" accept=".json" style="display:none">
                    </div>
                </div>
            </div>
        `;
    }

    function bindEvents() {
        // 启用开关
        document.getElementById('ar-enabled').onchange = function() {
            state.enabled = this.checked;
            save();
            updateStatus();
        };

        // 模式切换
        document.getElementById('ar-mode').onchange = function() {
            state.mode = this.value;
            save();
        };

        // 添加API
        document.getElementById('ar-add').onclick = function() {
            const name = document.getElementById('ar-name').value.trim();
            const url = document.getElementById('ar-url').value.trim();
            const key = document.getElementById('ar-key').value.trim();
            
            if (!name || !url) {
                alert('请填写名称和地址');
                return;
            }
            
            state.apiList.push({ name, endpoint: url, apiKey: key, enabled: true });
            save();
            updateList();
            
            document.getElementById('ar-name').value = '';
            document.getElementById('ar-url').value = '';
            document.getElementById('ar-key').value = '';
            
            alert('添加成功！');
        };

        // 测试API
        document.getElementById('ar-test').onclick = async function() {
            const url = document.getElementById('ar-url').value.trim();
            const key = document.getElementById('ar-key').value.trim();
            
            if (!url) {
                alert('请填写API地址');
                return;
            }
            
            try {
                const testUrl = url.replace(/\/+$/, '') + '/v1/models';
                const res = await fetch(testUrl, {
                    headers: key ? { 'Authorization': 'Bearer ' + key } : {}
                });
                
                if (res.ok) {
                    const data = await res.json();
                    alert('✅ 连接成功！发现 ' + (data.data?.length || 0) + ' 个模型');
                } else {
                    alert('❌ 连接失败: ' + res.status);
                }
            } catch(e) {
                alert('❌ 连接错误: ' + e.message);
            }
        };

        // 导出
        document.getElementById('ar-export').onclick = function() {
            const data = JSON.stringify({ apiList: state.apiList }, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'api-config.json';
            a.click();
        };

        // 导入
        document.getElementById('ar-import').onclick = function() {
            document.getElementById('ar-file').click();
        };

        document.getElementById('ar-file').onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(ev) {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.apiList && Array.isArray(data.apiList)) {
                        state.apiList = state.apiList.concat(data.apiList);
                        save();
                        updateList();
                        alert('导入成功！');
                    }
                } catch(err) {
                    alert('导入失败: ' + err.message);
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        };
    }

    function updateList() {
        const container = document.getElementById('ar-list');
        if (!container) return;

        if (state.apiList.length === 0) {
            container.innerHTML = '<div class="ar-empty">暂无API，请添加</div>';
        } else {
            container.innerHTML = state.apiList.map((api, i) => `
                <div class="ar-item">
                    <div class="ar-item-left">
                        <input type="checkbox" ${api.enabled ? 'checked' : ''} onchange="window._arToggle(${i}, this.checked)">
                        <div>
                            <div class="ar-item-name">${api.name}</div>
                            <div class="ar-item-url">${api.endpoint}</div>
                        </div>
                    </div>
                    <div class="ar-item-right">
                        <button onclick="window._arTest(${i})">测试</button>
                        <button onclick="window._arDel(${i})">删除</button>
                    </div>
                </div>
            `).join('');
        }
        
        updateStatus();
    }

    function updateStatus() {
        const el = document.getElementById('ar-status');
        if (!el) return;
        
        const enabled = state.apiList.filter(x => x.enabled).length;
        const total = state.apiList.length;
        
        if (!state.enabled) {
            el.textContent = `已禁用 | 共 ${total} 个API`;
            el.className = 'ar-status off';
        } else if (enabled === 0) {
            el.textContent = `无可用API`;
            el.className = 'ar-status warn';
        } else {
            el.textContent = `已启用 ${enabled}/${total} 个 | ${state.mode === 'random' ? '随机' : '顺序'}模式`;
            el.className = 'ar-status on';
        }
    }

    function openPanel() {
        document.getElementById('api-rotator-panel').style.display = 'flex';
    }

    // 全局函数
    window._arToggle = function(i, v) {
        state.apiList[i].enabled = v;
        save();
        updateStatus();
    };

    window._arTest = async function(i) {
        const api = state.apiList[i];
        try {
            const url = api.endpoint.replace(/\/+$/, '') + '/v1/models';
            const res = await fetch(url, {
                headers: api.apiKey ? { 'Authorization': 'Bearer ' + api.apiKey } : {}
            });
            alert(res.ok ? '✅ 连接成功' : '❌ 失败: ' + res.status);
        } catch(e) {
            alert('❌ 错误: ' + e.message);
        }
    };

    window._arDel = function(i) {
        if (confirm('确定删除 ' + state.apiList[i].name + '？')) {
            state.apiList.splice(i, 1);
            save();
            updateList();
        }
    };

    window._arOpen = openPanel;

    // 请求拦截
    function hookFetch() {
        const original = window.fetch;
        
        window.fetch = async function(url, options = {}) {
            if (!state.enabled) return original.apply(this, arguments);
            
            const urlStr = url.toString();
            const isApi = urlStr.includes('/v1/chat/completions') || 
                          urlStr.includes('/v1/completions') ||
                          urlStr.includes('/v1/messages');
            
            if (!isApi) return original.apply(this, arguments);
            
            const api = getNextApi();
            if (!api) return original.apply(this, arguments);
            
            // 构建新URL
            let path = '';
            if (urlStr.includes('/v1/chat/completions')) path = '/v1/chat/completions';
            else if (urlStr.includes('/v1/completions')) path = '/v1/completions';
            else if (urlStr.includes('/v1/messages')) path = '/v1/messages';
            
            const newUrl = api.endpoint.replace(/\/+$/, '') + path;
            
            // 复制options
            const newOpts = { ...options };
            newOpts.headers = { ...(options.headers || {}) };
            if (api.apiKey) {
                newOpts.headers['Authorization'] = 'Bearer ' + api.apiKey;
            }
            
            console.log('[API轮询] 使用:', api.name);
            
            return original.call(this, newUrl, newOpts);
        };
    }

    // 初始化
    function init() {
        console.log('[API轮询] 初始化...');
        load();
        createUI();
        hookFetch();
        console.log('[API轮询] 完成！共', state.apiList.length, '个API');
    }

    // 等待页面加载
    if (document.readyState === 'complete') {
        setTimeout(init, 2000);
    } else {
        window.addEventListener('load', () => setTimeout(init, 2000));
    }
})();
