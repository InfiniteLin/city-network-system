/**
 * 监控功能 Composable
 * 封装监控页面的核心业务逻辑
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { apiService } from '../services/api.service'
import { WebSocketManager, WS_STATUS } from '../services/websocket.service'
import { loadAmapJs, createMap, createCityMarker, createPolyline } from '../services/map.service'
import { createMessageAnimation } from '../services/animation.service'

export function useMonitor() {
  // 状态管理
  const mapEl = ref(null)
  const mapInstance = ref(null)
  const cityMarkers = ref({})
  const mstLines = ref([])
  const cities = ref([])
  const edges = ref([])
  const onlineCities = ref([])
  const recentMessages = ref([])
  const isLoading = ref(false)
  const errorMsg = ref('')
  const wsStatus = ref(WS_STATUS.DISCONNECTED)
  const isAnimationPaused = ref(false)
  const filterType = ref('all')
  const selectedCity = ref(null)
  
  const statistics = ref({
    totalMessages: 0,
    encryptedMessages: 0,
    normalMessages: 0,
    onlineCitiesCount: 0,
    totalCitiesCount: 0
  })
  
  const statAnimationTrigger = ref(0)
  
  // WebSocket 管理
  let wsManager = null
  let refreshTimer = null
  let isComponentMounted = false

  /**
   * 初始化地图
   */
  async function initMap() {
    try {
      isLoading.value = true
      errorMsg.value = ''
      
      // 检查后端健康状态
      const healthResult = await apiService.checkHealth()
      if (!healthResult.success) {
        errorMsg.value = '后端服务不可访问，请确保后端服务已启动'
        console.warn('⚠️ 后端服务不可访问')
      }
      
      console.log('🗺️ 开始加载高德地图...')
      await loadAmapJs()
      
      if (!mapEl.value) {
        errorMsg.value = '地图容器未找到'
        isLoading.value = false
        return
      }

      await new Promise(resolve => setTimeout(resolve, 300))

      console.log('🗺️ 初始化地图实例...')
      mapInstance.value = createMap(mapEl.value)
      console.log('✅ 地图初始化成功')

      // 加载拓扑数据
      await loadTopologyData()

      if (cities.value.length > 0) {
        console.log('🎨 开始绘制城市和连接...')
        drawCitiesAndMST()
      } else {
        console.warn('⚠️ 没有城市数据，请先访问"城市地图"页面')
        errorMsg.value = '没有城市数据，请先访问"城市地图"页面加载数据'
      }

      statistics.value.totalCitiesCount = cities.value.length
      isLoading.value = false

      // 启动监控
      startMonitoring()
      
    } catch (error) {
      console.error('❌ 地图加载失败:', error)
      errorMsg.value = `地图加载失败: ${error.message || '未知错误'}`
      isLoading.value = false
    }
  }

  /**
   * 加载拓扑数据
   */
  async function loadTopologyData() {
    // 从 localStorage 加载城市数据
    const citiesData = localStorage.getItem('cities')
    if (citiesData) {
      try {
        cities.value = JSON.parse(citiesData)
        console.log('✅ 从 localStorage 加载城市数据:', cities.value.length, '个城市')
      } catch (e) {
        console.error('解析 localStorage 城市数据失败:', e)
        cities.value = []
      }
    }

    // 从后端获取拓扑状态
    const result = await apiService.getTopologyStatus()
    if (result.success && result.data) {
      const data = result.data
      
      if (data.mst_edges && Array.isArray(data.mst_edges) && data.mst_edges.length > 0) {
        edges.value = data.mst_edges
        console.log('✅ 加载 MST 边:', edges.value.length, '条')
      } else if (cities.value.length > 0) {
        // 尝试从本地加载并发送到后端
        const localEdgesText = localStorage.getItem('edges')
        if (localEdgesText) {
          try {
            const localEdges = JSON.parse(localEdgesText)
            if (Array.isArray(localEdges) && localEdges.length > 0) {
              console.log('📤 发送本地拓扑到后端...')
              await apiService.loadTopology(cities.value, localEdges)
              
              // 重新获取状态
              const result2 = await apiService.getTopologyStatus()
              if (result2.success && result2.data && result2.data.mst_edges) {
                edges.value = result2.data.mst_edges
                console.log('✅ 后端返回 MST 边:', edges.value.length)
              }
            }
          } catch (e) {
            console.warn('处理本地边数据失败:', e)
          }
        }
      }
    }
    
    statistics.value.totalCitiesCount = cities.value.length
  }

  /**
   * 绘制城市和MST
   */
  function drawCitiesAndMST() {
    if (!mapInstance.value || !window.AMap || cities.value.length === 0) return

    console.log(`🎨 开始绘制 ${cities.value.length} 个城市...`)
    
    cities.value.forEach(city => {
      try {
        const marker = createCityMarker(city, false)
        if (marker) {
          marker.on('click', () => {
            selectedCity.value = city
          })
          marker.setMap(mapInstance.value)
          cityMarkers.value[city.name] = marker
        }
      } catch (e) {
        console.error(`绘制城市 ${city.name} 失败:`, e)
      }
    })
    
    console.log(`✅ 成功绘制 ${Object.keys(cityMarkers.value).length} 个城市标记`)

    // 绘制MST连线
    if (edges.value.length > 0) {
      edges.value.forEach(edge => {
        const city1 = cities.value[edge.u]
        const city2 = cities.value[edge.v]
        
        if (city1 && city2) {
          const line = createPolyline(city1, city2)
          if (line) {
            line.setMap(mapInstance.value)
            mstLines.value.push(line)
          }
        }
      })
    }
  }

  /**
   * 更新城市标记状态
   */
  function updateCityMarkers() {
    cities.value.forEach(city => {
      const marker = cityMarkers.value[city.name]
      if (marker) {
        const isOnline = onlineCities.value.includes(city.name)
        const newMarker = createCityMarker(city, isOnline)
        if (newMarker) {
          newMarker.on('click', () => {
            selectedCity.value = city
          })
          newMarker.setMap(mapInstance.value)
          marker.setMap(null)
          cityMarkers.value[city.name] = newMarker
        }
      }
    })
  }

  /**
   * 刷新在线城市
   */
  async function refreshOnlineCities() {
    const result = await apiService.getOnlineCities()
    if (result.success) {
      onlineCities.value = result.cities
      statistics.value.onlineCitiesCount = result.cities.length
      updateCityMarkers()
    }
  }

  /**
   * 启动监控
   */
  function startMonitoring() {
    // 立即刷新一次
    refreshOnlineCities()
    
    // 定时刷新（3秒间隔）
    refreshTimer = setInterval(refreshOnlineCities, 3000)

    // 延迟建立 WebSocket
    setTimeout(() => {
      if (isComponentMounted) {
        connectWebSocket()
      }
    }, 500)
  }

  /**
   * 连接 WebSocket
   */
  function connectWebSocket() {
    if (wsManager) {
      wsManager.close()
    }

    wsManager = new WebSocketManager('Monitor_Admin', {
      maxReconnectAttempts: 5,
      onOpen: () => {
        console.log('✅ 监控 WebSocket 已连接')
      },
      onMessage: handleWebSocketMessage,
      onClose: () => {
        console.log('🔌 监控 WebSocket 已断开')
      },
      onError: (error) => {
        console.error('❌ 监控 WebSocket 错误:', error)
      },
      onStatusChange: (status) => {
        wsStatus.value = status
        if (status === WS_STATUS.ERROR) {
          errorMsg.value = 'WebSocket 连接失败，请检查后端服务'
        } else if (status === WS_STATUS.CONNECTED) {
          errorMsg.value = ''
        }
      }
    })

    wsManager.connect()
  }

  /**
   * 处理 WebSocket 消息
   */
  function handleWebSocketMessage(data) {
    console.log('[监控] 收到消息:', data)
    
    let messageRecord = null
    
    if (data.type === 'message') {
      messageRecord = {
        from: data.from,
        to: '全体',
        content: data.message,
        type: 'normal'
      }
    } else if (data.type === 'encrypted_message') {
      messageRecord = {
        from: data.from,
        to: data.to,
        content: data.original_message || '加密消息',
        type: 'encrypted'
      }
    } else if (data.type === 'system') {
      console.log('[监控] 系统消息:', data.message)
      return
    }
    
    if (messageRecord) {
      addMessageRecord(messageRecord)
    }
  }

  /**
   * 添加消息记录
   */
  function addMessageRecord(message) {
    recentMessages.value.unshift({
      id: Date.now(),
      ...message,
      timestamp: new Date().toLocaleTimeString(),
      isNew: true
    })

    setTimeout(() => {
      const msg = recentMessages.value.find(m => m.id === recentMessages.value[0]?.id)
      if (msg) msg.isNew = false
    }, 500)

    if (recentMessages.value.length > 50) {
      recentMessages.value = recentMessages.value.slice(0, 50)
    }

    // 更新统计
    statistics.value.totalMessages++
    if (message.type === 'encrypted') {
      statistics.value.encryptedMessages++
    } else {
      statistics.value.normalMessages++
    }
    
    statAnimationTrigger.value++

    // 显示动画
    if (!isAnimationPaused.value && shouldShowMessage(message)) {
      animateMessage(message)
    }
  }

  /**
   * 判断是否显示消息
   */
  function shouldShowMessage(message) {
    if (filterType.value === 'all') return true
    if (filterType.value === 'encrypted') return message.type === 'encrypted'
    if (filterType.value === 'normal') return message.type === 'normal'
    return true
  }

  /**
   * 消息动画
   */
  function animateMessage(message) {
    if (!mapInstance.value) return
    
    const fromCity = cities.value.find(c => c.name === message.from)
    if (!fromCity) return

    if (message.to === '全体') {
      const targetCities = onlineCities.value.filter(cityName => 
        cityName !== message.from && cityName !== 'Monitor_Admin'
      )
      
      targetCities.forEach(cityName => {
        const toCity = cities.value.find(c => c.name === cityName)
        if (toCity) {
          createMessageAnimation(fromCity, toCity, message.type, mapInstance.value)
        }
      })
    } else {
      const toCity = cities.value.find(c => c.name === message.to)
      if (toCity) {
        createMessageAnimation(fromCity, toCity, message.type, mapInstance.value)
      }
    }
  }

  /**
   * 清空消息
   */
  function clearMessages() {
    recentMessages.value = []
    statistics.value = {
      totalMessages: 0,
      encryptedMessages: 0,
      normalMessages: 0,
      onlineCitiesCount: onlineCities.value.length,
      totalCitiesCount: cities.value.length
    }
  }

  /**
   * 手动重连
   */
  function manualReconnect() {
    console.log('[监控] 手动重连...')
    errorMsg.value = ''
    if (wsManager) {
      wsManager.reconnectAttempts = 0
      wsManager.connect()
    } else {
      connectWebSocket()
    }
  }

  // 生命周期钩子
  onMounted(() => {
    isComponentMounted = true
    initMap()
  })

  onUnmounted(() => {
    console.log('[监控] 组件卸载，清理资源...')
    isComponentMounted = false
    
    if (refreshTimer) {
      clearInterval(refreshTimer)
    }
    
    if (wsManager) {
      wsManager.close()
    }
    
    console.log('[监控] ✅ 资源清理完成')
  })

  return {
    // 状态
    mapEl,
    mapInstance,
    cities,
    onlineCities,
    recentMessages,
    statistics,
    selectedCity,
    isAnimationPaused,
    filterType,
    isLoading,
    errorMsg,
    wsStatus,
    statAnimationTrigger,
    
    // 方法
    clearMessages,
    manualReconnect
  }
}
