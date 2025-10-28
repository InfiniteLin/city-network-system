<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import MapStatsPanel from '../components/MapStatsPanel.vue'
import OnlineCitiesList from '../components/OnlineCitiesList.vue'
import MessageStreamList from '../components/MessageStreamList.vue'
import MapManager from '../services/mapManager.service'
import MessageAnimator from '../services/messageAnimation.service'
import useMonitorWebSocket from '../composables/useMonitorWebSocket'
import useTopology from '../composables/useTopology'
import apiService from '../services/api.service'

// UI 状态
const mapEl = ref(null)
const selectedCity = ref(null)
const isAnimationPaused = ref(false)
const filterType = ref('all') // 'all', 'encrypted', 'normal'
const isLoading = ref(false)
const errorMsg = ref('')

// 数据状态
const onlineCities = ref([])
const recentMessages = ref([])
const statistics = ref({
  totalMessages: 0,
  encryptedMessages: 0,
  normalMessages: 0,
  onlineCitiesCount: 0,
  totalCitiesCount: 0
})
const statAnimationTrigger = ref(0)

// 服务实例
let mapManager = null
let messageAnimator = null
let refreshTimer = null
let isComponentMounted = false
let isRefreshing = false // 添加刷新锁，防止并发请求
let consecutiveErrors = 0 // 连续错误计数

// 使用组合式函数
const { cities, edges, loadTopology } = useTopology()
const { wsStatus, connect: connectWebSocket, disconnect: disconnectWebSocket, manualReconnect } = useMonitorWebSocket({
  onMessage: handleWebSocketMessage,
  onConnected: () => {
    errorMsg.value = ''
  },
  onError: (error) => {
    errorMsg.value = error
  }
})

/**
 * 初始化地图
 */
async function initMap() {
  try {
    isLoading.value = true
    errorMsg.value = ''
    
    // 检查后端健康状态
    const healthCheck = await apiService.checkHealth()
    if (!healthCheck.success) {
      errorMsg.value = '后端服务不可访问，请确保后端服务已启动（http://localhost:8001）'
      console.warn('⚠️ 后端服务不可访问')
    }
    
    // 初始化地图管理器
    mapManager = new MapManager()
    await mapManager.initMap(mapEl.value)
    
    // 加载拓扑数据
    try {
      await loadTopology()
      console.log('📡 拓扑数据加载完成')
    } catch (err) {
      console.warn('⚠️ 拓扑数据加载失败或超时:', err)
    }
    
    // 初始化消息动画器（传入MST边数据）
    messageAnimator = new MessageAnimator(mapManager.getMapInstance(), edges.value)
    // 构建MST图
    messageAnimator.setEdges(edges.value, cities.value)
    
    // 绘制城市和连接
    if (cities.value.length > 0) {
      console.log('🎨 开始绘制城市和连接...')
      mapManager.drawCities(cities.value, (city) => {
        selectedCity.value = city
      })
      mapManager.drawMSTLines(cities.value, edges.value)
    } else {
      console.warn('⚠️ 没有城市数据，请先访问"城市地图"页面')
      errorMsg.value = '没有城市数据，请先访问"城市地图"页面加载数据'
    }
    
    // 更新统计
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
 * 启动监控
 */
function startMonitoring() {
  // 立即刷新一次在线城市
  refreshOnlineCities()
  
  // 定时刷新在线城市（增加到5秒，减少请求频率）
  refreshTimer = setInterval(() => {
    refreshOnlineCities()
  }, 5000)

  // 延迟建立 WebSocket 连接
  setTimeout(() => {
    if (isComponentMounted) {
      connectWebSocket()
    }
  }, 500)
}

/**
 * 刷新在线城市列表（优化版，带防抖和错误处理）
 */
async function refreshOnlineCities() {
  // 如果正在刷新，跳过本次请求
  if (isRefreshing) {
    console.log('[监控] 跳过重复的刷新请求')
    return
  }
  
  // 如果连续错误过多，暂停刷新
  if (consecutiveErrors >= 3) {
    console.warn('[监控] 连续错误过多，暂停自动刷新')
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
    errorMsg.value = '无法连接到后端服务，请检查后端是否运行'
    return
  }
  
  isRefreshing = true
  
  try {
    const result = await apiService.getOnlineCities()
    
    if (result.success) {
      updateOnlineCities(result.cities || [])
      consecutiveErrors = 0 // 成功后重置错误计数
    } else {
      console.warn('⚠️ 刷新在线城市失败')
      consecutiveErrors++
    }
  } catch (error) {
    consecutiveErrors++
    // 只在第一次错误时打印详细日志，避免刷屏
    if (consecutiveErrors === 1) {
      console.error('❌ 刷新在线城市失败:', error.message)
    } else {
      console.warn(`⚠️ 刷新失败 (${consecutiveErrors}/3)`)
    }
  } finally {
    isRefreshing = false
  }
}

/**
 * 更新在线城市
 */
function updateOnlineCities(nextCities) {
  const normalized = Array.from(new Set(
    (nextCities || [])
      .map(name => (typeof name === 'string' ? name.trim() : ''))
      .filter(name => name && name !== 'Monitor_Admin')
  ))

  onlineCities.value = normalized
  statistics.value.onlineCitiesCount = normalized.length
  
  // 更新地图标记
  if (mapManager) {
    mapManager.updateCityMarkers(cities.value, normalized)
  }
}

/**
 * 处理 WebSocket 消息
 */
function handleWebSocketMessage(data) {
  console.log('[监控] 收到消息:', data)
  
  // 处理普通消息
  if (data.type === 'message') {
    console.log('[监控] 处理普通消息')
    const messageRecord = {
      from: data.from,
      to: '全体',
      content: data.message,
      type: 'normal'
    }
    addMessageRecord(messageRecord)
  }
  // 处理加密消息
  else if (data.type === 'encrypted_message') {
    console.log('[监控] 处理加密消息:', data.from, '→', data.to)
    const messageRecord = {
      from: data.from,
      to: data.to,
      content: data.original_message || '加密消息',
      type: 'encrypted'
    }
    addMessageRecord(messageRecord)
  }
  // 处理系统消息
  else if (data.type === 'system') {
    console.log('[监控] 系统消息:', data.message)
    handleSystemMessage(data.message)
  }
}

/**
 * 处理系统消息
 */
function handleSystemMessage(message) {
  if (!message) return

  const joinMatch = message.match(/^(.+?) 已加入城市通讯网络/)
  if (joinMatch) {
    const cityName = joinMatch[1].trim()
    if (cityName && cityName !== 'Monitor_Admin' && !onlineCities.value.includes(cityName)) {
      updateOnlineCities([...onlineCities.value, cityName])
    }
    return
  }

  const leaveMatch = message.match(/^(.+?) (?:已离开城市通讯网络|断开连接|退出城市通讯网络)/)
  if (leaveMatch) {
    const cityName = leaveMatch[1].trim()
    if (cityName) {
      updateOnlineCities(onlineCities.value.filter(name => name !== cityName))
    }
    return
  }
}

/**
 * 添加消息记录
 */
function addMessageRecord(message) {
  console.log('[监控] 添加消息记录:', message)
  
  recentMessages.value.unshift({
    id: Date.now(),
    ...message,
    timestamp: new Date().toLocaleTimeString(),
    isNew: true
  })

  // 0.5秒后移除新消息标记
  setTimeout(() => {
    const msg = recentMessages.value.find(m => m.id === recentMessages.value[0].id)
    if (msg) {
      msg.isNew = false
    }
  }, 500)

  // 只保留最近50条
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
  
  // 触发统计动画
  statAnimationTrigger.value++

  // 在地图上显示消息动画
  if (!isAnimationPaused.value && shouldShowMessage(message) && messageAnimator) {
    console.log('[监控] 触发消息动画')
    messageAnimator.animateMessage(message, cities.value, onlineCities.value)
  }
}

/**
 * 判断是否应该显示消息
 */
function shouldShowMessage(message) {
  if (filterType.value === 'all') return true
  if (filterType.value === 'encrypted') return message.type === 'encrypted'
  if (filterType.value === 'normal') return message.type === 'normal'
  return true
}

/**
 * 选择城市
 */
function handleCitySelect(cityName) {
  const city = cities.value.find(c => c.name === cityName)
  if (city) {
    selectedCity.value = city
  }
}

/**
 * 清空消息记录
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

// 组件挂载
onMounted(() => {
  isComponentMounted = true
  initMap()
})

// 组件卸载
onUnmounted(() => {
  console.log('[监控] 组件卸载，清理资源...')
  isComponentMounted = false
  
  // 清理定时器
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  
  // 断开 WebSocket
  disconnectWebSocket()
  
  // 清理地图和动画
  if (messageAnimator) {
    messageAnimator.clearAll()
    messageAnimator = null
  }
  
  if (mapManager) {
    mapManager.destroy()
    mapManager = null
  }
  
  console.log('[监控] ✅ 资源清理完成')
})
</script>

<template>
  <div class="monitor-page">
    <div class="monitor-header">
      <div class="header-left">
        <h2>🌐 城市网络通讯监控中心</h2>
        <div class="ws-status" :class="`status-${wsStatus}`">
          <span class="status-dot"></span>
          <span class="status-text">
            {{ wsStatus === 'connected' ? '已连接' : 
               wsStatus === 'connecting' ? '连接中...' : 
               wsStatus === 'error' ? '连接错误' : '未连接' }}
          </span>
          <button 
            v-if="wsStatus === 'error' || wsStatus === 'disconnected'" 
            @click="manualReconnect"
            class="reconnect-btn"
            title="重新连接"
          >
            🔄
          </button>
        </div>
      </div>
      <div class="header-controls">
        <button 
          class="control-btn"
          :class="{ active: !isAnimationPaused }"
          @click="isAnimationPaused = !isAnimationPaused"
        >
          {{ isAnimationPaused ? '▶ 继续' : '⏸ 暂停' }}
        </button>
        <select v-model="filterType" class="filter-select">
          <option value="all">全部消息</option>
          <option value="encrypted">端到端通讯</option>
          <option value="normal">广播消息</option>
        </select>
      </div>
    </div>

    <div class="monitor-content">
      <!-- 左侧地图区域 -->
      <div class="map-section">
        <div v-if="isLoading" class="loading-overlay">
          <div class="loading-spinner"></div>
          <p>地图加载中...</p>
        </div>
        <div v-if="errorMsg && !isLoading" class="error-overlay">
          <div style="text-align: center;">
            <p style="color: #dc2626; font-weight: 600; margin-bottom: 8px;">⚠️ {{ errorMsg }}</p>
            <button 
              @click="initMap" 
              style="padding: 8px 16px; background: #0ea5e9; color: white; border: none; border-radius: 6px; cursor: pointer; margin-top: 12px;"
            >
              🔄 重新加载
            </button>
          </div>
        </div>
        <div ref="mapEl" class="map-container"></div>
        
        <!-- 地图上的统计面板 -->
        <MapStatsPanel 
          :statistics="statistics" 
          :animation-trigger="statAnimationTrigger"
        />
      </div>

      <!-- 右侧信息面板 -->
      <aside class="info-panel">
        <!-- 在线城市列表 -->
        <OnlineCitiesList 
          :online-cities="onlineCities"
          :selected-city="selectedCity"
          @select-city="handleCitySelect"
        />

        <!-- 实时消息流 -->
        <MessageStreamList 
          :messages="recentMessages"
          @clear-messages="clearMessages"
        />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.monitor-page {
  min-height: calc(100vh - 60px);
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 20px;
}

.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: white;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.monitor-header h2 {
  margin: 0;
  font-size: 24px;
  color: #1e293b;
}

.ws-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s ease;
}

.ws-status.status-connected {
  background: #dcfce7;
  color: #15803d;
}

.ws-status.status-connecting {
  background: #fef3c7;
  color: #92400e;
}

.ws-status.status-disconnected {
  background: #f1f5f9;
  color: #64748b;
}

.ws-status.status-error {
  background: #fee2e2;
  color: #dc2626;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.status-connected .status-dot {
  background: #22c55e;
  animation: pulse-status 2s ease-in-out infinite;
}

.status-connecting .status-dot {
  background: #f59e0b;
  animation: blink-status 1s ease-in-out infinite;
}

.status-disconnected .status-dot {
  background: #94a3b8;
}

.status-error .status-dot {
  background: #ef4444;
  animation: shake-status 0.5s ease-in-out infinite;
}

.reconnect-btn {
  padding: 2px 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: transform 0.2s ease;
}

.reconnect-btn:hover {
  transform: scale(1.2) rotate(90deg);
}

.reconnect-btn:active {
  transform: scale(0.9) rotate(180deg);
}

.header-controls {
  display: flex;
  gap: 12px;
}

.control-btn {
  padding: 8px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.control-btn:hover {
  background: #f1f5f9;
  border-color: #0ea5e9;
}

.control-btn.active {
  background: #0ea5e9;
  color: white;
  border-color: #0ea5e9;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  color: #334155;
  cursor: pointer;
  font-size: 14px;
}

.monitor-content {
  display: grid;
  grid-template-columns: 1fr 192px;
  gap: 20px;
  flex: 1;
  overflow: hidden;
}

.map-section {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.map-container {
  width: 100%;
  height: 100%;
  min-height: calc(100vh - 180px);
}

.loading-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.95);
  z-index: 1000;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #e2e8f0;
  border-top-color: #0ea5e9;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-overlay p,
.error-overlay p {
  color: #64748b;
  font-size: 14px;
  margin: 0;
}

.error-overlay p {
  color: #dc2626;
}

.info-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

/* 全局动画 - 在线城市标记脉冲 */
:global(.pulse-marker) {
  animation: pulse-marker 2s ease-in-out infinite;
}

@keyframes pulse-marker {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(34, 197, 94, 0.3), 0 2px 8px rgba(0,0,0,0.4);
  }
}

/* 粒子动画 */
:global(.message-particle) {
  animation: particle-float 0.8s ease-in-out infinite;
}

@keyframes particle-float {
  0%, 100% {
    transform: scale(1) translateY(0);
  }
  50% {
    transform: scale(1.15) translateY(-2px);
  }
}

/* 粒子内部发光动画 - 全局 */
@keyframes particle-pulse {
  0%, 100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.5);
  }
}

/* 到达爆炸效果 - 全局 */
@keyframes arrival-burst {
  0% {
    transform: scale(0.5);
    opacity: 1;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.8;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

/* WebSocket 状态动画 */
@keyframes pulse-status {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
  }
  50% {
    opacity: 0.7;
    box-shadow: 0 0 0 4px rgba(34, 197, 94, 0);
  }
}

@keyframes blink-status {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

@keyframes shake-status {
  0%, 100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-2px);
  }
  75% {
    transform: translateX(2px);
  }
}
</style>
