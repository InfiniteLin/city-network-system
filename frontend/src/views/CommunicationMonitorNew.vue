<script setup>
import { useMonitor } from '../composables/useMonitor'
import { WS_STATUS } from '../services/websocket.service'

// 使用监控 Composable
const {
  mapEl,
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
  clearMessages,
  manualReconnect
} = useMonitor()

// WebSocket 状态文本
const wsStatusText = {
  [WS_STATUS.CONNECTED]: '已连接',
  [WS_STATUS.CONNECTING]: '连接中...',
  [WS_STATUS.DISCONNECTED]: '未连接',
  [WS_STATUS.ERROR]: '连接错误'
}
</script>

<template>
  <div class="monitor-page">
    <div class="monitor-header">
      <div class="header-left">
        <h2>🌐 城市网络通讯监控中心</h2>
        <div class="ws-status" :class="`status-${wsStatus}`">
          <span class="status-dot"></span>
          <span class="status-text">{{ wsStatusText[wsStatus] || '未知' }}</span>
          <button 
            v-if="wsStatus === WS_STATUS.ERROR || wsStatus === WS_STATUS.DISCONNECTED" 
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
              @click="location.reload()" 
              style="padding: 8px 16px; background: #0ea5e9; color: white; border: none; border-radius: 6px; cursor: pointer; margin-top: 12px;"
            >
              🔄 重新加载
            </button>
          </div>
        </div>
        <div ref="mapEl" class="map-container"></div>
        
        <!-- 地图上的统计面板 -->
        <div class="map-overlay-stats">
          <div class="stat-card">
            <div class="stat-value" :key="`online-${statistics.onlineCitiesCount}`">
              {{ statistics.onlineCitiesCount }}
            </div>
            <div class="stat-label">在线城市</div>
          </div>
          <div class="stat-card" :class="{ 'stat-pulse': statAnimationTrigger > 0 }">
            <div class="stat-value" :key="`total-${statistics.totalMessages}`">
              {{ statistics.totalMessages }}
            </div>
            <div class="stat-label">总消息数</div>
          </div>
          <div class="stat-card encrypted" :class="{ 'stat-pulse': statAnimationTrigger > 0 }">
            <div class="stat-value" :key="`encrypted-${statistics.encryptedMessages}`">
              {{ statistics.encryptedMessages }}
            </div>
            <div class="stat-label">端到端通讯</div>
          </div>
        </div>
      </div>

      <!-- 右侧信息面板 -->
      <aside class="info-panel">
        <!-- 在线城市列表 -->
        <div class="panel-section">
          <h3>📍 在线城市 ({{ onlineCities.length }})</h3>
          <div class="online-cities-list">
            <div 
              v-for="city in onlineCities" 
              :key="city"
              class="online-city-item"
              :class="{ selected: selectedCity?.name === city }"
              @click="selectedCity = cities.find(c => c.name === city)"
            >
              <span class="online-dot"></span>
              {{ city }}
            </div>
            <div v-if="!onlineCities.length" class="empty-state">
              暂无在线城市
            </div>
          </div>
        </div>

        <!-- 实时消息流 -->
        <div class="panel-section messages-section">
          <div class="section-header">
            <h3>💬 实时消息流</h3>
            <button @click="clearMessages" class="clear-btn">清空</button>
          </div>
          <div class="messages-list">
            <transition-group name="message-list">
              <div 
                v-for="msg in recentMessages" 
                :key="msg.id"
                class="message-item"
                :class="{ 
                  encrypted: msg.type === 'encrypted',
                  'new-message': msg.isNew
                }"
              >
                <div class="message-header">
                  <span class="message-type">
                    {{ msg.type === 'encrypted' ? '🔐' : '📨' }}
                  </span>
                  <span class="message-route">{{ msg.from }} → {{ msg.to }}</span>
                  <span class="message-time">{{ msg.timestamp }}</span>
                </div>
                <div class="message-content">{{ msg.content }}</div>
                <div v-if="msg.isNew" class="new-indicator"></div>
              </div>
            </transition-group>
            <div v-if="!recentMessages.length" class="empty-state">
              暂无消息记录
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* 样式保持与原来一致 */
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
  grid-template-columns: 1fr 400px;
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

.map-overlay-stats {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  gap: 10px;
  pointer-events: none;
}

.stat-card {
  background: rgba(255, 255, 255, 0.95);
  padding: 12px 16px;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  min-width: 90px;
  text-align: center;
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
}

.stat-card.stat-pulse {
  animation: stat-card-pulse 0.6s ease-out;
}

.stat-card.encrypted {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.95) 0%, rgba(124, 58, 237, 0.95) 100%);
  color: white;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #0ea5e9;
  margin-bottom: 2px;
  transition: all 0.3s ease;
}

.stat-card .stat-value {
  animation: stat-number-pop 0.4s ease-out;
}

.stat-card.encrypted .stat-value {
  color: white;
}

.stat-label {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.stat-card.encrypted .stat-label {
  color: rgba(255, 255, 255, 0.9);
}

.info-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

.panel-section {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-section h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: #1e293b;
  font-weight: 600;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-header h3 {
  margin: 0;
}

.clear-btn {
  padding: 6px 12px;
  font-size: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #dc2626;
}

.online-cities-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.online-city-item {
  padding: 8px 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: #15803d;
}

.online-city-item:hover {
  background: #dcfce7;
  transform: translateX(4px);
}

.online-city-item.selected {
  background: #22c55e;
  color: white;
  border-color: #16a34a;
}

.online-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  animation: pulse 2s infinite;
}

.online-city-item.selected .online-dot {
  background: white;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.messages-section {
  flex: 1;
  min-height: 0;
}

.messages-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message-item {
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  border-left: 3px solid #0ea5e9;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.message-item:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateX(2px);
}

.message-item.encrypted {
  background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
  border-left-color: #8b5cf6;
}

.message-item.new-message {
  animation: message-enter 0.5s ease-out;
  box-shadow: 0 4px 16px rgba(14, 165, 233, 0.3);
}

.message-item.encrypted.new-message {
  box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3);
}

.new-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #0ea5e9, transparent);
  animation: indicator-slide 0.5s ease-out;
}

.message-item.encrypted .new-indicator {
  background: linear-gradient(90deg, transparent, #8b5cf6, transparent);
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}

.message-type {
  font-size: 16px;
}

.message-route {
  flex: 1;
  font-weight: 600;
  color: #334155;
}

.message-time {
  color: #94a3b8;
  font-size: 11px;
}

.message-content {
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
}

/* 动画 */
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
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@keyframes shake-status {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}

@keyframes stat-card-pulse {
  0%, 100% { transform: scale(1); }
  30% { transform: scale(1.08); }
  60% { transform: scale(0.98); }
}

@keyframes stat-number-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.3); }
  70% { transform: scale(0.95); }
  100% { transform: scale(1); }
}

@keyframes message-enter {
  0% {
    opacity: 0;
    transform: translateX(-30px) scale(0.9);
  }
  50% {
    transform: translateX(5px) scale(1.02);
  }
  100% {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes indicator-slide {
  0% {
    transform: translateX(-100%);
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
  100% {
    transform: translateX(100%);
    opacity: 0;
  }
}

.message-list-enter-active {
  animation: message-enter 0.5s ease-out;
}

.message-list-leave-active {
  transition: all 0.3s ease;
}

.message-list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.message-list-move {
  transition: transform 0.3s ease;
}

/* 粒子动画 */
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

/* 滚动条样式 */
.online-cities-list::-webkit-scrollbar,
.messages-list::-webkit-scrollbar {
  width: 6px;
}

.online-cities-list::-webkit-scrollbar-track,
.messages-list::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 3px;
}

.online-cities-list::-webkit-scrollbar-thumb,
.messages-list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.online-cities-list::-webkit-scrollbar-thumb:hover,
.messages-list::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
