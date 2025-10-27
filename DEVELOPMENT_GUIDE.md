# 城市网络通信系统开发文档

## 1. 项目概览
本项目分为 **前端（Vue + ECharts + WebSocket）** 与 **后端（FastAPI + NetworkX + 自定义加密模块）** 两部分，用于模拟城市间通信网络的构建、监控与消息交互。

## 2. 代码组织架构
```
city-network-system/
├─ backend/                  # 后端服务
│  ├─ main.py                # FastAPI 引导与路由注册
│  ├─ routing.py             # 拓扑加载、最小生成树、路径查询
│  ├─ crypto/                # 加密相关模块
│  │  ├─ __init__.py
│  │  └─ crypto_manager.py   # AES + 哈夫曼编码实现
│  ├─ connection_manager.py  # WebSocket 连接与消息转发
│  ├─ models/                # Pydantic 数据模型
│  └─ utils/                 # 日志、缓存等工具
│
├─ frontend/
│  ├─ src/
│  │  ├─ main.ts / App.vue   # 入口文件
│  │  ├─ router/             # 路由定义，包含 /monitor
│  │  ├─ stores/             # Pinia 状态（拓扑、实时消息）
│  │  ├─ components/         # 地图、统计卡片、控制条等通用组件
│  │  └─ views/
│  │     ├─ CommunicationMonitor.vue  # 当前监控主界面
│  │     ├─ NetworkDesign.vue         # 网络设计/MST 可视化
│  │     └─ CityCommunication.vue     # 城市通信模拟页面
│  └─ public/               # 静态资源
│
├─ test_backend.py          # 后端功能快速验证脚本
├─ 00_START_HERE.md         # 文档导航
└─ TESTING_GUIDE.md 等文档
```

## 3. 后端实现要点

### 3.1 FastAPI 服务（`backend/main.py`）
- 挂载 REST 接口：拓扑管理 (`/topology/load`、`/topology/status`)、路由查询 (`/routing/path`)、密钥协商 (`/crypto/shared-key`)。
- 提供 WebSocket 端点 `/ws/admin`：用于与前端实时通信。

### 3.2 拓扑与路由（`backend/routing.py`）
- 使用 NetworkX 维护城市图。
- `load_topology(cities, edges)`：加载节点与边，校验连通性。
- `build_mst()`：计算最小生成树，返回给前端显示蓝色连线。
- `get_all_cities_in_route(src, dst)`：查询最短路径并返回城市序列。

### 3.3 加密模块（`backend/crypto/crypto_manager.py`）
- `generate_key()`：随机生成 AES 密钥。
- `encrypt_message(message, key)`：哈夫曼编码 → AES-ECB → Base64；返回编码结果及码表。
- `decrypt_message(encrypted_b64, key, codes)`：逆过程还原明文。
- `establish_shared_key(city1, city2)`：按城市对生成并缓存共享密钥，供消息传输使用。

### 3.4 WebSocket 连接管理（`backend/connection_manager.py`）
- 维护在线城市的 WebSocket 连接与状态。
- `broadcast_system_message()`：广播系统事件（加入、离开、MST 更新等）。
- `send_private_message()`：点对点传输，支持加密负载。

## 4. 前端实现要点

### 4.1 状态管理（`frontend/src/stores`）
- `useTopologyStore`：保存城市、边、MST、在线城市列表。
- `useMonitorStore`：实时消息列表、系统日志、WebSocket 状态。

### 4.2 监控视图（`frontend/src/views/CommunicationMonitor.vue`）
- 生命周期加载：调用 `/topology/status` 获取拓扑、在线城市。
- WebSocket：
  - `initWebSocket()` 连接后端 `/ws/admin`。
  - `handleSystemMessage()` 解析系统事件，更新在线城市与日志。
  - `handleTrafficMessage()` 追加实时流量数据。
- UI 展示：
  - 左侧地图组件 `MapView`（基于 ECharts，自适应蓝色主题）。
  - 顶部统计卡片：在线城市总数、消息总量、实时链路。
  - 右侧面板：在线城市列表、实时消息、操作日志。
  - 控制按钮：暂停/恢复消息、清空列表、上传拓扑。

### 4.3 网络设计视图（`NetworkDesign.vue`）
- 展示拓扑与 MST 边权。
- 提供边权编辑、重新计算 MST、显示 Infinity 边权符号等。

### 4.4 其他组件
- `CityPanel`：城市信息卡片，显示连接状态、流量。
- `LogViewer`：可滚动日志窗口，支持自动滚动与过滤。
- `FileUploader`：上传 CSV 拓扑文件，提交给 `/topology/load`。

## 5. 功能点前后端协同

| 功能 | 后端实现 | 前端实现 |
|------|----------|----------|
| **拓扑加载** | `/topology/load` 接收 CSV 解析结果，存入内存图结构，返回成功状态及 MST | `TopologyUploader` 将文件转换 JSON，调用接口，成功后刷新拓扑视图 |
| **最小生成树展示** | `routing_manager.build_mst()` 计算 MST | `CommunicationMonitor` & `NetworkDesign` 接收数据，在地图上绘制蓝色边 |
| **在线城市管理** | WebSocket `connection_manager` 记录连入城市，系统消息广播加入/离开 | `useTopologyStore` 更新在线列表，右侧“在线城市”实时刷新 |
| **消息路由** | `routing_manager.get_all_cities_in_route()` 返回路径；WebSocket 转发消息 | `CityCommunication` 调用 API 获取路径，UI 显示逐城市传递动画 |
| **加密传输** | `crypto_manager.encrypt_message()`、`decrypt_message()` | 通过 REST 获取加密结果，联动 UI 展示哈夫曼、AES 详情 |
| **共享密钥** | `establish_shared_key()` 生成并缓存 | 前端在城市间发消息前请求密钥状态，用于模拟握手流程 |
| **系统监控日志** | 后端每次事件调用 `broadcast_system_message()` | `CommunicationMonitor` 订阅系统消息，追加到日志面板 |

## 6. 数据流概览
1. **拓扑初始化**：前端上传 CSV → 后端解析并缓存 → 返回成功 → 前端刷新地图 & MST。
2. **实时监控**：前端打开 `/monitor` → 建立 WebSocket → 后端推送历史状态与后续事件。
3. **消息传输**：前端选择城市发送 → 调用后端路由 & 加密 → 后端沿路径广播 → WebSocket 推送到监控界面。
4. **离线/异常**：后端监测连接断开 → 推送“城市离线” → 前端更新在线城市与日志。

## 7. 开发与调试建议
- **后端**：使用 `uvicorn backend.main:app --reload` 启动；`test_backend.py` 可快速验证加密、路由、密钥功能。
- **前端**：`npm install && npm run dev`；留意 `src/stores` 中的状态是否同步更新，必要时调整 action。
- **联合联调**：先确保 `/topology/status` 返回正确数据，再观察 WebSocket 事件是否抵达前端并正确解析。

---

如需扩展功能，可在此文档基础上补充新的模块说明或接口定义。