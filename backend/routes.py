"""
API路由定义
包含所有API端点的路由配置
"""
from fastapi import APIRouter, WebSocket
from websocket_routes import websocket_endpoint

# 创建路由器
router = APIRouter()

# WebSocket路由
@router.websocket("/ws/{city}")
async def websocket_route(websocket: WebSocket, city: str):
    """WebSocket路由"""
    await websocket_endpoint(websocket, city)
