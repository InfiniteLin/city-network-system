/**
 * 地图管理服务
 * 负责高德地图初始化、城市标记、MST连线绘制
 */

const AMAP_KEY = 'f0d1e40d79a2157f20c4b3cb5fc43579'

export class MapManager {
  constructor() {
    this.mapInstance = null
    this.cityMarkers = {}
    this.mstLines = []
  }

  /**
   * 加载高德地图 JS SDK
   */
  async loadAmapJs() {
    return new Promise((resolve, reject) => {
      if (window.AMap) {
        console.log('✅ 高德地图 API 已加载')
        return resolve()
      }
      
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
   * 初始化地图实例
   */
  async initMap(container) {
    if (!container) {
      throw new Error('地图容器未找到')
    }

    await this.loadAmapJs()
    await new Promise(resolve => setTimeout(resolve, 300))

    console.log('🗺️ 初始化地图实例...')
    this.mapInstance = new window.AMap.Map(container, {
      zoom: 5,
      center: [108.5525, 34.3227],
      viewMode: '2D',
      mapStyle: 'amap://styles/blue'
    })

    console.log('✅ 地图初始化成功')
    return this.mapInstance
  }

  /**
   * 创建城市标记内容
   */
  createCityMarkerContent(cityName, isOnline) {
    const color = isOnline ? '#22c55e' : '#94a3b8'
    const pulseClass = isOnline ? 'pulse-marker' : ''
    return `
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
        ">${cityName}</div>
      </div>
    `
  }

  /**
   * 绘制城市标记
   */
  drawCities(cities, onClickCallback) {
    if (!this.mapInstance || !window.AMap) {
      console.error('❌ 地图实例不存在，无法绘制')
      return
    }
    
    if (!cities || cities.length === 0) {
      console.warn('⚠️ 没有城市数据，跳过绘制')
      return
    }

    console.log(`🎨 开始绘制 ${cities.length} 个城市...`)
    
    cities.forEach(city => {
      try {
        const marker = new window.AMap.Marker({
          position: new window.AMap.LngLat(Number(city.lng), Number(city.lat)),
          title: city.name,
          content: this.createCityMarkerContent(city.name, false)
        })

        if (onClickCallback) {
          marker.on('click', () => onClickCallback(city))
        }

        marker.setMap(this.mapInstance)
        this.cityMarkers[city.name] = marker
      } catch (e) {
        console.error(`❌ 绘制城市 ${city.name} 失败:`, e)
      }
    })
    
    console.log(`✅ 成功绘制 ${Object.keys(this.cityMarkers).length} 个城市标记`)
  }

  /**
   * 更新城市标记状态
   */
  updateCityMarkers(cities, onlineCities) {
    cities.forEach(city => {
      const marker = this.cityMarkers[city.name]
      if (marker) {
        const isOnline = onlineCities.includes(city.name)
        marker.setContent(this.createCityMarkerContent(city.name, isOnline))
      }
    })
  }

  /**
   * 绘制 MST 连线
   */
  drawMSTLines(cities, edges) {
    console.log('🔵 drawMSTLines 被调用', {
      edges数量: edges?.length || 0,
      cities数量: cities?.length || 0,
      hasAMap: !!window.AMap,
      hasMapInstance: !!this.mapInstance
    })

    if (!window.AMap || !this.mapInstance) {
      console.warn('⚠️ 地图未初始化，跳过绘制')
      return
    }

    if (!edges || edges.length === 0) {
      console.warn('⚠️ 没有边数据，跳过绘制')
      return
    }

    console.log(`🎨 开始绘制 ${edges.length} 条 MST 边`)

    // 清除旧的MST线条
    if (this.mstLines && this.mstLines.length > 0) {
      console.log(`🧹 清除旧的 ${this.mstLines.length} 条线条`)
      this.mstLines.forEach(line => {
        if (line && line.setMap) {
          try {
            line.setMap(null)
          } catch (e) {
            console.warn('清除线条失败:', e)
          }
        }
      })
    }
    this.mstLines = []

    // 绘制新线条
    let successCount = 0
    edges.forEach((edge, index) => {
      const city1 = cities[edge.u]
      const city2 = cities[edge.v]
      
      if (!city1 || !city2) {
        console.warn(`⚠️ 边 ${index} 的城市索引无效: u=${edge.u}, v=${edge.v}`)
        return
      }

      if (!city1.lng || !city1.lat || !city2.lng || !city2.lat) {
        console.warn(`⚠️ 城市坐标缺失: ${city1.name}(${city1.lng},${city1.lat}) -> ${city2.name}(${city2.lng},${city2.lat})`)
        return
      }

      try {
        const line = new window.AMap.Polyline({
          path: [
            new window.AMap.LngLat(Number(city1.lng), Number(city1.lat)),
            new window.AMap.LngLat(Number(city2.lng), Number(city2.lat))
          ],
          strokeColor: '#0ea5e9',
          strokeWeight: 2,
          strokeOpacity: 0.6,
          strokeStyle: 'solid',
          geodesic: false,  // 使用直线而非大圆航线
          zIndex: 10
        })
        
        line.setMap(this.mapInstance)
        this.mstLines.push(line)
        successCount++
      } catch (e) {
        console.error(`❌ 绘制 ${city1.name} -> ${city2.name} 连线失败:`, e)
      }
    })
    
    console.log(`✅ 成功绘制 ${successCount}/${edges.length} 条 MST 线条，总计 ${this.mstLines.length} 条线在地图上`)
  }

  /**
   * 清理地图资源
   */
  destroy() {
    if (this.mstLines) {
      this.mstLines.forEach(line => {
        if (line && line.setMap) {
          line.setMap(null)
        }
      })
      this.mstLines = []
    }

    Object.values(this.cityMarkers).forEach(marker => {
      if (marker && marker.setMap) {
        marker.setMap(null)
      }
    })
    this.cityMarkers = {}

    if (this.mapInstance) {
      this.mapInstance.destroy()
      this.mapInstance = null
    }
  }

  /**
   * 获取地图实例
   */
  getMapInstance() {
    return this.mapInstance
  }
}

export default MapManager
