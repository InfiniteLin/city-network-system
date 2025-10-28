"""
WebSocket路由处理
处理城市通讯的WebSocket连接和消息
"""
import json
import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from connection_manager import manager, debug_log


async def websocket_endpoint(websocket: WebSocket, city: str):
    """WebSocket端点处理函数"""
    debug_log(f"[WebSocket] ========== 新连接请求 ==========")
    debug_log(f"[WebSocket] 城市: {city}")
    debug_log(f"[WebSocket] 当前连接数: {manager.get_connection_count()}")
    
    try:
        await manager.connect(websocket, city)
        debug_log(f"[WebSocket] ✅ 城市 {city} 连接成功")
        
        # 主消息循环
        while True:
            try:
                data = await websocket.receive_text()
                message_data = json.loads(data)
                debug_log(f"[WebSocket] 📨 来自 {city} 的消息: type={message_data.get('type')}")
                
                # 处理心跳 ping 消息
                if message_data.get("type") == "ping":
                    # 立即响应 pong
                    pong_msg = {"type": "pong", "timestamp": message_data.get("timestamp")}
                    try:
                        await asyncio.wait_for(
                            websocket.send_text(json.dumps(pong_msg)),
                            timeout=1.0
                        )
                        debug_log(f"[WebSocket] 💓 响应 pong 到 {city}")
                    except Exception as e:
                        debug_log(f"[WebSocket] ⚠️ 发送 pong 失败: {e}")
                    continue
                
                if message_data.get("type") == "message":
                    # 广播消息给所有连接的客户端
                    await manager.broadcast_message(message_data)
                elif message_data.get("type") == "encrypted_message":
                    # 处理加密消息
                    await manager.decrypt_and_deliver_message(message_data, city)
                elif message_data.get("type") == "send_encrypted":
                    # 发送加密消息 - 使用后台任务，立即返回避免阻塞
                    debug_log(f"[WebSocket] 🔐 处理send_encrypted消息")
                    to_city = message_data.get("to")
                    message = message_data.get("message")
                    debug_log(f"[WebSocket] 发送方: {city}, 收件人: {to_city}, 消息长度: {len(message) if message else 0}")
                    
                    if not to_city:
                        debug_log(f"[WebSocket] ⚠️ 缺少收件人")
                        continue
                    if not message:
                        debug_log(f"[WebSocket] ⚠️ 缺少消息内容")
                        continue
                    
                    # 创建后台任务处理加密消息，不等待完成
                    asyncio.create_task(manager.send_encrypted_message(city, to_city, message))
                    debug_log(f"[WebSocket] ✅ 已创建后台任务处理加密消息")
                
            except json.JSONDecodeError as e:
                debug_log(f"[WebSocket] ⚠️ JSON解析失败 from {city}: {e}")
                continue
            except WebSocketDisconnect:
                # WebSocket正常断开，跳出循环
                debug_log(f"[WebSocket] 🔌 {city} WebSocket在消息循环中断开")
                raise
            except RuntimeError as e:
                # RuntimeError通常表示WebSocket已关闭
                error_msg = str(e)
                if "disconnect" in error_msg.lower() or "receive" in error_msg.lower():
                    debug_log(f"[WebSocket] 🔌 {city} 连接已关闭(RuntimeError): {error_msg}")
                    raise WebSocketDisconnect()
                # 其他RuntimeError继续抛出
                raise
            except Exception as e:
                error_msg = str(e)
                # 检查是否是断开连接相关的错误
                if "disconnect" in error_msg.lower() or "closed" in error_msg.lower() or "receive" in error_msg.lower():
                    debug_log(f"[WebSocket] 🔌 {city} 连接已关闭: {error_msg}")
                    raise WebSocketDisconnect()
                debug_log(f"[WebSocket] ⚠️ 处理消息时出错 from {city}: {e}")
                import traceback
                debug_log(f"[WebSocket] 错误堆栈:\n{traceback.format_exc()}")
                # 其他未知错误也应该断开，避免无限循环
                raise WebSocketDisconnect()
            
    except WebSocketDisconnect:
        debug_log(f"[WebSocket] 🔌 城市 {city} 正常断开连接")
        manager.disconnect(city, websocket)
        # ⚠️ 移除 broadcast_system_message 调用避免死锁
        if city != "Monitor_Admin":
            debug_log(f"[WebSocket] 🔌 {city} 已离开城市通讯网络")
    except Exception as e:
        debug_log(f"[WebSocket] ❌ 城市 {city} 发生异常: {e}")
        import traceback
        debug_log(traceback.format_exc())
        manager.disconnect(city, websocket)
    finally:
        debug_log(f"[WebSocket] 城市 {city} 连接处理结束，当前连接数: {manager.get_connection_count()}")
