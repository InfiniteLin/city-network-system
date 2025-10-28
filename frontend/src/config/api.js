/**
 * API 配置文件
 * 统一管理所有后端接口地址
 */

// 后端服务地址配置
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001'
const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8001'

/**
 * API 端点配置
 */
export const API_ENDPOINTS = {
  // 健康检查
  HEALTH: `${API_BASE_URL}/health`,
  
  // 拓扑相关
  TOPOLOGY: `${API_BASE_URL}/topology`,
  TOPOLOGY_STATUS: `${API_BASE_URL}/topology/status`,
  
  // 城市相关
  CITIES: `${API_BASE_URL}/cities`,
  ROUTE: (from, to) => `${API_BASE_URL}/route/${encodeURIComponent(from)}/${encodeURIComponent(to)}`,
  
  // WebSocket
  WS: (city) => `${WS_BASE_URL}/ws/${encodeURIComponent(city)}`
}

/**
 * 请求配置
 */
export const REQUEST_CONFIG = {
  TIMEOUT: 10000, // 增加到10秒
  RETRY_ATTEMPTS: 2, // 减少重试次数，避免过度重试
  RETRY_DELAY: 500 // 减少重试延迟
}

export default {
  API_ENDPOINTS,
  REQUEST_CONFIG,
  API_BASE_URL,
  WS_BASE_URL
}
