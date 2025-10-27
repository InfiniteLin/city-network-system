/**
 * 城市通讯 API 服务
 * 封装所有后端 API 调用
 */

import { API_ENDPOINTS } from '../config/api'
import { get, post } from '../utils/http'

/**
 * 后端 API 服务
 */
export const apiService = {
  /**
   * 健康检查
   */
  async checkHealth() {
    try {
      const data = await get(API_ENDPOINTS.HEALTH)
      return { success: true, data }
    } catch (error) {
      console.error('❌ 健康检查失败:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * 获取在线城市列表
   */
  async getOnlineCities() {
    try {
      const data = await get(API_ENDPOINTS.CITIES)
      // 过滤掉 Monitor_Admin
      const cities = (data.cities || []).filter(city => city !== 'Monitor_Admin')
      return { success: true, cities, count: data.active_connections }
    } catch (error) {
      console.warn('⚠️ 获取在线城市失败:', error)
      return { success: false, cities: [], count: 0, error: error.message }
    }
  },

  /**
   * 获取拓扑状态
   */
  async getTopologyStatus() {
    try {
      const data = await get(API_ENDPOINTS.TOPOLOGY_STATUS)
      return { success: true, data }
    } catch (error) {
      console.warn('⚠️ 获取拓扑状态失败:', error)
      return { success: false, data: null, error: error.message }
    }
  },

  /**
   * 加载拓扑数据
   */
  async loadTopology(cities, edges) {
    try {
      const data = await post(API_ENDPOINTS.TOPOLOGY, { cities, edges })
      return { success: true, data }
    } catch (error) {
      console.error('❌ 加载拓扑失败:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * 获取路由
   */
  async getRoute(from, to) {
    try {
      const url = API_ENDPOINTS.ROUTE(from, to)
      const data = await get(url)
      return { success: true, data }
    } catch (error) {
      console.error('❌ 获取路由失败:', error)
      return { success: false, error: error.message }
    }
  }
}

export default apiService
