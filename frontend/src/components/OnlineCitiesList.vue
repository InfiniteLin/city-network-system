<template>
  <div class="panel-section">
    <h3>📍 在线城市 ({{ onlineCities.length }})</h3>
    <div class="online-cities-list">
      <div 
        v-for="city in onlineCities" 
        :key="city"
        class="online-city-item"
        :class="{ selected: selectedCity?.name === city }"
        @click="$emit('select-city', city)"
      >
        <span class="online-dot"></span>
        {{ city }}
      </div>
      <div v-if="!onlineCities.length" class="empty-state">
        暂无在线城市
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  onlineCities: {
    type: Array,
    default: () => []
  },
  selectedCity: {
    type: Object,
    default: null
  }
})

defineEmits(['select-city'])
</script>

<style scoped>
.panel-section {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-section h3 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #1e293b;
  font-weight: 600;
}

.online-cities-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
}

.online-city-item {
  padding: 6px 10px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
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
  width: 6px;
  height: 6px;
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

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

.online-cities-list::-webkit-scrollbar {
  width: 6px;
}

.online-cities-list::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 3px;
}

.online-cities-list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.online-cities-list::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
