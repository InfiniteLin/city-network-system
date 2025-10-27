<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getEncryptionSteps } from '@/utils/crypto'

// 状态管理
const selectedCity = ref('')
const availableCities = ref([])
const onlineCities = ref([])
const messages = ref([])
const newMessage = ref('')
const isConnected = ref(false)
const currentUser = ref('')
const targetCity = ref('')
const messageType = ref('normal') // 'normal' 或 'encrypted'
const routeInfo = ref('')
const expandedMessageId = ref(null) // 用于跟踪展开的加密消息

// WebSocket连接
let ws = null
let refreshOnlineCitiesTimer = null

// 从MapOverlay获取城市数据
async function loadCities() {
  try {
    // 从localStorage获取城市数据（由MapOverlay页面保存）
    const citiesData = localStorage.getItem('cities')
    if (citiesData) {
      const cities = JSON.parse(citiesData)
      availableCities.value = cities.map(city => city.name)
      console.log('从MapOverlay加载城市数据:', availableCities.value)
      
      // 尝试将拓扑同步到后端（若用户直接刷新到本页面，后端可能还不知道拓扑）
      try {
        const edgesData = JSON.parse(localStorage.getItem('edges') || '[]')
        if (Array.isArray(edgesData) && edgesData.length > 0) {
          const response = await fetch('http://localhost:8001/topology', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cities, edges: edgesData })
          })
          if (response.ok) {
            const result = await response.json()
            console.log('[CityCommunication] 拓扑已同步到后端:', result)
          } else {
            console.warn('[CityCommunication] 拓扑回填返回异常:', response.status)
          }
        } else {
          console.warn('[CityCommunication] localStorage 中无 edges 数据，请先在"地图叠加"页上传边表 CSV')
        }
      } catch (e) { 
        console.warn('[CityCommunication] 拓扑回填失败:', e) 
      }
    } else {
      // 如果没有数据，提供一些默认城市
      console.warn('[CityCommunication] 未在 localStorage 中找到城市数据，请先到"地图叠加"页面上传 CSV')
      availableCities.value = ['北京', '上海', '广州', '深圳', '成都', '杭州', '南京', '武汉']
      console.log('使用默认城市数据')
    }
  } catch (error) {
    console.error('加载城市数据失败:', error)
    availableCities.value = ['北京', '上海', '广州', '深圳', '成都', '杭州', '南京', '武汉']
  }
}

// 获取在线城市列表
async function refreshOnlineCities() {
  try {
    const response = await fetch('http://localhost:8001/cities')
    if (response.ok) {
      const data = await response.json()
      // 确保 cities 是数组
      const cities = Array.isArray(data.cities) ? data.cities : []
      onlineCities.value = cities
      console.log('[CityCommunication] 在线城市:', onlineCities.value)
    } else {
      console.warn('[CityCommunication] 获取在线城市失败，HTTP状态:', response.status)
      onlineCities.value = []
    }
  } catch (error) {
    console.warn('[CityCommunication] 获取在线城市出错:', error)
    // 错误时清空列表，防止显示过时数据
    onlineCities.value = []
  }
}

// 选择城市身份
function selectCity(cityName) {
  selectedCity.value = cityName
  currentUser.value = cityName
  connectWebSocket()
}

// 连接WebSocket
function connectWebSocket() {
  if (ws) {
    // 清理旧的事件监听器，避免重复绑定
    ws.onopen = null
    ws.onmessage = null
    ws.onclose = null
    ws.onerror = null
    
    // 关闭旧连接
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close()
    }
  }
  
  const cityEnc = encodeURIComponent(selectedCity.value)
  const wsUrl = `ws://localhost:8001/ws/${cityEnc}`
  console.log(`正在连接到: ${wsUrl}`)
  ws = new WebSocket(wsUrl)
  
  ws.onopen = () => {
    console.log('WebSocket连接已建立')
    isConnected.value = true
    addSystemMessage(`${selectedCity.value} 已连接到城市通讯网络`)
    
    // 开始定时刷新在线城市（每 2 秒刷新一次）
    if (refreshOnlineCitiesTimer) clearInterval(refreshOnlineCitiesTimer)
    refreshOnlineCitiesTimer = setInterval(() => {
      refreshOnlineCities()
    }, 2000)
    
    // 立即刷新一次
    refreshOnlineCities()
  }
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      console.log('[WebSocket消息] 类型:', data.type, '内容:', data)
      
      if (data.type === 'message') {
        addMessage(data.from, data.message, data.timestamp)
      } else if (data.type === 'encrypted_message') {
        console.log(`[encrypted_message] 从: ${data.from}, 到: ${data.to}, 我是: ${selectedCity.value}`)
        console.log(`[encrypted_message] ========== 详细诊断开始 ==========`)
        console.log(`[encrypted_message] 完整接收的事件数据 (原始JSON长度: ${event.data.length}):`)
        console.log(`[encrypted_message] ${event.data.substring(0, 300)}`)
        console.log(`[encrypted_message] ---------- 字段检查 ----------`)
        console.log(`[encrypted_message] type: ${data.type}`)
        console.log(`[encrypted_message] from: ${data.from}`)
        console.log(`[encrypted_message] to: ${data.to}`)
        console.log(`[encrypted_message] route: ${JSON.stringify(data.route)}`)
        console.log(`[encrypted_message] original_message:`, data.original_message, `(类型: ${typeof data.original_message})`)
        console.log(`[encrypted_message] huffman_encoded:`, data.huffman_encoded ? data.huffman_encoded.substring(0, 50) + '...' : 'MISSING', `(类型: ${typeof data.huffman_encoded})`)
        console.log(`[encrypted_message] encrypted_data:`, data.encrypted_data ? data.encrypted_data.substring(0, 50) + '...' : 'MISSING', `(类型: ${typeof data.encrypted_data})`)
        console.log(`[encrypted_message] huffman_codes: ${data.huffman_codes ? '存在' : 'MISSING'}`)
        console.log(`[encrypted_message] timestamp: ${data.timestamp}`)
        console.log(`[encrypted_message] ========== 诊断结束 ==========`)
        
        // 检查当前城市是否是发送方或接收方
        if (data.from === selectedCity.value) {
          // 发送方看到：原始消息 -> 哈夫曼编码 -> AES加密（这个在sendEncryptedMessage中已经处理了）
          console.log('[接收到encrypted_message] 我是发送方，忽略此消息')
        } else if (data.to === selectedCity.value) {
          // 接收方收到加密消息 - 显示接收过程：AES加密 -> AES解密 -> 哈夫曼解码 -> 原始消息
          console.log('[接收到encrypted_message] 我是接收方!')
          console.log('[接收到encrypted_message] 传递的参数:', {
            from: data.from,
            to: selectedCity.value,
            original: data.original_message,
            huffman: data.huffman_encoded?.substring(0, 20) || 'undefined',
            encrypted: data.encrypted_data?.substring(0, 20) || 'undefined'
          })
          addEncryptedMessage(
            data.from,
            selectedCity.value,
            data.original_message,
            data.huffman_encoded,
            data.encrypted_data,
            data.timestamp,
            'receiver'
          )
        } else {
          // 中间节点，不显示
          console.log('[接收到encrypted_message] 我是中间节点，路径:', data.route)
        }
      } else if (data.type === 'decrypted_message') {
        // 接收方看到：AES加密 -> AES解密 -> 哈夫曼解码 -> 原始消息
        addEncryptedMessage(
          data.from,
          selectedCity.value,
          data.original_message,
          data.huffman_encoded,
          data.aes_encrypted,
          data.timestamp,
          'receiver',
          data.aes_decrypted,
          data.huffman_codes
        )
      } else if (data.type === 'system') {
        addSystemMessage(data.message)
      }
    } catch (error) {
      console.error('解析消息失败:', error)
    }
  }
  
  ws.onclose = () => {
    console.log('WebSocket连接已关闭')
    isConnected.value = false
    addSystemMessage('连接已断开')
    
    // 清理定时器
    if (refreshOnlineCitiesTimer) {
      clearInterval(refreshOnlineCitiesTimer)
      refreshOnlineCitiesTimer = null
    }
  }
  
  ws.onerror = (error) => {
    console.error('WebSocket错误:', error)
    isConnected.value = false
    addSystemMessage('连接出现错误')
  }
}

// 发送消息
function sendMessage() {
  if (!newMessage.value.trim() || !isConnected.value) return
  
  if (messageType.value === 'encrypted') {
    sendEncryptedMessage()
  } else {
    sendNormalMessage()
  }
}

// 发送广播消息（原普通消息）
function sendNormalMessage() {
  const message = {
    type: 'message',
    from: selectedCity.value,
    message: newMessage.value.trim(),
    timestamp: new Date().toISOString()
  }
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
    addMessage(selectedCity.value, newMessage.value.trim(), message.timestamp, true)
    newMessage.value = ''
  }
}

// 发送加密消息
function sendEncryptedMessage() {
  if (!targetCity.value) {
    addSystemMessage('请选择目标城市')
    return
  }
  
  const originalMsg = newMessage.value.trim()
  console.log(`[sendEncryptedMessage] 发送方: ${selectedCity.value}, 接收方: ${targetCity.value}, 消息: ${originalMsg}`)
  
  // 获取加密过程信息
  const encryptionInfo = getEncryptionSteps(originalMsg)
  
  // 立即显示发送方看到的加密过程
  addEncryptedMessage(
    selectedCity.value,
    targetCity.value,
    encryptionInfo.original,
    encryptionInfo.huffmanEncoded,
    encryptionInfo.aesEncrypted,
    new Date().toISOString(),
    'sender'
  )
  
  // 发送加密消息到后端
  const message = {
    type: 'send_encrypted',
    from: selectedCity.value,
    to: targetCity.value,
    message: originalMsg,
    timestamp: new Date().toISOString()
  }
  
  console.log(`[sendEncryptedMessage] 发送消息到后端:`, message)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
    console.log('[sendEncryptedMessage] 消息已发送')
    newMessage.value = ''
    targetCity.value = ''
  } else {
    console.warn('[sendEncryptedMessage] WebSocket未就绪, 状态:', ws?.readyState)
  }
}

// 获取路由信息
async function getRouteInfo() {
  if (!targetCity.value) return
  if (!selectedCity.value) {
    routeInfo.value = '请先选择您的城市'
    return
  }
  
  try {
    const fromEnc = encodeURIComponent(selectedCity.value)
    const toEnc = encodeURIComponent(targetCity.value)
    let response = await fetch(`http://localhost:8001/route/${fromEnc}/${toEnc}`)
    if (!response.ok) {
      // 回退：使用查询参数版本，避免路径参数编码/匹配问题
      const qp = new URLSearchParams({ from_city: selectedCity.value, to_city: targetCity.value })
      response = await fetch(`http://localhost:8001/route?${qp.toString()}`)
    }
    if (response.ok) {
      const data = await response.json()
      routeInfo.value = `路径: ${data.route.join(' -> ')} (${data.hops} 跳)`
    } else {
      const detail = await response.json().catch(() => ({}))
      routeInfo.value = detail?.detail ? `无法获取路由信息：${detail.detail}` : '无法获取路由信息'
    }
  } catch (error) {
    console.error('获取路由信息失败:', error)
    routeInfo.value = '获取路由信息失败'
  }
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') {
    return new Date().toISOString()
  }

  if (typeof value === 'number') {
    if (value > 1e12) {
      return new Date(value).toISOString()
    }
    if (value > 1e9) {
      return new Date(value * 1000).toISOString()
    }
    return new Date().toISOString()
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString()
    }
    const numeric = Number(value)
    if (!Number.isNaN(numeric)) {
      return normalizeTimestamp(numeric)
    }
  }

  return new Date().toISOString()
}

// 添加加密消息详情
function addEncryptedMessage(from, to, original, huffmanEncoded, aesEncrypted, timestamp, type, aesDecrypted = '', huffmanCodes = {}) {
  console.log(`[addEncryptedMessage] 参数检查:`)
  console.log(`  type: ${type}`)
  console.log(`  original: "${original}" (type: ${typeof original})`)
  console.log(`  huffmanEncoded: "${String(huffmanEncoded).substring(0, 30)}..." (type: ${typeof huffmanEncoded}, length: ${String(huffmanEncoded).length})`)
  console.log(`  aesEncrypted: "${String(aesEncrypted).substring(0, 30)}..." (type: ${typeof aesEncrypted}, length: ${String(aesEncrypted).length})`)
  
  // 转换为字符串以安全处理
  original = String(original || '')
  huffmanEncoded = String(huffmanEncoded || '')
  aesEncrypted = String(aesEncrypted || '')
  
  // 处理缺失字段
  if (!huffmanEncoded || huffmanEncoded === 'undefined') {
    console.warn('[addEncryptedMessage] WARNING: huffmanEncoded 缺失或为undefined，使用默认值')
    huffmanEncoded = '[加密编码数据不可用]'
  }
  if (!aesEncrypted || aesEncrypted === 'undefined') {
    console.warn('[addEncryptedMessage] WARNING: aesEncrypted 缺失或为undefined，使用默认值')
    aesEncrypted = '[加密数据不可用]'
  }
  if (!original || original === 'undefined') {
    console.warn('[addEncryptedMessage] WARNING: original 缺失或为undefined')
    original = '[原始消息不可用]'
  }
  
  let messageContent = ''
  let messageType = 'text' // 标记消息类型，用于渲染时选择不同的样式
  let isOwn = (type === 'sender')
  
  if (type === 'sender') {
    // 发送方视角：原始消息 -> 哈夫曼编码 -> AES加密
    const huffmanPreview = huffmanEncoded.substring(0, 60)
    const aesPreview = aesEncrypted.substring(0, 60)
    messageContent = {
      isColorCoded: true,
      direction: 'sender',
      to: to,
      stages: [
        {
          label: '原始消息',
          content: original,
          icon: '📝',
          color: 'stage-original'
        },
        {
          label: '哈夫曼编码',
          content: huffmanPreview + (huffmanEncoded.length > 60 ? '...' : ''),
          fullContent: huffmanEncoded,
          size: `${huffmanEncoded.length} 比特`,
          icon: '🔤',
          color: 'stage-huffman'
        },
        {
          label: 'AES加密',
          content: aesPreview + (aesEncrypted.length > 60 ? '...' : ''),
          fullContent: aesEncrypted,
          size: `${aesEncrypted.length} 字符`,
          icon: '🔐',
          color: 'stage-aes'
        }
      ]
    }
    messageType = 'encrypted-colored'
  } else if (type === 'receiver') {
    // 接收方视角：AES加密 -> AES解密 -> 哈夫曼解码 -> 原始消息
    // 【重要】各个字段的含义：
    //   - aesEncrypted: 接收到的 AES 加密数据（Base64）
    //   - huffmanEncoded: AES 解密后的结果（哈夫曼编码的二进制字符串）
    //   - original: 哈夫曼解码后的结果（最终的原始消息）
    
    const aesEncryptedPreview = aesEncrypted.substring(0, 60)
    // huffmanEncoded 就是 AES 解密的结果
    const aesDecryptedPreview = huffmanEncoded.substring(0, 60)
    
    messageContent = {
      isColorCoded: true,
      direction: 'receiver',
      from: from,
      stages: [
        {
          label: '接收的加密消息',
          content: aesEncryptedPreview + (aesEncrypted.length > 60 ? '...' : ''),
          fullContent: aesEncrypted,
          size: `${aesEncrypted.length} 字符`,
          icon: '📦',
          color: 'stage-encrypted'
        },
        {
          label: 'AES解密结果',
          content: aesDecryptedPreview + (huffmanEncoded.length > 60 ? '...' : ''),
          fullContent: huffmanEncoded,
          size: `${huffmanEncoded.length} 比特`,
          icon: '🔓',
          color: 'stage-decrypted'
        },
        {
          label: '最终消息',
          content: original,
          icon: '✅',
          color: 'stage-final'
        }
      ]
    }
    messageType = 'encrypted-colored'
  }
  
  const normalizedTimestamp = normalizeTimestamp(timestamp)

  const messageObj = {
    from: type === 'sender' ? selectedCity.value : from,
    message: messageContent,
    messageType: messageType, // 'text' 或 'encrypted-colored'
    timestamp: normalizedTimestamp,
    isOwn,
    isEncrypted: true,
    id: Date.now() + Math.random()
  }
  
  console.log(`[addEncryptedMessage] 成功添加消息`)
  messages.value.push(messageObj)
  
  // 滚动到底部
  setTimeout(() => {
    const chatContainer = document.querySelector('.chat-messages')
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight
    }
  }, 100)
}

// 添加消息到聊天记录
function addMessage(from, message, timestamp, isOwn = false) {
  const normalizedTimestamp = normalizeTimestamp(timestamp)
  messages.value.push({
    from,
    message,
    timestamp: normalizedTimestamp,
    isOwn,
    id: Date.now() + Math.random()
  })
  
  // 滚动到底部
  setTimeout(() => {
    const chatContainer = document.querySelector('.chat-messages')
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight
    }
  }, 100)
}

// 添加系统消息
function addSystemMessage(message) {
  const timestamp = normalizeTimestamp()
  messages.value.push({
    from: '系统',
    message,
    timestamp,
    isSystem: true,
    id: Date.now() + Math.random()
  })
}

// 格式化时间
function formatTime(timestamp) {
  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) {
    return '--:--'
  }
  return new Date(parsed).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 切换加密消息的展开/折叠状态
function toggleMessageExpand(messageId) {
  if (expandedMessageId.value === messageId) {
    expandedMessageId.value = null
  } else {
    expandedMessageId.value = messageId
  }
}

// 断开连接
function disconnect() {
  if (ws) {
    ws.close()
    ws = null
  }
  if (refreshOnlineCitiesTimer) {
    clearInterval(refreshOnlineCitiesTimer)
    refreshOnlineCitiesTimer = null
  }
  selectedCity.value = ''
  currentUser.value = ''
  isConnected.value = false
  messages.value = []
  onlineCities.value = []
}

// 组件挂载时加载城市数据
onMounted(() => {
  loadCities()
})

// 组件卸载时断开连接和清理定时器
onUnmounted(() => {
  disconnect()
  if (refreshOnlineCitiesTimer) {
    clearInterval(refreshOnlineCitiesTimer)
  }
})
</script>

<template>
  <div class="page">
    <div class="header">
      <h2>城市通讯</h2>
      <p class="muted">选择您的城市身份，与其他城市进行实时通讯</p>
    </div>

    <!-- 城市选择界面 -->
    <div v-if="!selectedCity" class="city-selection card">
      <h3>选择您的城市身份</h3>
      <div class="cities-grid">
        <button 
          v-for="city in availableCities" 
          :key="city"
          @click="selectCity(city)"
          class="city-btn"
        >
          {{ city }}
        </button>
      </div>
    </div>

    <!-- 聊天界面 -->
    <div v-else class="chat-interface">
      <!-- 聊天头部 -->
      <div class="chat-header card">
        <div class="user-info">
          <span class="user-badge">{{ selectedCity }}</span>
          <span class="status" :class="{ connected: isConnected }">
            {{ isConnected ? '已连接' : '连接中...' }}
          </span>
        </div>
        <button @click="disconnect" class="btn ghost">断开连接</button>
      </div>

      <!-- 在线城市列表 -->
      <div class="online-cities card" v-if="onlineCities && onlineCities.length > 0">
        <div class="online-cities-header">
          <h4>在线城市 ({{ onlineCities.length }})</h4>
        </div>
        <div class="online-cities-list">
          <span 
            v-for="city in onlineCities" 
            :key="city"
            class="online-city-badge"
            :class="{ 'is-current': city === selectedCity }"
          >
            {{ city }}
            <span v-if="city === selectedCity" class="current-indicator">✓</span>
          </span>
        </div>
      </div>

      <!-- 聊天消息区域 -->
      <div class="chat-container card">
        <div class="chat-messages">
          <div 
            v-for="msg in messages" 
            :key="msg.id"
            class="message"
            :class="{ 
              'own-message': msg.isOwn, 
              'system-message': msg.isSystem,
              'encrypted-message': msg.isEncrypted
            }"
          >
            <div v-if="!msg.isSystem" class="message-header">
              <span class="sender">{{ msg.from }}</span>
              <span class="time">{{ formatTime(msg.timestamp) }}</span>
            </div>
            <div class="message-content" :class="{ 'encrypted-content': msg.isEncrypted }">
              <!-- 广播消息 -->
              <pre v-if="msg.messageType !== 'encrypted-colored'">{{ msg.message }}</pre>
              
              <!-- 端到端加密消息（简洁模式 + 可展开） -->
              <div v-else-if="msg.messageType === 'encrypted-colored'" class="encrypted-message-container">
                <!-- 简洁显示模式 -->
                <div 
                  class="encrypted-message-brief"
                  @click="toggleMessageExpand(msg.id)"
                  :class="{ 'is-expanded': expandedMessageId === msg.id }"
                >
                  <span class="encrypted-icon">🔐</span>
                  <span class="encrypted-label">【加密消息】</span>
                  <span class="plaintext">{{ msg.message.stages[0].content }}</span>
                  <span class="expand-indicator">{{ expandedMessageId === msg.id ? '▼' : '▶' }}</span>
                </div>
                
                <!-- 详细展开模式 -->
                <div v-if="expandedMessageId === msg.id" class="encrypted-stages-detailed">
                  <!-- 发送方视角 -->
                  <div v-if="msg.message.direction === 'sender'" class="sender-perspective">
                    <div class="perspective-header">📤 加密流程</div>
                    <div class="stage-container">
                      <div v-for="(stage, index) in msg.message.stages" :key="index" class="stage-item" :class="`${stage.color}`">
                        <div class="stage-header">
                          <span class="stage-icon">{{ stage.icon }}</span>
                          <span class="stage-label">{{ stage.label }}</span>
                          <span v-if="stage.size" class="stage-size">{{ stage.size }}</span>
                        </div>
                        <div class="stage-content">
                          <code>{{ stage.content }}</code>
                        </div>
                        <div v-if="index < msg.message.stages.length - 1" class="stage-arrow">↓</div>
                      </div>
                    </div>
                    <div class="destination-info">→ 发送给: <strong>{{ msg.message.to }}</strong></div>
                  </div>
                  
                  <!-- 接收方视角 -->
                  <div v-else-if="msg.message.direction === 'receiver'" class="receiver-perspective">
                    <div class="perspective-header">📥 解密流程</div>
                    <div class="sender-info">来自: <strong>{{ msg.message.from }}</strong></div>
                    <div class="stage-container">
                      <div v-for="(stage, index) in msg.message.stages" :key="index" class="stage-item" :class="`${stage.color}`">
                        <div class="stage-header">
                          <span class="stage-icon">{{ stage.icon }}</span>
                          <span class="stage-label">{{ stage.label }}</span>
                          <span v-if="stage.size" class="stage-size">{{ stage.size }}</span>
                        </div>
                        <div class="stage-content">
                          <code>{{ stage.content }}</code>
                        </div>
                        <div v-if="index < msg.message.stages.length - 1" class="stage-arrow">↓</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 消息类型选择 -->
        <div class="message-type-selector">
          <label class="radio-group">
            <input 
              type="radio" 
              v-model="messageType" 
              value="normal"
              :disabled="!isConnected"
            />
            <span>广播</span>
          </label>
          <label class="radio-group">
            <input 
              type="radio" 
              v-model="messageType" 
              value="encrypted"
              :disabled="!isConnected"
            />
            <span>端到端通讯</span>
          </label>
        </div>

        <!-- 目标城市选择（仅端到端通讯） -->
        <div v-if="messageType === 'encrypted'" class="target-city-selector">
          <select 
            v-model="targetCity" 
            @change="getRouteInfo"
            :disabled="!isConnected"
            class="target-select"
          >
            <option value="">选择目标城市</option>
            <option 
              v-for="city in availableCities" 
              :key="city"
              :value="city"
              :disabled="city === selectedCity"
            >
              {{ city }}
            </option>
          </select>
          <div v-if="routeInfo" class="route-info">{{ routeInfo }}</div>
        </div>

        <!-- 消息输入区域 -->
        <div class="message-input">
          <input 
            v-model="newMessage"
            @keyup.enter="sendMessage"
            :placeholder="messageType === 'encrypted' ? '输入端到端加密消息...' : '输入广播消息...'"
            :disabled="!isConnected"
            class="message-field"
          />
          <button 
            v-if="messageType === 'normal'"
            @click="sendMessage"
            :disabled="!newMessage.trim() || !isConnected"
            class="send-btn"
          >
            发送广播
          </button>
          <button 
            v-else
            @click="sendMessage"
            :disabled="!newMessage.trim() || !isConnected || !targetCity"
            class="send-btn send-encrypted-btn"
          >
            {{ messageType === 'encrypted' ? '发送加密' : '发送' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  gap: 16px;
}

.header {
  text-align: center;
  padding-bottom: 8px;
}

.header h2 {
  margin: 0;
  font-size: 24px;
}

.muted {
  color: #64748b;
  margin: 8px 0 0 0;
}

/* 城市选择界面 */
.city-selection {
  padding: 24px;
  text-align: center;
}

.city-selection h3 {
  margin: 0 0 20px 0;
  font-size: 20px;
}

.cities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  max-width: 600px;
  margin: 0 auto;
}

.city-btn {
  padding: 12px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  background: white;
  color: #334155;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.city-btn:hover {
  border-color: #3b82f6;
  background: #f8fafc;
  transform: translateY(-1px);
}

/* 聊天界面 */
.chat-interface {
  display: grid;
  gap: 16px;
}

.chat-header {
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-badge {
  background: #3b82f6;
  color: white;
  padding: 6px 12px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 14px;
}

.status {
  color: #64748b;
  font-size: 14px;
}

.status.connected {
  color: #10b981;
}

/* 在线城市列表 */
.online-cities {
  padding: 12px 16px;
  background: #f0fdf4;
  border: 1px solid #dcfce7;
}

.online-cities-header {
  margin-bottom: 8px;
}

.online-cities-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #166534;
}

.online-cities-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.online-city-badge {
  display: inline-block;
  padding: 4px 10px;
  background: #bbf7d0;
  color: #15803d;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid #86efac;
  transition: all 0.2s ease;
}

.online-city-badge.is-current {
  background: #22c55e;
  color: white;
  border-color: #16a34a;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.3);
  font-weight: 700;
}

.online-city-badge .current-indicator {
  margin-left: 4px;
  font-weight: bold;
}

.chat-container {
  height: 600px;
  display: grid;
  grid-template-rows: 1fr auto;
}

.chat-messages {
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  max-width: 70%;
  word-wrap: break-word;
}

.message.own-message {
  align-self: flex-end;
}

/* 发送方的加密消息框增大 */
.message.own-message.encrypted-message {
  max-width: 90%;
}

.message.system-message {
  align-self: center;
  text-align: center;
  max-width: 100%;
}

.message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 12px;
}

.own-message .message-header {
  flex-direction: row-reverse;
}

.sender {
  font-weight: 600;
  color: #334155;
}

.time {
  color: #64748b;
}

.message-content {
  padding: 8px 12px;
  border-radius: 12px;
  background: #f1f5f9;
  color: #334155;
}

.message-content.encrypted-content {
  padding: 14px 16px;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border-left: 4px solid #f59e0b;
  border-radius: 8px;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  font-size: 13px;
  line-height: 1.8;
  max-width: 100%;
  overflow-x: auto;
  color: #78350f;
}

.message-content.encrypted-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: #78350f;
  font-family: 'Segoe UI', 'Microsoft YaHei', monospace;
  font-size: 13px;
}

.own-message .message-content {
  background: #3b82f6;
  color: white;
}

.encrypted-message.own-message .message-content {
  background: #fbbf24;
  color: #78350f;
  border-left-color: #f59e0b;
}

.system-message .message-content {
  background: #fef3c7;
  color: #92400e;
  font-style: italic;
}

.message-input {
  padding: 16px;
  border-top: 1px solid #e2e8f0;
  display: flex;
  gap: 12px;
}

.message-field {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  outline: none;
  font-size: 14px;
}

.message-field:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.message-field:disabled {
  background: #f9fafb;
  color: #9ca3af;
}

.send-btn {
  padding: 10px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.send-btn:hover:not(:disabled) {
  background: #2563eb;
}

.send-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

/* 加密消息按钮样式 */
.send-encrypted-btn {
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
}

.send-encrypted-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
  transform: translateY(-1px);
}

.send-encrypted-btn::before {
  content: '🔐 ';
}

/* 消息类型选择器 */
.message-type-selector {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  gap: 16px;
}

.radio-group {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
}

.radio-group input[type="radio"] {
  margin: 0;
}

/* 目标城市选择器 */
.target-city-selector {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.target-select {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  font-size: 14px;
  outline: none;
}

.target-select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.target-select:disabled {
  background: #f9fafb;
  color: #9ca3af;
}

.route-info {
  font-size: 12px;
  color: #64748b;
  background: #f1f5f9;
  padding: 6px 8px;
  border-radius: 4px;
  font-family: monospace;
}

/* 彩色编码的加密消息样式 */
.encrypted-message-container {
  width: 100%;
}

/* 加密消息简洁模式 */
.encrypted-message-brief {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  user-select: none;
}

.encrypted-message-brief:hover {
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  transform: translateY(-2px);
}

.encrypted-message-brief.is-expanded {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  margin-bottom: 8px;
}

.encrypted-icon {
  font-size: 16px;
}

.encrypted-label {
  font-weight: 600;
  font-size: 14px;
}

.encrypted-message-brief .plaintext {
  flex: 1;
  font-size: 13px;
  opacity: 0.95;
  word-break: break-all;
}

.expand-indicator {
  font-size: 12px;
  transition: transform 0.3s ease;
}

.encrypted-message-brief.is-expanded .expand-indicator {
  transform: rotate(0deg);
}

/* 加密消息详细展开模式 */
.encrypted-stages-detailed {
  margin-top: 8px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.encrypted-stages {
  padding: 0;
  background: none;
  border: none;
}

.perspective-header {
  font-size: 13px;
  font-weight: 600;
  padding: 8px 12px;
  background: #f0f9ff;
  border-bottom: 2px solid #0ea5e9;
  border-radius: 8px 8px 0 0;
  color: #0369a1;
}

.sender-perspective .perspective-header {
  background: #fffbeb;
  border-bottom-color: #f59e0b;
  color: #b45309;
}

.receiver-perspective .perspective-header {
  background: #f0f9ff;
  border-bottom-color: #0ea5e9;
  color: #0369a1;
}

.stage-container {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stage-item {
  padding: 12px;
  border-radius: 8px;
  border-left: 4px solid;
  background: white;
  transition: all 0.2s ease;
}

.stage-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateX(2px);
}

/* 发送方的阶段颜色 - 暖色系 */
.stage-original {
  background: #fef3c7;
  border-left-color: #f59e0b;
}

.stage-original .stage-label {
  color: #b45309;
}

.stage-huffman {
  background: #fed7aa;
  border-left-color: #f97316;
}

.stage-huffman .stage-label {
  color: #9a3412;
}

.stage-aes {
  background: #fee2e2;
  border-left-color: #ef4444;
}

.stage-aes .stage-label {
  color: #991b1b;
}

/* 接收方的阶段颜色 - 冷色系 */
.stage-encrypted {
  background: #e0f2fe;
  border-left-color: #0284c7;
}

.stage-encrypted .stage-label {
  color: #0c4a6e;
}

.stage-decrypted {
  background: #cffafe;
  border-left-color: #06b6d4;
}

.stage-decrypted .stage-label {
  color: #164e63;
}

.stage-final {
  background: #dcfce7;
  border-left-color: #22c55e;
  font-weight: 600;
}

.stage-final .stage-label {
  color: #166534;
}

.stage-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}

.stage-icon {
  font-size: 16px;
}

.stage-label {
  flex: 1;
}

.stage-size {
  font-size: 11px;
  opacity: 0.7;
  font-weight: normal;
  font-family: monospace;
}

.stage-content {
  margin-top: 6px;
}

.stage-content code {
  display: block;
  padding: 8px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  word-break: break-all;
  white-space: pre-wrap;
  max-height: 80px;
  overflow-y: auto;
  color: #334155;
}

.stage-arrow {
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
  margin: 4px 0;
  font-weight: bold;
}

.destination-info {
  padding: 8px 12px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  border-radius: 0 0 8px 8px;
  font-size: 12px;
  color: #64748b;
}

.sender-info {
  padding: 8px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  border-radius: 0;
  font-size: 12px;
  color: #64748b;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .cities-grid {
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 8px;
  }
  
  .city-btn {
    padding: 10px 12px;
    font-size: 14px;
  }
  
  .chat-container {
    height: 400px;
  }
  
  .message {
    max-width: 85%;
  }
}
</style>
