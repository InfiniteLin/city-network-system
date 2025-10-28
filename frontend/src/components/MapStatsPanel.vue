<template>
  <div class="map-overlay-stats">
    <div class="stat-card">
      <div class="stat-value" :key="`online-${statistics.onlineCitiesCount}`">
        {{ statistics.onlineCitiesCount }}
      </div>
      <div class="stat-label">在线城市</div>
    </div>
    <div class="stat-card" :class="{ 'stat-pulse': animationTrigger > 0 }">
      <div class="stat-value" :key="`total-${statistics.totalMessages}`">
        {{ statistics.totalMessages }}
      </div>
      <div class="stat-label">总消息数</div>
    </div>
    <div class="stat-card encrypted" :class="{ 'stat-pulse': animationTrigger > 0 }">
      <div class="stat-value" :key="`encrypted-${statistics.encryptedMessages}`">
        {{ statistics.encryptedMessages }}
      </div>
      <div class="stat-label">端到端通讯</div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  statistics: {
    type: Object,
    required: true
  },
  animationTrigger: {
    type: Number,
    default: 0
  }
})
</script>

<style scoped>
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

@keyframes stat-card-pulse {
  0%, 100% {
    transform: scale(1);
  }
  30% {
    transform: scale(1.08);
  }
  60% {
    transform: scale(0.98);
  }
}

@keyframes stat-number-pop {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.3);
  }
  70% {
    transform: scale(0.95);
  }
  100% {
    transform: scale(1);
  }
}
</style>
