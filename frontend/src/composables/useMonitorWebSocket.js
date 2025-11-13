/**
 * WebSocket 管理组合式函数
 * 负责 WebSocket 连接、重连、消息处理
 */

import { ref, onUnmounted } from 'vue'

const MAX_RECONNECT_ATTEMPTS = 999  // 几乎无限重连
const PING_INTERVAL = 25000 // 25秒
const PONG_TIMEOUT = 10000 // 10秒
const INITIAL_RECONNECT_DELAY = 500 // 500ms
const MAX_RECONNECT_DELAY = 3000 // 3秒
const RECONNECT_MULTIPLIER = 1.5 // 指数退避倍数

export function useMonitorWebSocket(callbacks = {}) {
  const wsStatus = ref('disconnected') // 'connecting', 'connected', 'disconnected', 'error'
  
  let monitorWs = null
  let reconnectAttempts = 0
  let reconnectTimer = null
  let pingInterval = null
  let pongTimeout = null
  let isActive = true
  let lastPongTime = 0  // 记录最后收到消息的时间

  /**
   * 连接监控 WebSocket
   */
  const connect = () => {
    if (!isActive) {
      console.log('[监控] 组件未激活，停止连接')
      return
    }

    if (monitorWs) {
      const state = monitorWs.readyState
      if (state === WebSocket.OPEN) {
        console.log('[监控] WebSocket 已连接，跳过')
        wsStatus.value = 'connected'
        return
      }
      if (state === WebSocket.CONNECTING) {
        console.log('[监控] WebSocket 正在连接中，跳过')
        wsStatus.value = 'connecting'
        return
      }
      
      // 清理已关闭的连接
      console.log('[监控] 清理旧连接...')
      monitorWs.onclose = null
      monitorWs.onerror = null
      monitorWs.onmessage = null
      monitorWs.onopen = null
      try {
        monitorWs.close()
      } catch (e) {
        // 忽略关闭错误
      }
      monitorWs = null
    }

    // 清理重连定时器
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    // 清理心跳定时器
    if (pingInterval) {
      clearInterval(pingInterval)
      pingInterval = null
    }
    if (pongTimeout) {
      clearTimeout(pongTimeout)
      pongTimeout = null
    }

    try {
      const wsUrl = `ws://localhost:8001/ws/Monitor_Admin`
      console.log('[监控] 尝试连接 WebSocket:', wsUrl)
      wsStatus.value = 'connecting'
      monitorWs = new WebSocket(wsUrl)
      
      monitorWs.onopen = () => {
        console.log('✅ [监控] WebSocket 连接成功建立')
        reconnectAttempts = 0
        wsStatus.value = 'connected'
        lastPongTime = Date.now()  // 初始化时间
        
        if (callbacks.onConnected) {
          callbacks.onConnected()
        }

        // 启动心跳 - 延迟启动，避免立即发送
        setTimeout(() => {
          startHeartbeat()
        }, 1000)
      }
      
      monitorWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // 更新最后收到消息的时间
          lastPongTime = Date.now()
          
          // 处理服务器发来的 ping，立即回复 pong
          if (data.type === 'ping') {
            console.log('[监控] 收到服务器 ping，回复 pong')
            if (monitorWs && monitorWs.readyState === WebSocket.OPEN) {
              monitorWs.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
            }
            return
          }
          
          // 处理服务器的 pong 响应
          if (data.type === 'pong') {
            console.log('[监控] 收到 pong 响应')
            if (pongTimeout) {
              clearTimeout(pongTimeout)
              pongTimeout = null
            }
            return
          }
          
          console.log('[监控] 收到消息:', data)
          
          if (callbacks.onMessage) {
            callbacks.onMessage(data)
          }
        } catch (error) {
          console.error('[监控] 解析消息失败:', error)
        }
      }
      
      monitorWs.onclose = (event) => {
        console.log('[监控] WebSocket 连接已关闭, code:', event.code, 'reason:', event.reason)
        wsStatus.value = 'disconnected'
        
        if (callbacks.onDisconnected) {
          callbacks.onDisconnected()
        }
        
        // 清除定时器
        if (pingInterval) {
          clearInterval(pingInterval)
          pingInterval = null
        }
        if (pongTimeout) {
          clearTimeout(pongTimeout)
          pongTimeout = null
        }
        
        // 只有在组件仍然激活且未达到最大重连次数时才重连
        if (isActive && event.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          scheduleReconnect()
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.warn('[监控] ⚠️ 已达到最大重连次数，停止重连')
          wsStatus.value = 'error'
          
          if (callbacks.onError) {
            callbacks.onError('已达到最大重连次数')
          }
        }
      }
      
      monitorWs.onerror = (error) => {
        console.error('❌ [监控] WebSocket 错误:', error)
        wsStatus.value = 'error'
        
        if (callbacks.onError) {
          callbacks.onError('WebSocket 连接错误')
        }
      }
    } catch (error) {
      console.error('❌ [监控] 创建 WebSocket 连接失败:', error)
      wsStatus.value = 'error'
      
      if (callbacks.onError) {
        callbacks.onError('创建 WebSocket 连接失败')
      }
    }
  }

  const startHeartbeat = () => {
    // 清除旧的心跳
    if (pingInterval) {
      clearInterval(pingInterval)
      pingInterval = null
    }
    if (pongTimeout) {
      clearTimeout(pongTimeout)
      pongTimeout = null
    }
    
    console.log('[监控] 启动心跳机制')
    
    // 启动新的心跳
    pingInterval = setInterval(() => {
      if (monitorWs && monitorWs.readyState === WebSocket.OPEN) {
        console.log('[监控] 发送 ping')
        try {
          monitorWs.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
          
          // 设置 pong 超时检测 - 但不关闭连接，只是记录警告
          if (pongTimeout) {
            clearTimeout(pongTimeout)
          }
          pongTimeout = setTimeout(() => {
            console.warn('[监控] ⚠️ pong 响应超时，但保持连接')
          }, PONG_TIMEOUT)
        } catch (error) {
          console.error('[监控] 发送 ping 失败:', error)
        }
      }
    }, PING_INTERVAL)
  }

  const scheduleReconnect = () => {
    // 清除旧的重连定时器
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    
    if (!isActive) {
      console.log('[监控] 组件已卸载，停止重连')
      return
    }
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[监控] 达到最大重连次数')
      wsStatus.value = 'error'
      return
    }
    
    reconnectAttempts++
    
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(RECONNECT_MULTIPLIER, reconnectAttempts - 1),
      MAX_RECONNECT_DELAY
    )
    
    console.log(`[监控] 将在 ${delay.toFixed(0)}ms 后尝试第 ${reconnectAttempts} 次重连...`)
    
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (isActive) {
        connect()
      }
    }, delay)
  }

  /**
   * 手动重连
   */
  function manualReconnect() {
    console.log('[监控] 手动重连...')
    reconnectAttempts = 0
    connect()
  }

  /**
   * 断开连接
   */
  function disconnect() {
    console.log('[监控] 主动断开连接')
    isActive = false
    
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    
    if (monitorWs) {
      monitorWs.onclose = null
      monitorWs.onerror = null
      monitorWs.onmessage = null
      monitorWs.onopen = null
      
      if (monitorWs.readyState === WebSocket.OPEN || monitorWs.readyState === WebSocket.CONNECTING) {
        monitorWs.close()
      }
      monitorWs = null
    }
    
    wsStatus.value = 'disconnected'
  }

  /**
   * 发送消息
   */
  function send(data) {
    if (monitorWs && monitorWs.readyState === WebSocket.OPEN) {
      monitorWs.send(JSON.stringify(data))
      return true
    }
    console.warn('[监控] WebSocket 未连接，无法发送消息')
    return false
  }

  // 组件卸载时自动清理
  onUnmounted(() => {
    disconnect()
  })

  return {
    wsStatus,
    connect,
    disconnect,
    manualReconnect,
    send
  }
}

export default useMonitorWebSocket
