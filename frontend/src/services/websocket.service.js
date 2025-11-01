/**
 * WebSocket 管理服务
 * 封装 WebSocket 连接和消息处理逻辑
 */

import { API_ENDPOINTS } from '../config/api'

/**
 * WebSocket 状态枚举
 */
export const WS_STATUS = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error'
}

/**
 * WebSocket 管理类
 */
export class WebSocketManager {
  constructor(city, options = {}) {
    this.city = city
    this.ws = null
    this.status = WS_STATUS.DISCONNECTED
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = options.maxReconnectAttempts || 999  // 几乎无限重连
    this.reconnectTimer = null
    this.isManualClose = false
    
    // 心跳机制
    this.heartbeatInterval = null
    this.heartbeatTimeout = null
    this.pingInterval = 20000  // 每20秒发送一次ping（更频繁）
    this.pongTimeout = 30000   // 等待pong响应的超时时间（更宽松，不主动断开）
    
    // 事件处理器
    this.handlers = {
      onOpen: options.onOpen || (() => {}),
      onMessage: options.onMessage || (() => {}),
      onClose: options.onClose || (() => {}),
      onError: options.onError || (() => {}),
      onStatusChange: options.onStatusChange || (() => {})
    }
  }

  /**
   * 连接 WebSocket
   */
  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.log(`[WebSocket] ${this.city} 已经连接或正在连接`)
      return
    }

    this.cleanup()
    this.isManualClose = false
    
    try {
      const wsUrl = API_ENDPOINTS.WS(this.city)
      console.log(`[WebSocket] 尝试连接: ${wsUrl}`)
      
      this.setStatus(WS_STATUS.CONNECTING)
      this.ws = new WebSocket(wsUrl)
      
      this.ws.onopen = (event) => {
        console.log(`✅ [WebSocket] ${this.city} 连接成功`)
        this.reconnectAttempts = 0
        this.setStatus(WS_STATUS.CONNECTED)
        this.startHeartbeat()  // 启动心跳
        this.handlers.onOpen(event)
      }
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // 处理服务器发来的 ping，立即回复 pong
          if (data.type === 'ping') {
            this.sendPong()
            return
          }
          
          // 处理服务器回复的 pong（响应客户端发送的 ping）
          if (data.type === 'pong') {
            this.handlePong()
            return
          }
          
          this.handlers.onMessage(data, event)
        } catch (error) {
          console.error(`[WebSocket] ${this.city} 解析消息失败:`, error)
        }
      }
      
      this.ws.onclose = (event) => {
        console.log(`[WebSocket] ${this.city} 连接关闭, code: ${event.code}`)
        this.stopHeartbeat()  // 停止心跳
        this.setStatus(WS_STATUS.DISCONNECTED)
        this.handlers.onClose(event)
        
        // 如果不是手动关闭且未超过重连次数，则尝试重连
        if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect()
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.warn(`[WebSocket] ${this.city} 已达到最大重连次数`)
          this.setStatus(WS_STATUS.ERROR)
        }
      }
      
      this.ws.onerror = (error) => {
        console.error(`❌ [WebSocket] ${this.city} 错误:`, error)
        this.setStatus(WS_STATUS.ERROR)
        this.handlers.onError(error)
      }
      
    } catch (error) {
      console.error(`❌ [WebSocket] ${this.city} 创建连接失败:`, error)
      this.setStatus(WS_STATUS.ERROR)
    }
  }

  /**
   * 启动心跳
   */
  startHeartbeat() {
    this.stopHeartbeat()  // 先清理旧的定时器
    
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        this.sendPing()
      }
    }, this.pingInterval)
    
    console.log(`[WebSocket] ${this.city} 心跳已启动，间隔: ${this.pingInterval}ms`)
  }

  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  /**
   * 发送ping消息
   */
  sendPing() {
    console.log(`[WebSocket] ${this.city} 发送 ping`)
    this.send({ type: 'ping', timestamp: Date.now() })

    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
    
    // 设置pong超时，仅提示，不主动断开
    this.heartbeatTimeout = setTimeout(() => {
      console.warn(`[WebSocket] ${this.city} pong 响应超时，保持连接继续等待`)
      this.heartbeatTimeout = null
    }, this.pongTimeout)
  }

  /**
   * 发送pong消息（响应服务器的ping）
   */
  sendPong() {
    console.log(`[WebSocket] ${this.city} 收到服务器 ping，回复 pong`)
    this.send({ type: 'pong', timestamp: Date.now() })
  }

  /**
   * 处理pong响应
   */
  handlePong() {
    console.log(`[WebSocket] ${this.city} 收到 pong`)
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  /**
   * 安排重连
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    
    this.reconnectAttempts++
    // 使用更短的重连延迟：从500ms开始，最多3秒
    const delay = Math.min(500 * Math.pow(1.5, this.reconnectAttempts - 1), 3000)
    console.log(`[WebSocket] ${this.city} 将在 ${delay.toFixed(0)}ms 后尝试第 ${this.reconnectAttempts} 次重连`)
    
    this.reconnectTimer = setTimeout(() => {
      if (!this.isManualClose) {
        this.connect()
      }
    }, delay)
  }

  /**
   * 发送消息
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = typeof data === 'string' ? data : JSON.stringify(data)
      this.ws.send(message)
      return true
    }
    console.warn(`[WebSocket] ${this.city} 未连接，无法发送消息`)
    return false
  }

  /**
   * 关闭连接
   */
  close() {
    console.log(`[WebSocket] ${this.city} 手动关闭连接`)
    this.isManualClose = true
    this.cleanup()
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.stopHeartbeat()  // 停止心跳
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close()
      }
      this.ws = null
    }
  }

  /**
   * 设置状态
   */
  setStatus(status) {
    if (this.status !== status) {
      this.status = status
      this.handlers.onStatusChange(status)
    }
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return this.status
  }

  /**
   * 是否已连接
   */
  isConnected() {
    return this.status === WS_STATUS.CONNECTED && this.ws && this.ws.readyState === WebSocket.OPEN
  }
}

export default WebSocketManager
