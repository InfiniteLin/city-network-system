/**
 * 高德地图管理服务
 * 封装地图初始化和操作逻辑
 */

const AMAP_KEY = 'f0d1e40d79a2157f20c4b3cb5fc43579'

/**
 * 加载高德地图 JS SDK
 */
export async function loadAmapJs() {
  return new Promise((resolve, reject) => {
    // 如果已经加载，直接返回
    if (window.AMap) {
      console.log('✅ 高德地图 API 已加载')
      return resolve()
    }
    
    // 检查是否正在加载
    if (document.querySelector('script[src*="webapi.amap.com"]')) {
      console.log('⏳ 高德地图 API 正在加载中，等待完成...')
      const checkInterval = setInterval(() => {
        if (window.AMap) {
          clearInterval(checkInterval)
          console.log('✅ 高德地图 API 加载完成')
          resolve()
        }
      }, 100)
      
      setTimeout(() => {
        clearInterval(checkInterval)
        if (!window.AMap) {
          reject(new Error('高德地图加载超时'))
        }
      }, 10000)
      return
    }
    
    console.log('📥 开始加载高德地图 API...')
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=1.4.15&key=${AMAP_KEY}&plugin=AMap.Scale,AMap.ToolBar`
    script.async = true
    script.onload = () => {
      console.log('✅ 高德地图 API 加载成功')
      resolve()
    }
    script.onerror = (e) => {
      console.error('❌ 高德地图 API 加载失败:', e)
      reject(new Error('高德地图 API 加载失败，请检查网络连接'))
    }
    document.head.appendChild(script)
  })
}

/**
 * 创建地图实例
 */
export function createMap(container, options = {}) {
  if (!window.AMap) {
    throw new Error('高德地图 API 未加载')
  }
  
  const defaultOptions = {
    zoom: 5,
    center: [108.5525, 34.3227],
    viewMode: '2D',
    mapStyle: 'amap://styles/blue'
  }
  
  return new window.AMap.Map(container, { ...defaultOptions, ...options })
}

/**
 * 创建城市标记
 */
export function createCityMarker(city, isOnline = false) {
  if (!window.AMap) return null
  
  const color = isOnline ? '#22c55e' : '#94a3b8'
  const pulseClass = isOnline ? 'pulse-marker' : ''
  
  const marker = new window.AMap.Marker({
    position: new window.AMap.LngLat(Number(city.lng), Number(city.lat)),
    title: city.name,
    content: `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translate(-50%, -100%);
      ">
        <div class="${pulseClass}" style="
          width: 16px;
          height: 16px;
          background: ${color};
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          margin-bottom: 4px;
        "></div>
        <div style="
          background: white;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: 600;
          color: #334155;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          white-space: nowrap;
        ">${city.name}</div>
      </div>
    `
  })
  
  return marker
}

/**
 * 创建连接线
 */
export function createPolyline(fromCity, toCity, options = {}) {
  if (!window.AMap) return null
  
  const defaultOptions = {
    strokeColor: '#0ea5e9',
    strokeWeight: 2,
    strokeOpacity: 0.6,
    strokeStyle: 'solid'
  }
  
  const line = new window.AMap.Polyline({
    path: [
      new window.AMap.LngLat(Number(fromCity.lng), Number(fromCity.lat)),
      new window.AMap.LngLat(Number(toCity.lng), Number(toCity.lat))
    ],
    ...defaultOptions,
    ...options
  })
  
  return line
}

export default {
  loadAmapJs,
  createMap,
  createCityMarker,
  createPolyline
}
