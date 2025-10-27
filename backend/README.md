# 后端代码结构说明

## 文件结构

```text
backend/
├── __init__.py              # Python包初始化文件
├── main.py                  # 主应用入口
├── connection_manager.py    # WebSocket连接管理器
├── websocket_routes.py      # WebSocket路由处理
├── routes.py               # API路由定义
├── requirements.txt        # 依赖包列表
└── README.md              # 本文件
```

## 代码组织

### 1. main.py - 主应用入口
- 创建FastAPI应用实例
- 配置CORS中间件
- 包含基础路由（健康检查、城市列表）
- 注册子路由


### 2. connection_manager.py - 连接管理器
- `ConnectionManager`类：管理所有WebSocket连接
- 提供连接、断开、消息广播等功能
- 维护活跃连接状态
- 全局连接管理器实例


### 3. websocket_routes.py - WebSocket路由处理
- `websocket_endpoint`函数：处理WebSocket连接
- 消息接收和广播逻辑
- 连接断开处理


### 4. routes.py - 路由定义
- 定义WebSocket路由
- 可以扩展其他API路由

## 主要功能


### WebSocket连接管理
- 支持多城市同时连接
- 自动处理连接建立和断开
- 消息广播给所有连接的客户端
- 系统消息通知


### API接口
- `GET /health` - 健康检查
- `GET /cities` - 获取活跃城市列表
- `POST /topology` - 加载城市拓扑（城市与边），用于后端计算最小生成树（MST）
	- 请求体示例：
		```json
		{
			"cities": [
				{"name": "北京", "lng": 116.4074, "lat": 39.9042},
				{"name": "上海", "lng": 121.4737, "lat": 31.2304}
			],
			"edges": [
				{"u": 0, "v": 1, "w": 10}
			]
		}
		```
	- 说明：u、v 为城市在 cities 数组中的索引（0-based），w 为边权重/造价。
- `GET /route/{from_city}/{to_city}` - 按最小生成树查询两城市间路径
	- 注意：若城市名包含非 ASCII 字符（如中文），前端应对路径参数进行 URL 编码（前端已处理）。
- `WebSocket /ws/{city}` - 城市通讯 WebSocket 连接（城市名同样支持 URL 编码）


## 启动方式

```bash
# 安装依赖
pip install -r requirements.txt

# 启动开发服务器
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 或使用批处理文件（Windows）
start_backend.bat
```


## 扩展说明

### 添加新的API路由
1. 在`routes.py`中添加新的路由函数
2. 使用`@router.get()`, `@router.post()`等装饰器
3. 路由会自动包含在主应用中

### 添加新的WebSocket处理
1. 在`websocket_routes.py`中添加新的处理函数
2. 在`routes.py`中注册新的WebSocket路由
3. 使用`@router.websocket()`装饰器

### 修改连接管理逻辑
1. 编辑`connection_manager.py`中的`ConnectionManager`类
2. 添加新的连接管理方法
3. 更新相关的路由处理函数


## 注意事项

1. **模块导入**：使用相对导入（如`from .connection_manager import manager`）
2. **异步处理**：WebSocket相关函数必须是异步的
3. **错误处理**：WebSocket连接可能随时断开，需要适当的异常处理
4. **资源清理**：连接断开时及时清理相关资源


## 典型工作流与排错提示

1) 首次或刷新后直接进入“城市通讯”页：
- 前端会尝试从 localStorage 读取 `cities`/`edges`，并将其回填到后端 `/topology`，确保后端已计算 MST。
- 若本地无 `edges`（未在“地图叠加”页上传过边表），则 `/route` 查询可能返回 404。此时请先到“地图叠加”页上传城市与边 CSV。

2) 常见问题：
- “无法获取路由信息”：通常是后端未加载拓扑或两城市在 MST 中不连通。请确认：
	- 已通过 `/topology` 正确加载了城市与边（“地图叠加”页会自动提交）。
	- 城市名称与城市数组中的 name 完全一致（区分大小写/空格）。
- “中文城市导致 404 路径问题”：前端已对 URL 参数进行编码；若手动调试，请自行对城市名做 URL 编码。
- WebSocket 无法连接：检查后端端口（默认 8000）与 CORS、浏览器控制台日志。


## 调试建议

1. **日志记录**：在关键位置添加日志输出
2. **连接状态**：定期检查连接状态
3. **消息格式**：确保消息格式正确
4. **异常处理**：捕获并处理可能的异常
