# CommunicationMonitor 重构说明

## 📋 重构概述

将原来的 `CommunicationMonitor.vue`（1500+ 行）重构为多个模块化文件，实现真正的前后端分离和关注点分离。

## 🏗️ 新架构

### 1. **配置层** (`src/config/`)
- `api.js` - API 端点配置和请求配置

### 2. **工具层** (`src/utils/`)
- `http.js` - HTTP 请求封装（fetch + 超时 + 重试）

### 3. **服务层** (`src/services/`)
- `api.service.js` - 后端 API 调用封装
- `websocket.service.js` - WebSocket 管理类
- `map.service.js` - 高德地图操作封装
- `animation.service.js` - 消息动画逻辑

### 4. **组合式函数层** (`src/composables/`)
- `useMonitor.js` - 监控页面核心逻辑

### 5. **视图层** (`src/views/`)
- `CommunicationMonitorNew.vue` - 重构后的监控组件（仅200+ 行）

## 📊 重构对比

| 指标 | 重构前 | 重构后 |
|------|--------|--------|
| 单文件行数 | 1500+ | 200+ |
| 代码复用性 | ❌ 低 | ✅ 高 |
| 可测试性 | ❌ 困难 | ✅ 容易 |
| 可维护性 | ❌ 困难 | ✅ 容易 |
| API 配置 | ❌ 硬编码 | ✅ 集中管理 |
| 错误处理 | ❌ 分散 | ✅ 统一 |

## 🎯 核心优势

### 1. **真正的前后端分离**
```javascript
// 所有API调用都通过服务层
import { apiService } from '../services/api.service'

// 获取在线城市
const result = await apiService.getOnlineCities()

// 而不是直接 fetch
```

### 2. **统一的API配置**
```javascript
// config/api.js
export const API_ENDPOINTS = {
  HEALTH: `${API_BASE_URL}/health`,
  CITIES: `${API_BASE_URL}/cities`,
  // ...
}

// 修改端口只需修改一处
const API_BASE_URL = 'http://localhost:8001'  // 改这里即可
```

### 3. **可复用的 WebSocket 管理**
```javascript
// 创建 WebSocket 管理器
const wsManager = new WebSocketManager('Monitor_Admin', {
  maxReconnectAttempts: 5,
  onOpen: () => {},
  onMessage: (data) => {},
  onClose: () => {},
  onError: (error) => {},
  onStatusChange: (status) => {}
})

wsManager.connect()
```

### 4. **组合式函数封装业务逻辑**
```javascript
// 在组件中只需一行
const { cities, onlineCities, statistics, clearMessages } = useMonitor()

// 所有复杂逻辑都在 composable 中
```

### 5. **服务层封装地图操作**
```javascript
import { loadAmapJs, createMap, createCityMarker } from '../services/map.service'

await loadAmapJs()
const map = createMap(container)
const marker = createCityMarker(city, isOnline)
```

## 📁 文件结构

```
frontend/src/
├── config/
│   └── api.js                      # API 配置
├── utils/
│   └── http.js                     # HTTP 工具
├── services/
│   ├── api.service.js              # API 服务
│   ├── websocket.service.js        # WebSocket 服务
│   ├── map.service.js              # 地图服务
│   └── animation.service.js        # 动画服务
├── composables/
│   └── useMonitor.js               # 监控 Composable
└── views/
    ├── CommunicationMonitor.vue    # 原版（保留备份）
    └── CommunicationMonitorNew.vue # 重构版
```

## 🚀 使用方法

### 1. 切换到新版本

修改路由配置（`src/router/index.js`）：

```javascript
{
  path: '/monitor',
  name: 'monitor',
  component: () => import('../views/CommunicationMonitorNew.vue')  // 使用新版本
}
```

### 2. 修改 API 端口

如果后端运行在不同端口，只需修改 `src/config/api.js`:

```javascript
const API_BASE_URL = 'http://localhost:8001'  // 修改端口
const WS_BASE_URL = 'ws://localhost:8001'     // 修改端口
```

或使用环境变量（`.env` 文件）：

```env
VITE_API_BASE_URL=http://localhost:8001
VITE_WS_BASE_URL=ws://localhost:8001
```

### 3. 复用服务层

其他组件也可以使用这些服务：

```javascript
// 在任何组件中
import { apiService } from '@/services/api.service'
import { WebSocketManager } from '@/services/websocket.service'

// 获取在线城市
const { cities } = await apiService.getOnlineCities()

// 创建 WebSocket 连接
const ws = new WebSocketManager('Beijing', {
  onMessage: (data) => console.log(data)
})
ws.connect()
```

## 🔧 扩展和维护

### 添加新的 API 端点

1. 在 `config/api.js` 添加端点：
```javascript
export const API_ENDPOINTS = {
  // ... 现有端点
  NEW_ENDPOINT: `${API_BASE_URL}/new-endpoint`
}
```

2. 在 `services/api.service.js` 添加方法：
```javascript
export const apiService = {
  // ... 现有方法
  async getNewData() {
    const data = await get(API_ENDPOINTS.NEW_ENDPOINT)
    return { success: true, data }
  }
}
```

### 修改 WebSocket 行为

直接修改 `services/websocket.service.js` 中的 `WebSocketManager` 类。

### 添加新的地图功能

在 `services/map.service.js` 中添加新函数即可。

## ✅ 测试清单

- [ ] 地图加载正常
- [ ] 在线城市显示正常
- [ ] WebSocket 连接成功
- [ ] 消息接收和显示正常
- [ ] 消息动画播放正常
- [ ] 统计数据更新正常
- [ ] 断线重连功能正常
- [ ] 手动重连按钮工作正常
- [ ] 消息过滤功能正常
- [ ] 清空消息功能正常

## 🐛 Bug 修复

重构过程中修复的 Bug：

1. ✅ WebSocket 无限重连问题
2. ✅ 组件卸载时资源未清理
3. ✅ 端口硬编码问题
4. ✅ 在线城市刷新超时
5. ✅ Monitor_Admin 显示在在线列表
6. ✅ 错误处理不统一
7. ✅ 代码重复过多

## 📖 最佳实践

1. **配置集中管理** - 所有配置在 `config/` 目录
2. **服务层隔离** - 业务逻辑不直接调用 API
3. **组合式函数** - 使用 Vue 3 Composition API
4. **类型安全** - 返回统一的结果格式
5. **错误处理** - 统一的 try-catch 和日志
6. **资源清理** - 使用生命周期钩子正确清理
7. **可测试性** - 每个模块都可以独立测试

## 🔄 迁移步骤

1. ✅ 创建服务层文件
2. ✅ 创建配置文件
3. ✅ 创建工具函数
4. ✅ 创建 Composable
5. ✅ 创建新组件
6. ⏳ 测试新组件
7. ⏳ 更新路由
8. ⏳ 删除旧组件（确认无问题后）

---

**当前状态**: 重构完成，等待测试

**下一步**: 在路由中启用新组件并测试所有功能
