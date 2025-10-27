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
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5
    this.reconnectTimer = null
    this.isManualClose = false
    
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
        this.handlers.onOpen(event)
      }
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handlers.onMessage(data, event)
        } catch (error) {
          console.error(`[WebSocket] ${this.city} 解析消息失败:`, error)
        }
      }
      
      this.ws.onclose = (event) => {
        console.log(`[WebSocket] ${this.city} 连接关闭, code: ${event.code}`)
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
   * 安排重连
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    
    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000)
    console.log(`[WebSocket] ${this.city} 将在 ${delay}ms 后尝试第 ${this.reconnectAttempts} 次重连`)
    
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
