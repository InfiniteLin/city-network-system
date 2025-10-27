<script setup>
import { computed, reactive, ref, watch } from 'vue'

// --- State ---
const cityCount = ref(5)
const cityLabels = computed(() => Array.from({ length: cityCount.value }, (_, i) => `C${i + 1}`))
const costMatrix = reactive([])
const isSymmetric = ref(true)
const infinitySymbol = ref('∞')

// Visualization state
const showTopology = ref(false)
const showMST = ref(false)
const totalCost = ref(0)
const animate = ref(false)
const animationIndex = ref(0)
const animationSpeedMs = ref(800)
let animationTimer = null

// Derived edges for render and algorithms
const allEdges = computed(() => {
  const edges = []
  for (let i = 0; i < cityCount.value; i++) {
    for (let j = 0; j < cityCount.value; j++) {
      if (i === j) continue
      const w = numOrInfinity(costMatrix[i]?.[j])
      if (w === Infinity) continue
      if (isSymmetric.value && j <= i) continue
      edges.push({ u: i, v: j, w })
    }
  }
  return edges
})

// MST results and steps
const mstEdges = ref([])
const mstSteps = ref([]) // each step: { edge, accepted: boolean, currentComponents }

// --- Initialization ---
function ensureMatrix(size) {
  while (costMatrix.length < size) {
    costMatrix.push(Array.from({ length: size }, () => Infinity))
  }
  for (let i = 0; i < size; i++) {
    if (!Array.isArray(costMatrix[i])) costMatrix[i] = []
    while (costMatrix[i].length < size) costMatrix[i].push(Infinity)
  }
  // default zero diagonal
  for (let i = 0; i < size; i++) costMatrix[i][i] = 0
}

watch(cityCount, (n) => {
  const size = Math.max(1, Math.min(60, Number(n) || 1))
  cityCount.value = size
  ensureMatrix(size)
  resetResults()
}, { immediate: true })

function resetResults() {
  showTopology.value = false
  showMST.value = false
  totalCost.value = 0
  mstEdges.value = []
  mstSteps.value = []
  stopAnimation()
  animationIndex.value = 0
}

// --- CSV Upload & Parsing ---
// Supported formats:
// 1) Matrix (n x n) with numbers/∞, commas or spaces
// 2) Edge list with headers: u,v,w or a,b,w (city labels or 1-based indices)
const csvInput = ref(null)
function onPickCsv() {
  csvInput.value?.click()
}
async function onCsvChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const text = await file.text()
  try {
    if (!tryParseMatrix(text)) {
      if (!tryParseEdgeList(text)) {
        alert('CSV解析失败：请提供 n×n 矩阵或边表(u,v,w)')
        return
      }
    }
    resetResults()
    showTopology.value = true
  } catch (err) {
    console.error(err)
    alert('CSV解析出错')
  } finally {
    e.target.value = ''
  }
}

function tryParseMatrix(text) {
  // detect rows with multiple values
  const rows = text.trim().split(/\r?\n/).map(r => r.trim()).filter(Boolean)
  if (rows.length === 0) return false
  const splitRow = (r) => r.split(/[;,\s]+/).filter(Boolean)
  const grid = rows.map(splitRow)
  const n = grid[0].length
  if (!grid.every(r => r.length === n)) return false
  if (n < 1 || n > 60) return false
  // fill matrix
  cityCount.value = n
  ensureMatrix(n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const token = grid[i][j]
      costMatrix[i][j] = tokenToWeight(token, i === j)
    }
  }
  // attempt symmetry detection
  isSymmetric.value = isMatrixSymmetric(costMatrix, n)
  return true
}

function tryParseEdgeList(text) {
  // Expect lines of 3 tokens: u,v,w; headers allowed
  const lines = text.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return false
  const splitRow = (r) => r.split(/[;,\s]+/).filter(Boolean)
  const rows = lines.map(splitRow)
  // optional header check
  let start = 0
  if (rows[0].length >= 3 && isNaN(Number(rows[0][2]))) start = 1
  const labelToIndex = new Map()
  const edges = []
  function getIndex(label) {
    // accept C1..Cn or 1..n
    let key = label
    if (/^C\d+$/i.test(label)) key = label.replace(/^C/i, '')
    const idx1 = Number(key)
    if (!Number.isFinite(idx1)) {
      // create map for arbitrary label
      if (!labelToIndex.has(label)) labelToIndex.set(label, labelToIndex.size + 1)
      return labelToIndex.get(label)
    }
    return idx1
  }
  for (let i = start; i < rows.length; i++) {
    const r = rows[i]
    if (r.length < 3) return false
    const ui = getIndex(r[0])
    const vi = getIndex(r[1])
    const w = Number(r[2])
    if (!Number.isFinite(ui) || !Number.isFinite(vi) || !Number.isFinite(w)) return false
    edges.push({ u: ui - 1, v: vi - 1, w })
  }
  const n = Math.max(
    ...edges.flatMap(e => [e.u + 1, e.v + 1])
  )
  if (!Number.isFinite(n) || n < 1 || n > 60) return false
  cityCount.value = n
  ensureMatrix(n)
  // initialize with Infinity
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) costMatrix[i][j] = i === j ? 0 : Infinity
  }
  for (const { u, v, w } of edges) {
    costMatrix[u][v] = Math.min(numOrInfinity(costMatrix[u][v]), w)
    costMatrix[v][u] = Math.min(numOrInfinity(costMatrix[v][u]), w)
  }
  isSymmetric.value = true
  return true
}

function tokenToWeight(token, isDiagonal) {
  const t = (token ?? '').toString().trim()
  if (!t || t === '-' || t === infinitySymbol.value) return isDiagonal ? 0 : Infinity
  const n = Number(t)
  return Number.isFinite(n) ? n : Infinity
}
function numOrInfinity(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : Infinity
}
function isMatrixSymmetric(m, n) {
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (numOrInfinity(m[i][j]) !== numOrInfinity(m[j][i])) return false
    }
  }
  return true
}

// --- Manual matrix helpers ---
function onMatrixInput(i, j, val) {
  const n = Number(val)
  if (val === '' || val === infinitySymbol.value) {
    costMatrix[i][j] = i === j ? 0 : Infinity
  } else if (Number.isFinite(n)) {
    costMatrix[i][j] = i === j ? 0 : Math.max(0, n)
  }
  if (isSymmetric.value && i !== j) {
    costMatrix[j][i] = costMatrix[i][j]
  }
  resetResults()
}

// --- Algorithms: Kruskal MST with steps ---
function computeMST() {
  const n = cityCount.value
  const edges = [...allEdges.value].sort((a, b) => a.w - b.w)
  const parent = Array.from({ length: n }, (_, i) => i)
  const rank = Array.from({ length: n }, () => 0)
  function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])) }
  function union(x, y) {
    x = find(x); y = find(y)
    if (x === y) return false
    if (rank[x] < rank[y]) [x, y] = [y, x]
    parent[y] = x
    if (rank[x] === rank[y]) rank[x]++
    return true
  }
  mstEdges.value = []
  mstSteps.value = []
  let cost = 0
  for (const e of edges) {
    const accepted = union(e.u, e.v)
    if (accepted) {
      mstEdges.value.push(e)
      cost += e.w
    }
    mstSteps.value.push({ edge: e, accepted, snapshot: [...parent] })
    if (mstEdges.value.length === n - 1) break
  }
  totalCost.value = mstEdges.value.length === n - 1 ? cost : Infinity
  showMST.value = true
  showTopology.value = true
  // reset animation
  stopAnimation()
  animationIndex.value = 0
}

// --- Animation controls ---
const canAnimate = computed(() => mstSteps.value.length > 0)
const currentStep = computed(() => mstSteps.value[animationIndex.value] ?? null)

function startAnimation() {
  if (!canAnimate.value) return
  animate.value = true
  // restart from the beginning and hide final MST highlighting while animating
  animationIndex.value = 0
  scheduleNextStep()
}
function stopAnimation() {
  animate.value = false
  if (animationTimer) {
    clearTimeout(animationTimer)
    animationTimer = null
  }
}
function resetAnimation() {
  stopAnimation()
  animationIndex.value = 0
}
function toggleAnimation() {
  if (!animate.value) startAnimation(); else stopAnimation()
}
function scheduleNextStep() {
  if (!animate.value) return
  const delay = Math.max(120, Number(animationSpeedMs.value) || 800)
  animationTimer = setTimeout(() => {
    if (animationIndex.value >= mstSteps.value.length - 1) {
      stopAnimation()
      return
    }
    animationIndex.value++
    scheduleNextStep()
  }, delay)
}
function stepPrev() {
  animationIndex.value = Math.max(0, animationIndex.value - 1)
}
function stepNext() {
  animationIndex.value = Math.min(mstSteps.value.length - 1, animationIndex.value + 1)
}

// --- Node positions (circle layout) ---
const viewBox = '0 0 800 520'
const center = { x: 400, y: 260 }
const radius = 200
const nodePositions = computed(() => {
  const n = cityCount.value
  const pos = []
  for (let i = 0; i < n; i++) {
    const theta = (2 * Math.PI * i) / n
    pos.push({ x: center.x + radius * Math.cos(theta), y: center.y + radius * Math.sin(theta) })
  }
  return pos
})

// helpers for rendering state based on current step
function edgeKey(e) { return `${e.u}-${e.v}` }
const mstEdgeSet = computed(() => new Set(mstEdges.value.map(edgeKey)))
const acceptedSetAtStep = computed(() => {
  const set = new Set()
  for (let i = 0; i <= animationIndex.value && i < mstSteps.value.length; i++) {
    const s = mstSteps.value[i]
    if (s.accepted) set.add(edgeKey(s.edge))
  }
  return set
})

function isEdgeHighlighted(e) {
  if (!animate.value) return mstEdgeSet.value.has(edgeKey(e))
  const step = currentStep.value
  if (!step) return false
  // highlight currently considered edge
  if (edgeKey(step.edge) === edgeKey(e)) return true
  // also keep accepted ones so far
  return acceptedSetAtStep.value.has(edgeKey(e))
}

// render edge weight label position
function midPoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }

function displayWeight(v, i, j) {
  const n = Number(v)
  if (!Number.isFinite(n)) return i === j ? 0 : infinitySymbol.value
  return n
}

// Actions
function renderTopology() {
  showTopology.value = true
}
</script>

<template>
  <div class="page">
    <div class="header">
      <h2>通信网络设计</h2>
      <p class="muted">配置城市及造价，上传CSV或手动编辑矩阵，计算并可视化最小生成树</p>
    </div>

    <div class="panel card">
      <div class="row">
        <label>城市数目</label>
        <input class="field" type="number" min="1" max="60" v-model.number="cityCount" />
        <label><input type="checkbox" v-model="isSymmetric" /> 无向(对称)网络</label>
        <label>无边标记</label>
        <input class="field short" v-model="infinitySymbol" />
        <button class="btn" @click="renderTopology">生成拓扑</button>
        <button class="btn primary" @click="computeMST">计算最小生成树</button>
      </div>

      <div class="row">
        <button class="btn" @click="onPickCsv">上传CSV</button>
        <input ref="csvInput" type="file" accept=".csv,.txt" @change="onCsvChange" style="display:none" />
        <span class="hint muted">支持矩阵或边表(u,v,w)，分隔符可用逗号/分号/空格</span>
      </div>
    </div>

    <div class="matrix-wrap card centered">
      <div class="matrix-scroll">
        <table class="matrix">
          <thead>
            <tr>
              <th></th>
              <th v-for="(lbl,j) in cityLabels" :key="j">{{ lbl }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row,i) in cityLabels" :key="i">
              <th>{{ cityLabels[i] }}</th>
              <td v-for="(col,j) in cityLabels" :key="j">
                <input
                  class="field"
                  :disabled="i===j"
                  :value="displayWeight(costMatrix[i]?.[j], i, j)"
                  @input="(e)=>onMatrixInput(i,j,e.target.value)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="viz-panel" v-if="showTopology">
      <div class="viz-toolbar">
        <div class="left" v-if="showMST">
          <span>总造价：</span>
          <strong>{{ totalCost === Infinity ? '不可连通' : totalCost }}</strong>
        </div>
        <div class="right" v-if="mstSteps.length">
          <button class="btn primary" @click="toggleAnimation">{{ animate ? '暂停演示' : '开始动态演示' }}</button>
          <label class="muted">速度(ms)
            <input class="field speed" type="number" min="120" step="40" v-model.number="animationSpeedMs" @change="animate && (stopAnimation(), startAnimation())" />
          </label>
          <button class="btn" @click="stepPrev" :disabled="!mstSteps.length">上一步</button>
          <button class="btn" @click="stepNext" :disabled="!mstSteps.length">下一步</button>
          <button class="btn" @click="resetAnimation" :disabled="!mstSteps.length">重置演示</button>
        </div>
      </div>
      <div class="step-info" v-if="mstSteps.length">
        <span class="muted">步骤 {{ Math.min(animationIndex + 1, mstSteps.length) }} / {{ mstSteps.length }}：</span>
        <span>
          候选 {{ cityLabels[currentStep?.edge?.u] }}–{{ cityLabels[currentStep?.edge?.v] }} (w={{ currentStep?.edge?.w }})，
          <strong :class="currentStep?.accepted ? 'ok' : 'no'">{{ currentStep?.accepted ? '选中' : '丢弃' }}</strong>
        </span>
      </div>

      <div class="viz-grid">
        <svg :viewBox="viewBox" class="viz card centered">
          <!-- draw all edges -->
          <g>
            <g v-for="e in allEdges" :key="`${e.u}-${e.v}`">
              <line
                :x1="nodePositions[e.u].x" :y1="nodePositions[e.u].y"
                :x2="nodePositions[e.v].x" :y2="nodePositions[e.v].y"
                :class="['edge', { active: isEdgeHighlighted(e), mst: showMST && !animate && mstEdgeSet.has(edgeKey(e)), 'mst-progress': animate && acceptedSetAtStep.has(edgeKey(e)), consider: animate && currentStep && edgeKey(currentStep.edge) === edgeKey(e) }]"
              />
              <text class="weight" :x="midPoint(nodePositions[e.u], nodePositions[e.v]).x" :y="midPoint(nodePositions[e.u], nodePositions[e.v]).y">
                {{ e.w }}
              </text>
            </g>
          </g>
          <!-- nodes -->
          <g>
            <g v-for="(pos, i) in nodePositions" :key="i">
              <circle class="node" :cx="pos.x" :cy="pos.y" r="18" />
              <text class="label" :x="pos.x" :y="pos.y">{{ cityLabels[i] }}</text>
            </g>
          </g>
        </svg>
        <div class="steps card">
          <div class="steps-title">Kruskal 过程</div>
          <div class="steps-scroll">
            <div
              v-for="(s, idx) in mstSteps"
              :key="idx"
              :class="['step-row', { current: idx === animationIndex, accepted: s.accepted }]"
            >
              <span class="dot"></span>
              <span class="step-text">{{ cityLabels[s.edge.u] }}–{{ cityLabels[s.edge.v] }} (w={{ s.edge.w }})</span>
              <span class="tag" :class="s.accepted ? 'ok' : 'no'">{{ s.accepted ? '选中' : '丢弃' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display: grid; gap: 16px; }
.header { text-align: center; }
.header h2 { margin: 0; font-size: 24px; letter-spacing: .5px; }
.header .muted { margin-top: 6px; }
.header { position: relative; padding-bottom: 8px; }
.header:after { content: ""; display: block; height: 3px; width: 120px; margin: 12px auto 0; border-radius: 999px; background: linear-gradient(90deg, var(--accent), var(--primary)); opacity: .7; }
.panel { display: grid; gap: 8px; padding: 12px; border-radius: 12px; }
.row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
label { color: var(--text); opacity: .9; }
.hint { color: var(--muted); }

.matrix-wrap { overflow: hidden; border-radius: 12px; }
.matrix-scroll { overflow: auto; max-height: 320px; }
.matrix { border-collapse: separate; border-spacing: 0; min-width: 520px; }
.matrix th, .matrix td { border: 1px solid var(--stroke); padding: 4px; text-align: center; background: var(--panel); position: relative; }
.matrix thead th { position: sticky; top: 0; background: #f3f4f6; z-index: 1; }
.matrix tbody th { position: sticky; left: 0; background: #f3f4f6; z-index: 1; }
.matrix input { width: 64px; }

.viz-panel { display: grid; gap: 8px; }
.viz-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.viz { width: 100%; height: 520px; border-radius: 12px; }
.centered { margin: 0 auto; }
.node { fill: var(--accent); }
.label { fill: #001018; dominant-baseline: middle; text-anchor: middle; font-weight: 900; font-size: 12px; }
.edge { stroke: #2b374a; stroke-width: 2; }
.edge.active { stroke: var(--primary); stroke-width: 3; }
.edge.consider { stroke: #f59e0b; stroke-width: 3; stroke-dasharray: 8 6; animation: dash 1s linear infinite; }
@keyframes dash { to { stroke-dashoffset: -28; } }
.weight { fill: #1f2937; font-size: 14px; font-weight: 600; user-select: none; paint-order: stroke; stroke: #ffffff; stroke-width: 3px; }
.speed { width: 96px; }
.edge.mst { stroke: #ef4444; stroke-width: 3.5; }
.edge.mst-progress { stroke: #ef4444; stroke-width: 3.5; opacity: .9; }

.viz-grid { display: grid; grid-template-columns: 1fr 320px; gap: 16px; align-items: start; }
.steps { padding: 12px; border-radius: 12px; }
.steps-title { font-weight: 700; margin-bottom: 8px; }
.steps-scroll { max-height: 480px; overflow: auto; display: grid; gap: 6px; }
.step-row { display: grid; grid-template-columns: 14px 1fr auto; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--stroke); border-radius: 10px; background: var(--panel); }
.step-row.current { border-color: #bfecff; box-shadow: 0 0 0 3px rgba(14,165,233,.15); }
.step-row.accepted { background: #fff; }
.dot { width: 10px; height: 10px; border-radius: 999px; background: #cbd5e1; }
.step-row.accepted .dot { background: #ef4444; }
.tag { padding: 2px 6px; border-radius: 999px; font-size: 12px; border: 1px solid var(--stroke); }
.tag.ok { background: #fee2e2; border-color: #fecaca; color: #b91c1c; }
.tag.no { background: #f3f4f6; color: #334155; }
</style>


