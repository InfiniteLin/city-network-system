/**
 * WebSocket 管理组合式函数
 * 负责 WebSocket 连接、重连、消息处理
 */

import { ref, onUnmounted } from 'vue'

const MAX_RECONNECT_ATTEMPTS = 5

export function useMonitorWebSocket(callbacks = {}) {
  const wsStatus = ref('disconnected') // 'connecting', 'connected', 'disconnected', 'error'
  
  let monitorWs = null
  let reconnectAttempts = 0
  let reconnectTimer = null
  let isActive = true

  /**
   * 连接监控 WebSocket
   */
  function connect() {
    if (!isActive) {
      console.log('[监控] 组件未激活，跳过 WebSocket 连接')
      return
    }

    // 清理现有连接
    if (monitorWs) {
      monitorWs.onclose = null
      monitorWs.onerror = null
      monitorWs.onmessage = null
      if (monitorWs.readyState === WebSocket.OPEN || monitorWs.readyState === WebSocket.CONNECTING) {
        monitorWs.close()
      }
      monitorWs = null
    }

    // 清理重连定时器
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
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
        
        if (callbacks.onConnected) {
          callbacks.onConnected()
        }
      }
      
      monitorWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
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
        
        // 只有在组件仍然激活且未达到最大重连次数时才重连
        if (isActive && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000)
          console.log(`[监控] 将在 ${delay}ms 后尝试第 ${reconnectAttempts} 次重连...`)
          
          reconnectTimer = setTimeout(() => {
            if (isActive) {
              connect()
            }
          }, delay)
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
