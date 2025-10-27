<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

// 高德地图配置
const AMAP_KEY = 'f0d1e40d79a2157f20c4b3cb5fc43579'
const mapEl = ref(null)
let map = null
let markers = []
let polylines = [] // 存储地图上的线条

const cities = ref([])
const edges = ref([]) // [{u, v, w}] 城市间的边
const mstEdges = ref([]) // 最小生成树的边
const totalCost = ref(0)
const errorMsg = ref('')
const isLoading = ref(false)
const showTopology = ref(false)
const showMST = ref(false)

// 加载高德地图JS
function loadAmapJs() {
  return new Promise((resolve, reject) => {
    if (window.AMap) return resolve()
    
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=1.4.15&key=${AMAP_KEY}&plugin=AMap.Scale,AMap.ToolBar`
    script.async = true
    script.onload = () => {
      console.log('高德地图API加载成功')
      resolve()
    }
    script.onerror = (e) => {
      console.error('高德地图API加载失败:', e)
      reject(e)
    }
    document.head.appendChild(script)
  })
}

// 初始化地图
async function initMap() {
  try {
    isLoading.value = true
    await loadAmapJs()
    if (!mapEl.value) return
    
    console.log('开始初始化地图，容器:', mapEl.value)
    
    // 等待一下确保DOM完全准备好
    await new Promise(resolve => setTimeout(resolve, 500))
    
    map = new window.AMap.Map(mapEl.value, {
      zoom: 5,
      center: [104.0665, 30.5723], // 成都
      resizeEnable: true,
      rotateEnable: true,
      pitchEnable: true,
      zoomEnable: true,
      dragEnable: true
    })
    
    console.log('地图初始化完成:', map)
    
    // 添加比例尺控件
    const scale = new window.AMap.Scale({
      position: 'LB'
    })
    map.addControl(scale)
    
    // 添加工具条控件
    const toolBar = new window.AMap.ToolBar({
      position: 'RT'
    })
    map.addControl(toolBar)
    
    errorMsg.value = ''
  } catch (e) {
    console.error('地图初始化失败:', e)
    errorMsg.value = `地图加载失败: ${e.message}`
  } finally {
    isLoading.value = false
  }
}

// 清除所有标记和线条
function clearMarkers() {
  if (!map) return
  if (markers.length) {
    map.remove(markers)
    markers = []
  }
  if (polylines.length) {
    map.remove(polylines)
    polylines = []
  }
}

// 清除所有已绘制的线条
function clearPolylines() {
  if (!map) return
  if (polylines.length) {
    map.remove(polylines)
    polylines = []
  }
}

// 在地图上渲染城市标记
function renderMarkers() {
  if (!map) {
    console.log('地图未初始化，无法渲染标记')
    return
  }
  clearMarkers()
  
  console.log('开始渲染城市标记:', cities.value)
  
  for (const city of cities.value) {
    const marker = new window.AMap.Marker({
      position: [Number(city.lng), Number(city.lat)],
      title: city.name,
      content: `<div style="background: #22c55e; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; white-space: nowrap;">${city.name}</div>`
    })
    markers.push(marker)
  }
  
  map.add(markers)
  console.log('已添加标记到地图:', markers.length)
  
  if (markers.length > 0) {
    map.setFitView(markers, false, [20, 20, 20, 20])
  }
}

// 在地图上绘制网络拓扑
function renderTopology() {
  if (!map || !showTopology.value) return
  
  // 清除之前的线条
  clearPolylines()
  
  for (const edge of edges.value) {
    const city1 = cities.value[edge.u]
    const city2 = cities.value[edge.v]
    if (!city1 || !city2) continue
    
    const polyline = new window.AMap.Polyline({
      path: [
        [Number(city1.lng), Number(city1.lat)],
        [Number(city2.lng), Number(city2.lat)]
      ],
      strokeColor: '#3b82f6', // 柔和蓝色
      strokeWeight: 3, // 略细
      strokeOpacity: 1,
      isOutline: true, // 白色描边提升对比
      outlineColor: '#ffffff',
      borderWeight: 1,
      zIndex: 50
    })
    
    polylines.push(polyline)
  }
  
  map.add(polylines)
}

// 切换拓扑显示/隐藏
function toggleTopology() {
  showTopology.value = !showTopology.value
  if (showTopology.value) {
    if (!edges.value.length) {
      errorMsg.value = '当前无有效边，请先上传边表CSV，且与城市列表匹配'
      return
    }
    errorMsg.value = ''
    renderTopology()
  } else {
    clearPolylines()
  }
}

// 在地图上绘制最小生成树
function renderMST() {
  if (!map || !showMST.value) return
  
  // 清除之前的MST线条
  const mstPolylines = polylines.filter(p => p.getOptions().strokeColor === '#ef4444')
  if (mstPolylines.length) {
    map.remove(mstPolylines)
  }
  
  for (const edge of mstEdges.value) {
    const city1 = cities.value[edge.u]
    const city2 = cities.value[edge.v]
    if (!city1 || !city2) continue
    
    const polyline = new window.AMap.Polyline({
      path: [
        [Number(city1.lng), Number(city1.lat)],
        [Number(city2.lng), Number(city2.lat)]
      ],
      strokeColor: '#ef4444',
      strokeWeight: 4,
      strokeOpacity: 1,
      isOutline: true,
      outlineColor: '#ffffff',
      borderWeight: 1,
      zIndex: 60
    })
    
    polylines.push(polyline)
  }
  
  map.add(polylines)
}

// Kruskal算法计算最小生成树
function computeMST() {
  if (edges.value.length === 0) return
  
  const n = cities.value.length
  const sortedEdges = [...edges.value].sort((a, b) => a.w - b.w)
  const parent = Array.from({ length: n }, (_, i) => i)
  const rank = Array.from({ length: n }, () => 0)
  
  function find(x) {
    return parent[x] === x ? x : (parent[x] = find(parent[x]))
  }
  
  function union(x, y) {
    x = find(x)
    y = find(y)
    if (x === y) return false
    if (rank[x] < rank[y]) [x, y] = [y, x]
    parent[y] = x
    if (rank[x] === rank[y]) rank[x]++
    return true
  }
  
  mstEdges.value = []
  let cost = 0
  
  for (const edge of sortedEdges) {
    if (union(edge.u, edge.v)) {
      mstEdges.value.push(edge)
      cost += edge.w
      if (mstEdges.value.length === n - 1) break
    }
  }
  
  totalCost.value = mstEdges.value.length === n - 1 ? cost : Infinity
  showMST.value = true
  renderMST()
}

// 处理CSV文件上传
async function onCsvChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = async (event) => {
    try {
      const text = event.target.result
      const rows = text.trim().split(/\r?\n/).filter(Boolean)
      
      // 尝试识别：优先支持「城市+边」混合单文件；否则回退到单独城市/边表
      if (!(await parseCombinedCSV(rows))) {
        const firstRow = rows[0].split(/[,;]/).map(col => col.trim())
        if (firstRow.length === 3 && !Number.isNaN(Number(firstRow[1])) && !Number.isNaN(Number(firstRow[2]))) {
          await parseCitiesCSV(rows)
        } else if (firstRow.length === 3 && !Number.isNaN(Number(firstRow[2]))) {
          await parseEdgesCSV(rows)
        } else {
          errorMsg.value = '无法识别CSV文件格式'
        }
      }
    } catch (err) {
      console.error('CSV解析失败:', err)
      errorMsg.value = 'CSV文件格式错误'
    }
  }
  
  reader.readAsText(file)
  e.target.value = ''
}

// 解析城市坐标CSV
async function parseCitiesCSV(rows) {
  const data = []
  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i].split(/[,;]/).map(col => col.trim())
    if (i === 0 && isNaN(Number(cols[1]))) continue // 跳过标题
    if (cols.length < 3) continue
    
    data.push({
      name: cols[0],
      lng: Number(cols[1]),
      lat: Number(cols[2])
    })
  }
  
  cities.value = data
  // 保存城市数据到localStorage，供其他页面使用
  localStorage.setItem('cities', JSON.stringify(data))
  // 发送拓扑数据到后端（包含边数据）
  await loadTopologyToBackend(data, edges.value)
  renderMarkers()
}

// 解析边表CSV
async function parseEdgesCSV(rows) {
  const edgeData = []
  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i].split(/[,;]/).map(col => col.trim())
    if (i === 0 && isNaN(Number(cols[2]))) continue // 跳过标题
    if (cols.length < 3) continue
    
    const uRaw = cols[0]
    const vRaw = cols[1]
    const w = Number(cols[2])

    // 同时支持「按城市名」与「按城市编号(1-based)」两种格式
    // 1) 名称模式: 直接用名称匹配
    let uIndex = cities.value.findIndex(c => c.name === uRaw)
    let vIndex = cities.value.findIndex(c => c.name === vRaw)

    // 2) 数字索引模式: 若两端均为有效数字且在 [1, n] 范围，则按 1-based 转为 0-based
    if (uIndex === -1 && vIndex === -1) {
      const uNum = Number(uRaw)
      const vNum = Number(vRaw)
      const n = cities.value.length
      const isValidIndex = (x) => Number.isFinite(x) && Number.isInteger(x) && x >= 1 && x <= n
      if (isValidIndex(uNum) && isValidIndex(vNum)) {
        uIndex = uNum - 1
        vIndex = vNum - 1
      }
    }

    if (uIndex !== -1 && vIndex !== -1 && Number.isFinite(w)) {
      edgeData.push({ u: uIndex, v: vIndex, w })
    }
  }
  
  edges.value = edgeData
  if (edgeData.length === 0) {
    errorMsg.value = '未解析到有效边，请检查：1) 城市名称是否一致；2) 索引是否为1..N且与城市数量匹配；3) 权重是否为数字。'
    return
  }
  errorMsg.value = ''
  showTopology.value = true
  renderTopology()
  // 发送边数据到后端
  await loadTopologyToBackend(cities.value, edgeData)
  // 将边数据持久化，供通信页使用
  try { localStorage.setItem('edges', JSON.stringify(edgeData)) } catch (e) { /* ignore quota */ }
}

// 解析单个CSV，支持同时包含城市与边：
// 行格式支持：
// - 城市: name,lng,lat (第二、三列均为数字)
// - 边(名称): name1,name2,weight
// - 边(索引1-based): u,v,weight 其中u、v为1..N的整数
async function parseCombinedCSV(rows) {
  console.log('🔍 parseCombinedCSV 开始解析，总行数:', rows.length)
  const cityRows = []
  const edgeRows = []
  let edgeTableStarted = false  // 标记是否遇到了边表起始行

  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i].split(/[,;]/).map(col => col.trim())
    if (cols.length < 3) continue
    const [c0, c1, c2] = cols

    // 先检查是否是标题行或特殊标记行
    const header = cols.map(s => s.toLowerCase())
    const isCityHeader = header[0] === 'name' && header[1] === 'lng' && header[2] === 'lat'
    const isEdgeHeader = (header[0] === 'u' || header[0] === 'src') && (header[1] === 'v' || header[1] === 'dst' || header[1] === 'tgt') && (header[2] === 'w' || header[2] === 'weight')
    
    if (i < 15) {
      console.log(`  行${i}: [${cols.join(', ')}] -> 城市标题:${isCityHeader}, 边标题:${isEdgeHeader}, 边区间:${edgeTableStarted}`)
    }
    
    if (isCityHeader) {
      // 城市表头，跳过
      continue
    } else if (isEdgeHeader) {
      // 边表头，标记开始读边
      edgeTableStarted = true
      continue
    }

    // 若已遇到边表标记，后续都作为边处理；否则尝试判断
    if (edgeTableStarted) {
      // 在边表区间内，优先作为边处理
      edgeRows.push(cols)
    } else {
      // 还未遇到边表标记，按类型判断
      const c1Num = Number(c1)
      const c2Num = Number(c2)
      const isCity = !Number.isNaN(c1Num) && !Number.isNaN(c2Num)
      const c2NumForWeight = Number(c2)
      const isEdgeWeightNum = !Number.isNaN(c2NumForWeight)

      if (isCity) {
        // 形如 name, lng, lat 的城市行
        cityRows.push(cols)
      } else if (isEdgeWeightNum) {
        // 可能是边行（如 u,v,w 其中 u、v 为名称或数字，w 为数字）
        // 但若 u、v 都不是数字（且不在城市列表中），则标记为边表开始
        edgeTableStarted = true
        edgeRows.push(cols)
      }
    }
  }

  if (cityRows.length === 0 && edgeRows.length === 0) {
    return false
  }

  // 先解析城市数据
  let parsedCities = []
  if (cityRows.length) {
    parsedCities = cityRows.map(cols => ({ name: cols[0], lng: Number(cols[1]), lat: Number(cols[2]) }))
    cities.value = parsedCities
    // 保存城市数据到localStorage，供其他页面使用
    localStorage.setItem('cities', JSON.stringify(parsedCities))
    console.log('✅ 城市数据解析完成:', parsedCities.length, '个城市')
  }

  // 再解析边数据（需要依赖城市数据）
  let parsedEdges = []
  if (edgeRows.length) {
    const n = cities.value.length
    const isValidIndex = (x) => Number.isFinite(x) && Number.isInteger(x) && x >= 1 && x <= n
    const cityNameToIndex = new Map(cities.value.map((c, i) => [c.name, i]))
    const edgeData = []
    const unmatchedCities = new Set()  // 记录无法匹配的城市名
    
    console.log('🔗 开始解析边数据，边行数:', edgeRows.length)
    console.log('📍 城市名映射:', Array.from(cityNameToIndex.keys()))
    
    for (const cols of edgeRows) {
      const uRaw = cols[0]
      const vRaw = cols[1]
      const w = Number(cols[2])

      let uIndex = cityNameToIndex.has(uRaw) ? cityNameToIndex.get(uRaw) : -1
      let vIndex = cityNameToIndex.has(vRaw) ? cityNameToIndex.get(vRaw) : -1
      
      if (uIndex === -1 && vIndex === -1) {
        const uNum = Number(uRaw)
        const vNum = Number(vRaw)
        if (isValidIndex(uNum) && isValidIndex(vNum)) {
          uIndex = uNum - 1
          vIndex = vNum - 1
        }
      }
      
      if (uIndex !== -1 && vIndex !== -1 && Number.isFinite(w)) {
        edgeData.push({ u: uIndex, v: vIndex, w })
        console.log(`  ✓ 边: ${uRaw}(${uIndex}) -> ${vRaw}(${vIndex}), 权重: ${w}`)
      } else {
        // 记录无法匹配的城市名
        if (uIndex === -1) unmatchedCities.add(uRaw)
        if (vIndex === -1) unmatchedCities.add(vRaw)
        console.warn(`  ✗ 无法匹配边: ${uRaw} -> ${vRaw}`)
      }
    }
    
    parsedEdges = edgeData
    edges.value = edgeData
    
    if (edgeData.length === 0) {
      const unmatchedList = Array.from(unmatchedCities).join(', ')
      const hint = unmatchedCities.size > 0 
        ? `无法匹配的城市名: ${unmatchedList}。请确保城市表中有对应名称（区分大小写）。`
        : '未解析到有效边，请检查名称/索引与城市是否匹配'
      errorMsg.value = hint
      console.error('❌ 边解析失败:', { unmatchedCities: Array.from(unmatchedCities), cityNames: cities.value.map(c => c.name) })
    } else {
      errorMsg.value = ''
      console.log('✅ 边数据解析完成:', edgeData.length, '条边')
      // 持久化边
      try { localStorage.setItem('edges', JSON.stringify(edgeData)) } catch (e) { /* ignore */ }
    }
  }

  // 城市和边数据都解析完成后，统一发送到后端并渲染
  console.log('📊 解析完成 - 城市行:', cityRows.length, '边行:', edgeRows.length)
  console.log('📊 解析结果 - 城市:', parsedCities.length, '边:', parsedEdges.length)
  
  if (parsedCities.length > 0) {
    console.log('📤 发送拓扑数据到后端 - 城市:', parsedCities.length, '边:', parsedEdges.length)
    await loadTopologyToBackend(parsedCities, parsedEdges)
    renderMarkers()
  }
  
  if (parsedEdges.length > 0) {
    showTopology.value = true
    renderTopology()
  }

  console.log('✅ parseCombinedCSV 完成，返回 true')
  return true
}

// 加载拓扑数据到后端
async function loadTopologyToBackend(citiesData, edgesData) {
  try {
    const response = await fetch('http://localhost:8001/topology', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cities: citiesData,
        edges: edgesData
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      console.log('拓扑数据已加载到后端:', result)
    } else {
      console.error('加载拓扑数据到后端失败:', response.statusText)
    }
  } catch (error) {
    console.error('加载拓扑数据到后端失败:', error)
  }
}

// 自动加载默认数据
async function loadDefaultData() {
  try {
    console.log('🔄 自动加载默认数据: test_medium_10cities.csv')
    // 从 public 目录加载(Vite 会自动处理 public 目录下的静态资源)
    const response = await fetch('/test_medium_10cities.csv')
    if (!response.ok) {
      console.warn('⚠️ 默认数据文件未找到,跳过自动加载')
      return
    }
    const csvText = await response.text()
    console.log('📄 CSV文件读取成功,长度:', csvText.length)
    console.log('📄 CSV前200字符:', csvText.substring(0, 200))
    
    // 解析 CSV 文本（使用与 onCsvChange 相同的逻辑）
    const rows = csvText.trim().split(/\r?\n/).filter(Boolean)
    console.log('📊 CSV行数:', rows.length)
    console.log('📊 前5行:', rows.slice(0, 5))
    console.log('📊 第10-15行:', rows.slice(10, 15))
    
    // 尝试识别：优先支持「城市+边」混合单文件；否则回退到单独城市/边表
    const parseResult = await parseCombinedCSV(rows)
    console.log('🔍 parseCombinedCSV 返回:', parseResult)
    
    if (!parseResult) {
      console.warn('⚠️ parseCombinedCSV 返回 false，尝试其他解析方式')
      const firstRow = rows[0].split(/[,;]/).map(col => col.trim())
      if (firstRow.length === 3 && !Number.isNaN(Number(firstRow[1])) && !Number.isNaN(Number(firstRow[2]))) {
        await parseCitiesCSV(rows)
      } else if (firstRow.length === 3 && !Number.isNaN(Number(firstRow[2]))) {
        await parseEdgesCSV(rows)
      } else {
        console.error('❌ 无法识别CSV文件格式')
        errorMsg.value = '无法识别CSV文件格式'
      }
    }
    console.log('✅ 默认数据加载完成 - 城市数:', cities.value.length, '边数:', edges.value.length)
  } catch (error) {
    console.error('❌ 自动加载默认数据失败:', error)
    console.error('错误堆栈:', error.stack)
  }
}

onMounted(async () => {
  await initMap()
  // 地图初始化完成后，自动加载默认数据
  await loadDefaultData()
})
onUnmounted(() => {
  if (map) {
    clearMarkers()
  }
})
</script>

<template>
  <div class="page">
    <div class="header">
      <h2>城市地图叠加</h2>
      <p class="muted">上传城市经纬度CSV文件，在地图上标注城市位置</p>
    </div>

    <div class="panel card toolbar">
      <div class="toolbar-stack">
        <div class="top-center">
          <input id="file-input" class="file-hidden" type="file" accept=".csv,.txt" @change="onCsvChange" />
          <label for="file-input" class="btn primary upload-btn">选择CSV文件</label>
          <span v-if="cities.length" class="muted counter">已加载 {{ cities.length }} 个城市</span>
        </div>
        <div class="below-grid" v-if="cities.length > 0">
          <button class="btn ghost" @click="toggleTopology">
            {{ showTopology ? '隐藏' : '显示' }}网络拓扑
          </button>
          <button class="btn primary" @click="computeMST" :disabled="edges.length === 0">
            计算最小生成树
          </button>
        </div>
      </div>

      <div class="row actions meta" v-if="showMST">
        <span class="muted">总造价: {{ totalCost === Infinity ? '不可连通' : totalCost }}</span>
      </div>
    </div>

    <div class="map-container card">
      <div v-if="isLoading" class="loading">地图加载中...</div>
      <div v-if="errorMsg" class="error">{{ errorMsg }}</div>
      <div ref="mapEl" class="map"></div>
    </div>
  </div>
</template>

<style scoped>
.page { display: grid; gap: 16px; }
.header { text-align: center; position: relative; padding-bottom: 8px; }
.header h2 { margin: 0; font-size: 24px; }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.file-hidden { display: none; }
.upload-btn { cursor: pointer; }
.map-container { position: relative; height: 600px; }
.map { width: 100%; height: 100%; min-height: 600px; }
.loading, .error { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(255,255,255,0.9); z-index: 10; }
.error { color: #dc2626; font-weight: 600; }

/* 顶部工具条美化与居中 */
.toolbar { padding: 20px; }
.toolbar-row { justify-content: center; gap: 20px; }
.toolbar .btn { padding: 10px 16px; border-radius: 10px; }
.toolbar .btn.ghost { background: #f1f5f9; color: #0f172a; border: 1px solid #e2e8f0; }
.toolbar .btn.ghost:hover { background: #e2e8f0; }
.toolbar .btn.primary { background: #3b82f6; box-shadow: 0 2px 8px rgba(59,130,246,0.25); }
.toolbar .btn.primary:disabled { background: #93c5fd; box-shadow: none; cursor: not-allowed; }
.toolbar .counter { font-weight: 600; }

/* 操作按钮区居中 */
.actions { justify-content: center; gap: 20px; flex-wrap: wrap; }

/* 大屏时留出更多间隔，小屏自动换行 */
@media (min-width: 1024px) {
  .toolbar-row { gap: 24px; }
  .actions { gap: 24px; }
}

/* 三列对称布局 */
/* 纵向堆叠 + 下方左右对称 */
.toolbar-stack { display: grid; grid-auto-rows: auto; gap: 14px; }
.top-center { display: flex; align-items: center; justify-content: center; gap: 16px; }
.below-grid { display: flex; justify-content: center; align-items: center; gap: 24px; margin-top: 6px; }

@media (max-width: 640px) {
  .below-grid { grid-template-columns: 1fr; gap: 12px; }
  .below-left, .below-right { justify-content: center; }
}
</style>