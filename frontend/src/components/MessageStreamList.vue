<template>
  <div class="panel-section messages-section">
    <div class="section-header">
      <h3>💬 实时消息流</h3>
      <button @click="$emit('clear-messages')" class="clear-btn">清空</button>
    </div>
    <div class="messages-list">
      <transition-group name="message-list">
        <div 
          v-for="msg in messages" 
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
      <div v-if="!messages.length" class="empty-state">
        暂无消息记录
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  messages: {
    type: Array,
    default: () => []
  }
})

defineEmits(['clear-messages'])
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

.messages-section {
  flex: 1;
  min-height: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.section-header h3 {
  margin: 0;
  font-size: 14px;
  color: #1e293b;
  font-weight: 600;
}

.clear-btn {
  padding: 4px 12px;
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

.messages-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-item {
  padding: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
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
  gap: 6px;
  margin-bottom: 4px;
  font-size: 12px;
}

.message-type {
  font-size: 14px;
}

.message-route {
  flex: 1;
  font-weight: 600;
  color: #334155;
}

.message-time {
  color: #94a3b8;
  font-size: 10px;
}

.message-content {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

/* 动画 */
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

.messages-list::-webkit-scrollbar {
  width: 6px;
}

.messages-list::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 3px;
}

.messages-list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.messages-list::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
