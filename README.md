# 城市网络系统项目文档

本项目是一个前后端分离的城市通信仿真平台，包含实时 WebSocket 消息、加密传输、最小生成树路由可视化等功能。本文档从整体架构、核心功能实现与涉及文件三个维度进行说明，帮助快速理解与维护整个代码库。

---

## 1. 架构总览

| 分层 | 技术栈 | 主要职责 | 关键目录 |
|------|--------|----------|-----------|
| 前端 | Vue 3 + Vite + 高德地图 JS SDK | 拓扑可视化、实时消息监控、动画展示、用户交互 | `frontend/` |
| 后端 | FastAPI + asyncio | WebSocket 消息路由、城市拓扑与最小生成树计算、加密处理、API 服务 | `backend/` |
| 数据 | CSV 拓扑文件 + 调试日志 | 拓扑输入样例、后端运行日志 | `test_data/`, `backend_debug.log` |

运行方式：

- 开发阶段可直接执行 `start_all.py` 启动后端（FastAPI）与前端（Vite）。
- 部署阶段分别安装 `backend/requirements.txt` 和 `frontend/package.json` 中依赖即可。

---

## 2. 后端功能

### 2.1 FastAPI 应用装配与基础接口

- **文件**：`backend/main.py`
- **职责**：
  - 创建 `FastAPI` 实例并挂载 `routes.py` 中的业务路由。
  - 配置 CORS，使前端 (`localhost:5173`) 可以跨域访问。
  - 提供基础运维 API：
    - `GET /health`：健康检查。
    - `GET /cities`：返回当前活跃 WebSocket 城市及连接数。
    - `POST /topology`：加载城市与边信息，写入路由管理器。
    - `GET /route/{from}/{to}` 与 `GET /route?from_city=&to_city=`：查询最小生成树（MST）路径。
    - `GET /topology/status`：调试用途，查看已加载拓扑状态及 MST 边列表。

### 2.2 WebSocket 路由

- **文件**：`backend/routes.py`
- **职责**：将路径 `/ws/{city}` 映射到 `websocket_routes.websocket_endpoint`。

### 2.3 WebSocket 消息循环与心跳响应

- **文件**：`backend/websocket_routes.py`
- **关键逻辑**：
  - 在 `websocket_endpoint` 中接受连接并进入消息循环。
  - 处理三类业务消息：
    1. `type=message`：普通广播转发至所有在线城市。
    2. `type=send_encrypted`：提交给 `ConnectionManager.send_encrypted_message` 处理。
    3. `type=encrypted_message`：供前端演示加密流程的回显。
  - 2025-10 增补心跳机制：收到 `type=ping` 后即时回复 `type=pong`，并写调试日志。
  - 捕获断线、JSON 解析等异常，确保连接被清理并记录日志。

### 2.4 连接管理与加密消息转发

- **文件**：`backend/connection_manager.py`
- **核心功能**：
  - 维护 `active_connections` 映射：城市 → 当前 WebSocket。
  - 统一负责连接接受、断开 (`connect` / `disconnect`) 与广播 (`broadcast_message`)。
  - `send_encrypted_message` 实现端到端加密消息转发：
    1. 校验拓扑是否加载并计算 MST 路径（依赖 `routing_manager`）。
    2. 使用 `crypto_manager.establish_shared_key` 建立 Diffie-Hellman 风格共享密钥（线程池异步执行，避免阻塞事件循环）。
    3. 调用 `crypto_manager.encrypt_message` 完成哈夫曼编码 + AES(Fernet) 加密。
    4. 构造加密消息包（包含 `route`、`huffman_codes` 等信息）。
    5. 按 MST 路径逐城发送，针对发送超时或断线进行处理。
    6. 向监控端 `Monitor_Admin` 发送一份副本。
  - 详细的调试日志记录在 `backend_debug.log`，便于性能分析。

### 2.5 加密模块

- **文件**：`backend/crypto.py`
- **实现要点**：
  - `CryptoManager` 内含：
    - Diffie-Hellman 风格密钥交换 (`key_exchange`)，在 `ThreadPoolExecutor(max_workers=16)` 中异步执行。
    - AES(Fernet) 加密与哈夫曼编码结合的消息压缩（`encrypt_message` / `decrypt_message`）。
    - 共享密钥缓存，避免重复协商。
  - `HuffmanEncoder` 独立实例化，避免线程安全问题。

### 2.6 路由与最小生成树

- **文件**：`backend/routing.py`
- **职责**：
  - `RoutingManager` 负责加载城市与边数据，建立邻接表。
  - 使用 Kruskal 算法构建 MST (`_compute_mst`) ，并保留 MST 邻接表。
  - `find_route` 基于 BFS 在 MST 上查找城市间路径，供前端动画和后端转发使用。

### 2.7 启动脚本与依赖

- **文件**：
  - `start_all.py`：开发模式下同时启动 Uvicorn 与 Vite。
  - `backend/requirements.txt`：后端依赖列表。

---

## 3. 前端功能

### 3.1 应用初始化

- **文件**：`frontend/src/main.js`, `frontend/src/App.vue`
- 创建 Vue 应用并挂载 `router`（如有）、全局样式 `assets/global.css`。
- `App.vue` 提供基础布局与路由出口。

### 3.2 视图组件

- **目录**：`frontend/src/views/`
  - `CommunicationMonitor.vue`：核心大屏，负责地图渲染、WebSocket 消息流、统计面板等。
    - 初始化流程：检查后端健康 → 加载拓扑 (`useTopology`) → 初始化地图 (`MapManager`) → 启动 WebSocket (`useMonitorWebSocket`)。
    - 处理消息：过滤显示、更新统计、调用 `MessageAnimator` 绘制动画。
  - 其他视图（如 `CityCommunication.vue`, `NetworkDesign.vue` 等）可扩展用于不同展示场景。

### 3.3 服务层

- **目录**：`frontend/src/services/`
  - `mapManager.service.js`：封装高德地图初始化、城市标记、MST 边绘制。
  - `messageAnimation.service.js`：创建沿 MST 路径的消息粒子动画；支持自定义颜色、到达特效等。
  - `websocket.service.js`：WebSocket 管理类（连接、重连、心跳、事件回调）。
  - `api.service.js`：封装 REST API 调用（健康检查、拓扑加载、路由查询等）。
  - `animation.service.js`, `map.service.js` 等提供额外交互（如地图动画、聚焦）。

### 3.4 组合式函数（Composable）

- **目录**：`frontend/src/composables/`
  - `useMonitorWebSocket.js`：基于 `WebSocketManager` 包装城市监控逻辑，暴露状态与手动重连接口。
  - `useTopology.js`：集中管理拓扑数据加载、城市列表和 MST 边状态。
  - 其他如 `useMessageAnimation.js`（若存在）可拆分动画状态。

### 3.5 配置与工具

- `frontend/src/config/api.js`：统一维护后端 API 基址、超时与重试策略。
- `frontend/src/utils/http.js`：使用 `fetch` 包装 GET/POST 请求，处理超时与 JSON 解析。
- `frontend/src/utils/crypto.js`：前端的加/解密辅助（若使用）。
- `frontend/eslint.config.js`, `vite.config.js` 等工程配置文件。

### 3.6 WebSocket 心跳

- **文件**：`frontend/src/services/websocket.service.js`
  - `startHeartbeat()` 每 30 秒发送 `type=ping`。
  - `handlePong()` 清除超时定时器，确认连接存活。
  - 若 10 秒未收到 `pong`，则主动关闭连接触发重连。
  - 控制台输出心跳日志，便于调试。

### 3.7 消息动画实现

- **文件**：`frontend/src/services/messageAnimation.service.js`
  - `MessageAnimator` 初始化时接收地图实例与 MST 边数据。
  - `setEdges()` 构建 MST 邻接表，用于查找路径。
  - `animateMessage()` 根据消息类型（广播/点对点）决定目标城市，并调用 `createMessageAnimation()`。
  - `createMessageAnimation()` 优先使用后端提供的 `route`，若缺失则回退 BFS 查找；绘制前景/背景线条并启动粒子。
  - 粒子由 `createPathParticle()` 创建，使用 `requestAnimationFrame` 均匀推进，确保与 Polyline 对齐。

---

## 4. 端到端消息流程

1. **用户操作**：
   - 在前端界面选择发送城市与消息内容，调用 WebSocket `send`。
   - 广播消息 type=`message`，点对点加密消息 type=`send_encrypted`。

2. **前端 WebSocket 管理**：
   - `websocket.service.js` 将数据序列化并发送，维护连接与心跳。

3. **后端接收**：
   - `websocket_routes.websocket_endpoint` 解析消息类型。
   - 加密消息交给 `ConnectionManager.send_encrypted_message`。

4. **路由与加密**：
   - `routing_manager` 在 MST 中寻找路由路径。
   - `crypto_manager` 建立共享密钥并完成哈夫曼 + AES 加密。
   - 将包含 `route`、`encrypted_data`、`huffman_codes` 的包发送给路径上的每个城市及监控端。

5. **前端展示**：
   - `useMonitorWebSocket` 接收消息，更新统计并调用 `MessageAnimator`。
   - `messageAnimation.service.js` 根据 `route` 绘制沿 MST 的动画粒子。

---

## 5. 调试与监控

- **日志**：`backend_debug.log`
  - 记录连接、加密耗时、发送结果等详细信息。
  - 发生阻塞或断线时优先查看。
- **测试脚本**：
  - `test_backend.py`、`test_cities_endpoint.py`、`test_online_cities.py` 等用于单元/集成验证。
- **调试接口**：
  - `GET /topology/status` 查看当前拓扑与 MST 加载情况。
  - `GET /route` 手动验证路由是否正确。

---

## 6. 目录参考

```text
city-network-system/
├── backend/
│   ├── main.py
│   ├── routes.py
│   ├── websocket_routes.py
│   ├── connection_manager.py
│   ├── routing.py
│   ├── crypto.py
│   ├── requirements.txt
│   └── ...
├── frontend/
│   ├── src/
│   │   ├── main.js
│   │   ├── App.vue
│   │   ├── views/CommunicationMonitor.vue
│   │   ├── services/
│   │   │   ├── mapManager.service.js
│   │   │   ├── messageAnimation.service.js
│   │   │   ├── websocket.service.js
│   │   │   └── api.service.js
│   │   ├── composables/
│   │   │   ├── useMonitorWebSocket.js
│   │   │   └── useTopology.js
│   │   └── utils/
│   └── package.json
├── test_data/
│   ├── test_basic_5cities.csv
│   ├── test_medium_10cities.csv
│   └── ...
├── start_all.py
├── backend_debug.log
└── PROJECT_DOCUMENTATION.md  (本文档)
```

---

## 7. 建议的后续扩展

- 在前端文档（`frontend/README.md`）中添加本项目特有的运行说明。
- 将调试日志写入分段文件或使用 logging 模块控制级别，避免单文件过大。
- 引入自动化测试覆盖前后端关键流程，集成到 CI 中。

如需更详细的模块级别注释或序列图，可以在此文档基础上继续扩展。希望本文档能够帮助您快速掌握城市网络系统的整体实现。
