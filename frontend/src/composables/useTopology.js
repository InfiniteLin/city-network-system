/**
 * 拓扑数据管理组合式函数
 * 负责加载和管理城市拓扑数据
 */

import { ref } from 'vue'
import apiService from '../services/api.service'

export function useTopology() {
  const cities = ref([])
  const edges = ref([])
  const isLoading = ref(false)
  const error = ref(null)

  /**
   * 从 localStorage 加载城市数据
   */
  function loadCitiesFromStorage() {
    const citiesData = localStorage.getItem('cities')
    
    if (citiesData) {
      try {
        cities.value = JSON.parse(citiesData)
        console.log('✅ 从 localStorage 加载城市数据:', cities.value.length, '个城市')
        return true
      } catch (e) {
        console.error('解析 localStorage 城市数据失败:', e)
        cities.value = []
        return false
      }
    } else {
      console.warn('⚠️ localStorage 中没有城市数据')
      return false
    }
  }

  /**
   * 从 localStorage 加载边数据
   */
  function loadEdgesFromStorage() {
    const edgesData = localStorage.getItem('edges')
    
    if (edgesData) {
      try {
        edges.value = JSON.parse(edgesData)
        console.log('✅ 从 localStorage 加载边数据:', edges.value.length, '条边')
        return true
      } catch (e) {
        console.error('解析 localStorage 边数据失败:', e)
        edges.value = []
        return false
      }
    } else {
      console.warn('⚠️ localStorage 中没有边数据')
      return false
    }
  }

  /**
   * 从后端加载拓扑状态
   */
  async function loadTopologyFromBackend() {
    try {
      const result = await apiService.getTopologyStatus()
      
      if (!result.success) {
        console.warn('⚠️ 获取拓扑状态失败')
        return false
      }

      const data = result.data
      console.log('📡 拓扑状态:', data)
      
      // 检查后端是否有拓扑数据
      const backendHasTopology = data.cities > 0 && data.mst_edges_count > 0
      
      if (!backendHasTopology) {
        console.warn('⚠️ 后端没有拓扑数据')
        
        // 尝试从本地加载并发送到后端
        const hasLocalData = loadCitiesFromStorage() && loadEdgesFromStorage()
        
        if (hasLocalData) {
          console.log(`📤 发送本地拓扑到后端: ${cities.value.length} 城市, ${edges.value.length} 边`)
          const postResult = await apiService.loadTopology(cities.value, edges.value)
          
          if (postResult.success) {
            console.log('✅ 拓扑数据已发送到后端')
            
            // 重新获取拓扑状态
            const statusResult = await apiService.getTopologyStatus()
            if (statusResult.success && statusResult.data.mst_edges) {
              edges.value = statusResult.data.mst_edges
              console.log(`✅ 后端返回 MST 边: ${edges.value.length} 条`)
            }
          }
        }
      } else {
        // 后端有拓扑数据，使用 MST 边
        if (data.mst_edges && Array.isArray(data.mst_edges) && data.mst_edges.length > 0) {
          edges.value = data.mst_edges
          console.log('✅ 加载 MST 边:', edges.value.length, '条（最小生成树）')
        }
      }
      
      return true
    } catch (err) {
      console.error('❌ 从后端加载拓扑数据失败:', err)
      error.value = err.message
      return false
    }
  }

  /**
   * 完整加载拓扑数据（先从 localStorage，再从后端）
   */
  async function loadTopology() {
    isLoading.value = true
    error.value = null
    
    try {
      // 先从 localStorage 加载城市数据
      loadCitiesFromStorage()
      
      // 从后端获取拓扑状态和 MST 边
      await Promise.race([
        loadTopologyFromBackend(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('拓扑加载超时')), 5000)
        )
      ])
      
      return { cities: cities.value, edges: edges.value }
    } catch (err) {
      console.warn('⚠️ 拓扑数据加载失败或超时:', err)
      error.value = err.message
      return { cities: cities.value, edges: edges.value }
    } finally {
      isLoading.value = false
    }
  }

  return {
    cities,
    edges,
    isLoading,
    error,
    loadTopology,
    loadCitiesFromStorage,
    loadEdgesFromStorage
  }
}

export default useTopology
