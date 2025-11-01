"""
WebSocket连接管理器
负责管理城市通讯的WebSocket连接
"""
import json
import asyncio
import time
from typing import Dict, List
from fastapi import WebSocket
from routing import routing_manager
from crypto import crypto_manager, HuffmanEncoder
import sys
from pathlib import Path

# 启用日志输出
DEBUG_LOG_FILE = Path(__file__).parent.parent / "backend_debug.log"

# 创建一个日志队列用于异步写入
_log_queue = asyncio.Queue()
_log_task = None

async def _log_writer():
    """后台日志写入任务"""
    try:
        # 批量写入日志，减少IO操作
        batch = []
        last_write_time = asyncio.get_event_loop().time()
        
        while True:
            try:
                # 等待日志消息，但每0.5秒强制写入一次
                timeout = 0.5 - (asyncio.get_event_loop().time() - last_write_time)
                if timeout > 0:
                    message = await asyncio.wait_for(_log_queue.get(), timeout=timeout)
                    batch.append(message)
                else:
                    message = None
            except asyncio.TimeoutError:
                message = None
            
            # 收集更多消息（非阻塞）
            while not _log_queue.empty() and len(batch) < 100:
                try:
                    batch.append(_log_queue.get_nowait())
                except asyncio.QueueEmpty:
                    break
            
            # 批量写入文件
            if batch:
                try:
                    with open(DEBUG_LOG_FILE, "a", encoding="utf-8", buffering=8192) as f:
                        f.writelines(batch)
                    batch.clear()
                    last_write_time = asyncio.get_event_loop().time()
                except Exception:
                    pass  # 静默失败
            
            # 如果没有消息且队列为空，短暂休眠
            if message is None and _log_queue.empty():
                await asyncio.sleep(0.1)
                
    except asyncio.CancelledError:
        # 清理剩余日志
        if batch:
            try:
                with open(DEBUG_LOG_FILE, "a", encoding="utf-8", buffering=8192) as f:
                    f.writelines(batch)
            except Exception:
                pass

def _ensure_log_task():
    """确保日志写入任务正在运行"""
    global _log_task
    if _log_task is None or _log_task.done():
        try:
            loop = asyncio.get_event_loop()
            _log_task = loop.create_task(_log_writer())
        except RuntimeError:
            # 事件循环未运行，忽略
            pass

def debug_log(message: str):
    """写入调试日志（真正的非阻塞）"""
    try:
        timestamp = asyncio.get_event_loop().time()
        formatted_message = f"[{timestamp:.2f}] {message}\n"
        _ensure_log_task()
        # 非阻塞地放入队列
        try:
            _log_queue.put_nowait(formatted_message)
        except asyncio.QueueFull:
            # 队列满了就丢弃，不阻塞
            pass
    except Exception:
        # 完全静默失败，不影响主流程
        pass


class ConnectionManager:
    """WebSocket连接管理器"""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.city_connections: Dict[str, List[WebSocket]] = {}
        # 心跳保活任务：key 使用 websocket 实例 id，value 为 asyncio.Task
        self.keepalive_tasks: Dict[int, asyncio.Task] = {}
        self.keepalive_interval = 15  # 秒，更频繁的心跳以保持连接活跃

    async def connect(self, websocket: WebSocket, city: str):
        """建立WebSocket连接"""
        try:
            await websocket.accept()
            debug_log(f"[connect] WebSocket 已接受，城市: {city}")
        except Exception as e:
            debug_log(f"[connect] WebSocket 接受失败: {e}")
            raise
        
        # 如果该城市已有连接，先断开旧连接
        if city in self.active_connections:
            debug_log(f"[connect] 城市 {city} 已存在连接，断开旧连接")
            old_websocket = self.active_connections[city]
            try:
                await old_websocket.close()
            except:
                pass
            self.disconnect(city, old_websocket)
        
        # 添加新连接
        self.active_connections[city] = websocket
        if city not in self.city_connections:
            self.city_connections[city] = []
        self.city_connections[city].append(websocket)
        
        debug_log(f"[connect] 城市 {city} 连接成功，当前活跃连接: {len(self.active_connections)}")
        debug_log(f"[connect] 活跃城市列表: {list(self.active_connections.keys())}")
        
        # ⚠️ 移除 broadcast_system_message 调用避免潜在死锁
        # 改为只记录日志
        if city != "Monitor_Admin":
            debug_log(f"[connect] 🌐 {city} 已加入城市通讯网络")
        else:
            debug_log(f"[connect] Monitor_Admin 连接，跳过广播")

        # 启动服务器侧的心跳保活，避免长时间无数据被中间件断开
        self._start_keepalive(city, websocket)

    def disconnect(self, city: str, websocket: WebSocket):
        """断开WebSocket连接 - 只断开指定的 websocket 实例"""
        debug_log(f"[disconnect] 断开城市 {city} 的连接")
        
        # 只有当 active_connections 中的 websocket 与传入的相同时才删除
        if city in self.active_connections:
            if self.active_connections[city] == websocket:
                del self.active_connections[city]
                debug_log(f"[disconnect] 从 active_connections 移除 {city}")
            else:
                debug_log(f"[disconnect] ⚠️ {city} 的 websocket 不匹配，可能已被新连接替换，跳过删除")
        
        if city in self.city_connections:
            if websocket in self.city_connections[city]:
                self.city_connections[city].remove(websocket)
                debug_log(f"[disconnect] 从 city_connections 移除 {city} 的一个连接")
            if not self.city_connections[city]:
                del self.city_connections[city]
                debug_log(f"[disconnect] 清空 {city} 的 city_connections")
        
        # 停止心跳任务
        self._stop_keepalive(websocket)

        debug_log(f"[disconnect] 断开完成，剩余活跃连接: {len(self.active_connections)}")
        debug_log(f"[disconnect] 剩余城市列表: {list(self.active_connections.keys())}")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        """发送个人消息（无超时限制）"""
        try:
            await websocket.send_text(message)
        except Exception as e:
            debug_log(f"[send_personal_message] 发送失败: {e}")

    async def broadcast_message(self, message: dict):
        """广播消息给所有连接的客户端（并行发送，非阻塞）"""
        # 创建副本避免在迭代时修改字典
        connections = list(self.active_connections.items())
        if not connections:
            return
        
        message_json = json.dumps(message)
        
        # 并行发送消息给所有连接
        async def send_to_one(city, websocket):
            try:
                await websocket.send_text(message_json)
                return None  # 成功
            except Exception as e:
                error_msg = str(e)
                debug_log(f"[broadcast_message] 发送到 {city} 失败: {error_msg}")
                # 只有在明确是连接断开的情况下才标记为断开
                if any(keyword in error_msg.lower() for keyword in ['closed', 'disconnect', 'connection', 'reset']):
                    debug_log(f"[broadcast_message] {city} 被标记为断开")
                    return (city, websocket)  # 需要断开
                else:
                    debug_log(f"[broadcast_message] {city} 发送失败但可能是临时错误，保留连接")
                    return None
        
        # 并行执行所有发送操作
        results = await asyncio.gather(
            *[send_to_one(city, ws) for city, ws in connections],
            return_exceptions=True
        )
        
        # 收集需要断开的连接
        disconnected_cities = [r for r in results if r is not None and not isinstance(r, Exception)]
        
        # 在遍历完成后再移除断开的连接
        for city, websocket in disconnected_cities:
            self.disconnect(city, websocket)
    
    async def send_encrypted_message(self, from_city: str, to_city: str, message: str):
        """发送加密消息，按照MST路由传递"""
        start_time = time.time()
        
        try:
            debug_log(f"\n=== send_encrypted_message 被调用 ===")
            debug_log(f"发送方: {from_city}, 接收方: {to_city}, 消息: {message[:50]}...")
            
            # 1. 检查拓扑是否已加载
            step_start = time.time()
            if not routing_manager.cities or len(routing_manager.cities) == 0:
                error_msg = f"拓扑数据未加载，无法发送加密消息。请先在'城市地图'页面上传拓扑数据。"
                debug_log(f"ERROR: 拓扑数据未加载，无法发送加密消息。请先在'城市地图'页面上传拓扑数据。")
                # 直接向发送者发送错误通知（按 city 名查找 websocket）
                try:
                    if from_city in self.active_connections:
                        await self.active_connections[from_city].send_text(json.dumps({
                            "type": "error",
                            "message": error_msg
                        }))
                except Exception as _:
                    debug_log(f"WARN: 向 {from_city} 发送拓扑未加载错误失败")
                return  # 返回而不是抛出异常
            
            # 2. 获取路由路径
            route = routing_manager.get_all_cities_in_route(from_city, to_city)
            debug_log(f"⏱️ 计算路由耗时: {(time.time() - step_start) * 1000:.2f}ms")
            debug_log(f"计算得到的路由: {route}")
            debug_log(f"当前活跃连接: {list(self.active_connections.keys())}")
            
            if not route:
                error_msg = f"无法找到从 {from_city} 到 {to_city} 的路径。可能的原因：1) 两城市不在同一连通分量 2) 拓扑数据不完整"
                debug_log(f"ERROR: {error_msg}")
                try:
                    if from_city in self.active_connections:
                        await self.active_connections[from_city].send_text(json.dumps({
                            "type": "error",
                            "message": error_msg
                        }))
                except Exception:
                    debug_log(f"WARN: 向 {from_city} 发送找不到路径错误失败")
                return  # 返回而不是抛出异常
            
            # 2. 建立共享密钥（异步操作，不阻塞事件循环）
            step_start = time.time()
            try:
                shared_key = await crypto_manager.establish_shared_key(from_city, to_city)
                debug_log(f"⏱️ 建立共享密钥耗时: {(time.time() - step_start) * 1000:.2f}ms")
                debug_log(f"共享密钥建立成功")
            except Exception as e:
                debug_log(f"ERROR: 建立共享密钥失败: {e}")
                raise
            
            # 3. 加密消息（异步操作，不阻塞事件循环）
            step_start = time.time()
            try:
                encrypted_data, huffman_encoded, huffman_codes = await crypto_manager.encrypt_message(message, shared_key)
                debug_log(f"⏱️ 加密消息耗时: {(time.time() - step_start) * 1000:.2f}ms")
                
                debug_log(f"加密结果:")
                debug_log(f"  encrypted_data type: {type(encrypted_data)}, len: {len(str(encrypted_data))}")
                debug_log(f"  huffman_encoded type: {type(huffman_encoded)}, len: {len(str(huffman_encoded))}")
                debug_log(f"  huffman_codes type: {type(huffman_codes)}, num of codes: {len(huffman_codes) if huffman_codes else 0}")
            except Exception as e:
                debug_log(f"ERROR: 加密消息失败: {e}")
                import traceback
                debug_log(traceback.format_exc())
                raise
            
            # 4. 创建加密消息包（包含完整的解密信息）
            encrypted_message = {
                "type": "encrypted_message",
                "from": from_city,
                "to": to_city,
                "route": route,
                "original_message": message,           # 原始消息（用于前端演示）
                "huffman_encoded": huffman_encoded,   # 哈夫曼编码后的二进制字符串
                "huffman_codes": huffman_codes,       # 哈夫曼编码表（解密必需）
                "encrypted_data": encrypted_data,     # AES加密后的Base64字符串
                "timestamp": asyncio.get_event_loop().time()
            }
            
            # 验证消息可以被JSON序列化
            try:
                message_json = json.dumps(encrypted_message, ensure_ascii=False)
                debug_log(f"消息包创建并序列化成功，大小: {len(message_json)} 字节")
            except Exception as e:
                debug_log(f"ERROR: JSON序列化失败: {e}")
                debug_log(f"  原始消息类型: {type(message)}")
                debug_log(f"  huffman_codes 内容: {huffman_codes}")
                raise
            
            # 5. 并行发送消息给路由上的所有城市
            debug_log(f"开始发送消息给路由上的城市...")
            
            async def send_to_city(city):
                """向单个城市发送消息"""
                debug_log(f"  [并行] 处理城市: {city}")
                if city in self.active_connections:
                    try:
                        debug_log(f"  发送给: {city} - 准备发送")
                        await self.active_connections[city].send_text(message_json)
                        debug_log(f"  ✅ 发送成功: {city}")
                        return (True, city, None)  # 成功
                    except Exception as e:
                        error_msg = str(e)
                        debug_log(f"  ❌ 发送失败: {error_msg}")
                        
                        # 只有在明确是连接问题时才断开
                        if any(keyword in error_msg.lower() for keyword in ['closed', 'disconnect', 'connection', 'reset']):
                            debug_log(f"  ⚠️ {city} 连接已断开，将移除")
                            return (False, city, self.active_connections.get(city))  # 需要断开
                        else:
                            debug_log(f"  ⚠️ {city} 发送失败但可能是临时错误，保留连接")
                            return (False, city, None)  # 失败但保留
                else:
                    debug_log(f"  ⚠️ {city} 不在活跃连接中")
                    return (False, city, None)
            
            # 并行发送给所有城市
            results = await asyncio.gather(
                *[send_to_city(city) for city in route],
                return_exceptions=True
            )
            
            # 统计结果
            success_count = sum(1 for r in results if not isinstance(r, Exception) and r[0])
            failed_cities = [(r[1], r[2]) for r in results if not isinstance(r, Exception) and r[2] is not None]
            
            debug_log(f"[并行发送完成] 准备移除断开的连接")
            # 移除确认断开的连接
            for city, websocket in failed_cities:
                if websocket:  # 确保 websocket 不为 None
                    self.disconnect(city, websocket)
            
            debug_log(f"发送完成: 成功 {success_count}/{len(route)} 个城市")
            debug_log(f"[发送完成后] 准备发送给 Monitor_Admin")

            
            # 特别发送给监控管理员（即使不在路由中）
            # 监控管理员的失败不应该影响系统运行
            if 'Monitor_Admin' in self.active_connections and 'Monitor_Admin' not in route:
                debug_log(f"  [Monitor_Admin] 准备发送")
                try:
                    debug_log(f"  发送给监控管理员: Monitor_Admin")
                    await self.active_connections['Monitor_Admin'].send_text(message_json)
                    debug_log(f"  ✅ 监控管理员接收成功")
                except Exception as e:
                    error_msg = str(e)
                    debug_log(f"  ❌ 监控管理员接收失败: {error_msg}")
                    # 只在明确断开时才移除 Monitor_Admin
                    if any(keyword in error_msg.lower() for keyword in ['closed', 'disconnect', 'connection', 'reset']):
                        debug_log(f"  ⚠️ Monitor_Admin 连接已断开，将移除")
                        try:
                            self.disconnect('Monitor_Admin', self.active_connections.get('Monitor_Admin'))
                        except:
                            pass
            else:
                debug_log(f"  [Monitor_Admin] 跳过 (不在连接中或已在路由中)")
            
            debug_log(f"[Monitor_Admin 处理完成] 准备记录日志")
            
            # ⚠️ 移除 broadcast_system_message 调用，因为它会导致死锁：
            # 当在 WebSocket 消息循环内调用 send_encrypted_message 时，
            # 该 WebSocket 正在等待函数返回，无法接收广播消息，导致阻塞
            # 改为只记录日志
            debug_log(f"📤 {from_city} -> {to_city}: 路径 {' -> '.join(route)}")
            
            debug_log(f"[记录完成] 准备计算总耗时")
            total_time = (time.time() - start_time) * 1000
            debug_log(f"⏱️ 总耗时: {total_time:.2f}ms")
            debug_log(f"=== send_encrypted_message 完成 ===\n")
            
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            debug_log(f"ERROR in send_encrypted_message: {e}")
            debug_log(error_details)
            # ⚠️ 移除 broadcast_system_message 避免死锁
            debug_log(f"❌ 发送消息失败: {str(e)}")
            # 不重新抛出异常，改为记录并尝试通知发送者（如果可用），避免顶层断开或崩溃
            try:
                if 'from_city' in locals() and from_city in self.active_connections:
                    await self.active_connections[from_city].send_text(json.dumps({
                        "type": "error",
                        "message": f"发送消息失败: {str(e)}"
                    }))
            except Exception:
                debug_log("WARN: 无法向发送者发送失败通知")
            return
    
    async def decrypt_and_deliver_message(self, encrypted_message: dict, current_city: str):
        """解密并投递消息"""
        try:
            from_city = encrypted_message.get("from")
            to_city = encrypted_message.get("to")
            encrypted_data = encrypted_message.get("encrypted_data")
            huffman_codes = encrypted_message.get("huffman_codes", {})
            huffman_encoded = encrypted_message.get("huffman_encoded", "")
            route = encrypted_message.get("route", [])
            
            if not all([from_city, to_city, encrypted_data]):
                debug_log(f"[decrypt_and_deliver_message] 缺少必要字段")
                return
            
            # 只有目标城市才能解密消息
            if current_city == to_city:
                # 获取共享密钥
                shared_key = crypto_manager.get_shared_key(from_city, to_city)
                if not shared_key:
                    debug_log(f"[decrypt_and_deliver_message] 无法获取共享密钥")
                    # ⚠️ 移除 broadcast_system_message 调用避免死锁
                    debug_log(f"[decrypt_and_deliver_message] ❌ 无法获取 {from_city} 和 {to_city} 的共享密钥")
                    return
                
                # 解密消息（返回两个步骤的结果）
                # 第一步：AES解密
                from cryptography.fernet import Fernet
                import base64
                fernet = Fernet(shared_key)
                encrypted_data_bytes = base64.b64decode(encrypted_data.encode())
                huffman_decoded_step = fernet.decrypt(encrypted_data_bytes).decode()
                
                # 第二步：哈夫曼解码（使用局部 HuffmanEncoder 实例，避免竞争）
                decrypted_message = HuffmanEncoder().decode(huffman_decoded_step, huffman_codes)
                
                debug_log(f"[decrypt_and_deliver_message] 解密成功: {decrypted_message[:30]}...")
                
                # 发送解密后的消息给目标城市（包含完整的解密步骤）
                if to_city in self.active_connections:
                    decrypted_msg = {
                        "type": "decrypted_message",
                        "from": from_city,
                        "original_message": encrypted_message.get("original_message", ""),
                        "huffman_encoded": huffman_encoded,          # 哈夫曼编码后的消息
                        "huffman_codes": huffman_codes,              # 哈夫曼编码表
                        "aes_encrypted": encrypted_data,             # AES加密后的数据
                        "aes_decrypted": huffman_decoded_step,       # AES解密后的消息（哈夫曼编码形式）
                        "final_message": decrypted_message,          # 最终解密的消息
                        "timestamp": encrypted_message["timestamp"]
                    }
                    try:
                        await self.active_connections[to_city].send_text(json.dumps(decrypted_msg))
                    except Exception as send_error:
                        debug_log(f"[decrypt_and_deliver_message] 发送给 {to_city} 失败: {send_error}")
                
                # ⚠️ 移除 broadcast_system_message 调用避免死锁
                debug_log(f"[decrypt_and_deliver_message] ✅ {to_city} 成功接收来自 {from_city} 的加密消息")
            else:
                # 中间节点需要继续转发消息到下一个节点
                current_index = route.index(current_city) if current_city in route else -1
                if current_index >= 0 and current_index < len(route) - 1:
                    # 还有更多节点要经过，继续转发
                    next_city = route[current_index + 1]
                    if next_city in self.active_connections:
                        try:
                            await self.active_connections[next_city].send_text(json.dumps(encrypted_message))
                        except Exception as forward_error:
                            debug_log(f"[decrypt_and_deliver_message] 转发到 {next_city} 失败: {forward_error}")
                    # ⚠️ 移除 broadcast_system_message 调用避免死锁
                    debug_log(f"[decrypt_and_deliver_message] 📡 {current_city} 转发消息 {from_city} -> {to_city} (下一跳: {next_city})")
                
        except Exception as e:
            import traceback
            traceback.print_exc()
            # ⚠️ 移除 broadcast_system_message 调用避免死锁
            debug_log(f"[decrypt_and_deliver_message] ❌ 解密消息失败: {str(e)}")

    async def broadcast_system_message(self, message: str):
        """广播系统消息"""
        system_msg = {
            "type": "system",
            "message": message,
            "timestamp": asyncio.get_event_loop().time()
        }
        await self.broadcast_message(system_msg)

    def _start_keepalive(self, city: str, websocket: WebSocket):
        """启动服务器侧心跳，周期性推送 keepalive 消息防止连接闲置被断开"""
        key = id(websocket)

        async def _keepalive_loop():
            debug_log(f"[keepalive] 启动 -> {city}")
            try:
                while True:
                    await asyncio.sleep(self.keepalive_interval)
                    # 如果连接已经被替换或断开，则停止心跳
                    if city not in self.active_connections or self.active_connections.get(city) != websocket:
                        debug_log(f"[keepalive] {city} 心跳结束（连接已更换或断开）")
                        break

                    debug_log(f"[keepalive] -> {city} 发送 ping")
                    payload = json.dumps({
                        "type": "ping",
                        "source": "server_keepalive",
                        "timestamp": time.time()
                    })
                    try:
                        await websocket.send_text(payload)
                    except Exception as send_error:
                        debug_log(f"[keepalive] 向 {city} 发送心跳失败: {send_error}")
                        break
                    # 只发送 ping，等待客户端回复 pong（客户端会在收到 ping 后自动回复 pong）
            except asyncio.CancelledError:
                debug_log(f"[keepalive] {city} 心跳任务被取消")
            finally:
                self.keepalive_tasks.pop(key, None)

        # 先停止旧任务，避免重复
        self._stop_keepalive(websocket)
        self.keepalive_tasks[key] = asyncio.create_task(_keepalive_loop())

    def _stop_keepalive(self, websocket: WebSocket):
        """停止指定连接的服务器侧心跳任务"""
        key = id(websocket)
        task = self.keepalive_tasks.pop(key, None)
        if task:
            task.cancel()

    def get_active_cities(self) -> List[str]:
        """获取当前活跃的城市列表（排除监控连接）"""
        # 过滤掉监控管理员连接
        return [city for city in self.active_connections.keys() if city != "Monitor_Admin"]

    def get_connection_count(self) -> int:
        """获取当前连接数"""
        return len(self.active_connections)


# 全局连接管理器实例
manager = ConnectionManager()
