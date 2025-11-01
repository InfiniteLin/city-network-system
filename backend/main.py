"""
City Network System API
-----------------------
本模块创建并配置一个 FastAPI 应用，主要职责包括：
1. 统一挂载业务路由（来自 .routes 中的 APIRouter）。
2. 配置 CORS（跨域资源共享），以便本地 Vite 前端（默认端口 5173）在开发阶段可以直接访问 API。
3. 提供基础运维端点：
   - /health：健康检查（Kubernetes/容器/负载均衡可用）
   - /cities：查询当前“活跃城市”和“活跃连接数”，数据来源于全局连接管理器（connection_manager.manager）

注意：
- 本文件定位为“应用装配”与“对外网关”，尽量保持无业务逻辑，只做装配、配置与简单只读查询。
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict

# 引入全局的连接管理器（通常是单例），负责维护连接与城市的实时状态。
# 典型用法：管理 WebSocket 连接映射，如 {city: set[websocket]}，并提供统计查询方法。
from connection_manager import manager
from routing import routing_manager

# 引入分散在其他模块的业务路由集合，主程序只负责统一挂载，保持关注点分离。
from routes import router

# ========== 应用生命周期管理 ==========
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理（启动和关闭）"""
    # 启动时初始化
    from connection_manager import _ensure_log_task
    _ensure_log_task()
    print("✅ 异步日志系统已启动")
    
    yield
    
    # 关闭时清理（如果需要）
    print("🔌 应用正在关闭...")

# 创建 FastAPI 应用实例。
# - title 会出现在自动生成的交互式文档（/docs, /redoc）中，便于识别服务。
app = FastAPI(title="City Network System API", lifespan=lifespan)

# ========== CORS（跨域资源共享）配置 ==========
# 为什么需要 CORS：
#   在前后端分离、本地开发环境下，前端（Vite：localhost:5173）与后端（例如：localhost:8000）属于不同来源，
#   浏览器的同源策略会阻止跨域请求。添加 CORS 中间件允许指定来源的跨域访问，便于本地联调。
#
# allow_origins:
#   仅允许本地 Vite 开发服务器的两个常见域名，避免在开发阶段误开放给所有来源（更安全）。
#
# allow_credentials:
#   True 表示允许携带凭证（如 Cookie、Authorization 头等）。若设置为 True，则不应把 allow_origins 设置为 ["*"]。
#
# allow_methods / allow_headers:
#   这里为开发便利放开所有方法与头部；生产可收紧（仅保留实际需要的动词和头以降低攻击面）。
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",     # Vite 默认本地地址
        "http://127.0.0.1:5173",     # 兼容 127.0.0.1 访问
    ],
    allow_credentials=True,          # 允许携带 Cookie/授权头等凭证
    allow_methods=["*"],             # 允许所有 HTTP 方法（GET/POST/PUT/DELETE/...）
    allow_headers=["*"],             # 允许所有自定义头
)

# ========== 路由挂载 ==========
# 将 routes.py 中定义的 APIRouter 统一挂载到应用上。
# 好处：
#   - 主文件保持精简
#   - 业务接口按领域拆分在 routes 模块，清晰、易维护
app.include_router(router)


# ========== 运维与可观测性基础端点 ==========

@app.get("/health")
def health():
    """
    健康检查端点：
    - 用途：K8s liveness/readiness 探针、负载均衡健康检查、运维拨测等。
    - 同步函数：FastAPI 对同步/异步端点都能很好支持；健康检查通常不涉及 I/O，可用同步。
    - 返回固定结构，便于自动化检测。
    """
    return {"status": "ok"}


# 数据模型
class CityData(BaseModel):
    name: str
    lng: float
    lat: float

class EdgeData(BaseModel):
    u: int
    v: int
    w: float

class TopologyData(BaseModel):
    cities: List[CityData]
    edges: List[EdgeData]

@app.get("/cities")
async def get_cities():
    """
    获取当前在线城市及连接态势：
    返回当前有活跃 WebSocket 连接的城市列表
    """
    return {
        "cities": manager.get_active_cities(),
        "active_connections": manager.get_connection_count()
    }

@app.post("/topology")
async def load_topology(topology: TopologyData):
    """加载城市拓扑数据"""
    try:
        # 转换数据格式
        cities = [{"name": city.name, "lng": city.lng, "lat": city.lat} for city in topology.cities]
        edges = [{"u": edge.u, "v": edge.v, "w": edge.w} for edge in topology.edges]
        
        # 加载到路由管理器
        routing_manager.load_topology(cities, edges)
        
        return {
            "status": "success",
            "message": f"成功加载 {len(cities)} 个城市和 {len(edges)} 条边",
            "mst_edges": len(routing_manager.mst_edges)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"加载拓扑数据失败: {str(e)}")

@app.get("/route/{from_city}/{to_city}")
async def get_route(from_city: str, to_city: str):
    """获取两个城市间的路由路径"""
    try:
        # 首先检查拓扑是否已加载
        if not routing_manager.cities or len(routing_manager.cities) == 0:
            raise HTTPException(status_code=503, detail="拓扑数据未加载，请先在地图叠加页面上传CSV数据")
        
        # 检查城市是否存在于拓扑中
        available_cities = [city['name'] for city in routing_manager.cities]
        if from_city not in available_cities or to_city not in available_cities:
            missing = []
            if from_city not in available_cities:
                missing.append(from_city)
            if to_city not in available_cities:
                missing.append(to_city)
            raise HTTPException(status_code=404, detail=f"城市 {missing} 不在拓扑中。可用城市: {available_cities}")
        
        route = routing_manager.get_all_cities_in_route(from_city, to_city)
        if not route:
            mst_count = len(routing_manager.mst_edges) if hasattr(routing_manager, 'mst_edges') else 0
            raise HTTPException(status_code=404, detail=f"无法找到从 {from_city} 到 {to_city} 的路径。MST边数: {mst_count}")
        
        return {
            "from": from_city,
            "to": to_city,
            "route": route,
            "hops": len(route) - 1
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"获取路由失败: {str(e)}")

@app.get("/route")
async def get_route_query(from_city: str, to_city: str):
    """查询参数版本的路由接口：/route?from_city=上海&to_city=成都

    某些前端/浏览器环境下，非 ASCII 路径参数的匹配可能出现问题，此端点作为回退方案。
    返回结构与路径参数版本一致。
    """
    try:
        # 首先检查拓扑是否已加载
        if not routing_manager.cities or len(routing_manager.cities) == 0:
            raise HTTPException(status_code=503, detail="拓扑数据未加载，请先在地图叠加页面上传CSV数据")
        
        # 检查城市是否存在于拓扑中
        available_cities = [city['name'] for city in routing_manager.cities]
        if from_city not in available_cities or to_city not in available_cities:
            missing = []
            if from_city not in available_cities:
                missing.append(from_city)
            if to_city not in available_cities:
                missing.append(to_city)
            raise HTTPException(status_code=404, detail=f"城市 {missing} 不在拓扑中。可用城市: {available_cities}")
        
        route = routing_manager.get_all_cities_in_route(from_city, to_city)
        if not route:
            mst_count = len(routing_manager.mst_edges) if hasattr(routing_manager, 'mst_edges') else 0
            raise HTTPException(status_code=404, detail=f"无法找到从 {from_city} 到 {to_city} 的路径。MST边数: {mst_count}")
        
        return {
            "from": from_city,
            "to": to_city,
            "route": route,
            "hops": len(route) - 1
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"获取路由失败: {str(e)}")

@app.get("/topology/status")
async def topology_status():
    """查看当前后端已加载的拓扑状态（用于调试）。"""
    try:
        cities_count = len(routing_manager.cities)
        edges_count = len(routing_manager.edges)
        # 保证返回的一致性：如果城市或边为 0，则不应返回残留的 mst_edges
        if cities_count == 0 or edges_count == 0:
            mst_edges = []
            mst_edges_count = 0
        else:
            mst_edges = routing_manager.mst_edges or []
            mst_edges_count = len(mst_edges)

        return {
            "cities": cities_count,
            "edges": edges_count,
            "mst_edges_count": mst_edges_count,
            "mst_edges": mst_edges,  # 返回完整的 MST 边数组
            "city_names": [c.get("name") for c in routing_manager.cities],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"状态查询失败: {str(e)}")
