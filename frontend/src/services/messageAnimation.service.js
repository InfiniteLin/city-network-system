/**
 * 消息动画服务
 * 负责在地图上绘制消息传输动画，支持沿MST路径移动
 */

export class MessageAnimator {
  constructor(mapInstance, edges = []) {
    this.mapInstance = mapInstance
    this.activeAnimations = []
    this.edges = edges // MST边数据
    this.mstGraph = null // MST图结构
  }

  /**
   * 更新地图实例
   */
  setMapInstance(mapInstance) {
    this.mapInstance = mapInstance
  }

  /**
   * 更新MST边数据并构建图
   */
  setEdges(edges, cities) {
    this.edges = edges
    this.buildMSTGraph(cities)
  }

  /**
   * 构建MST图结构（邻接表）
   */
  buildMSTGraph(cities) {
    if (!this.edges || this.edges.length === 0 || !cities || cities.length === 0) {
      console.warn('[动画] 无法构建MST图：缺少边或城市数据')
      this.mstGraph = null
      return
    }

    // 创建城市名称到索引的映射
    const cityNameToIndex = new Map()
    cities.forEach((city, index) => {
      cityNameToIndex.set(city.name, index)
    })

    // 构建邻接表
    const graph = new Map()
    cities.forEach((city, index) => {
      graph.set(index, [])
    })

    // 添加边（无向图）
    this.edges.forEach(edge => {
      const u = edge.u
      const v = edge.v
      if (graph.has(u) && graph.has(v)) {
        graph.get(u).push(v)
        graph.get(v).push(u)
      }
    })

    this.mstGraph = { graph, cityNameToIndex, cities }
    console.log('[动画] MST图构建完成，节点数:', cities.length, '边数:', this.edges.length)
  }

  /**
   * 使用BFS查找MST中两个城市之间的路径
   */
  findMSTPath(fromCityName, toCityName) {
    if (!this.mstGraph) {
      console.warn('[动画] MST图未构建，使用直线路径')
      return null
    }

    const { graph, cityNameToIndex, cities } = this.mstGraph
    const startIdx = cityNameToIndex.get(fromCityName)
    const endIdx = cityNameToIndex.get(toCityName)

    if (startIdx === undefined || endIdx === undefined) {
      console.warn('[动画] 找不到城市索引:', fromCityName, toCityName)
      return null
    }

    if (startIdx === endIdx) {
      return [cities[startIdx]]
    }

    // BFS查找路径
    const queue = [[startIdx]]
    const visited = new Set([startIdx])

    while (queue.length > 0) {
      const path = queue.shift()
      const current = path[path.length - 1]

      if (current === endIdx) {
        // 找到路径，返回城市对象数组
        return path.map(idx => cities[idx])
      }

      const neighbors = graph.get(current) || []
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push([...path, neighbor])
        }
      }
    }

    console.warn('[动画] 未找到MST路径:', fromCityName, '→', toCityName)
    return null
  }

  /**
   * 创建消息动画
   */
  animateMessage(message, cities, onlineCities) {
    if (!window.AMap || !this.mapInstance) {
      console.log('[动画] 地图未准备好，跳过动画')
      return
    }
    
    const fromCity = cities.find(c => c.name === message.from)
    if (!fromCity) {
      console.log('[动画] 找不到发送城市:', message.from)
      return
    }

    // 如果是广播消息（to: '全体'），向所有在线城市发送动画
    if (message.to === '全体') {
      console.log('[动画] 广播消息动画:', message.from, '→ 全体，在线城市数:', onlineCities.length)
      const targetCities = onlineCities.filter(cityName => 
        cityName !== message.from && cityName !== 'Monitor_Admin'
      )
      console.log('[动画] 目标城市:', targetCities)
      
      targetCities.forEach(cityName => {
        const toCity = cities.find(c => c.name === cityName)
        if (toCity) {
          this.createMessageAnimation(fromCity, toCity, message.type, cities, message.route)
        } else {
          console.log('[动画] 在线城市找不到坐标:', cityName)
        }
      })
      return
    }

    // 点对点消息
    const toCity = cities.find(c => c.name === message.to)
    if (!toCity) {
      console.log('[动画] 找不到接收城市:', message.to)
      return
    }

    console.log('[动画] 点对点消息动画:', message.from, '→', message.to)
    console.log('[动画] 后端提供的路由:', message.route)
    this.createMessageAnimation(fromCity, toCity, message.type, cities, message.route)
  }

  /**
   * 创建单个消息动画（沿MST路径）
   * @param {Object} fromCity - 发送城市
   * @param {Object} toCity - 接收城市
   * @param {String} messageType - 消息类型 ('encrypted' 或 'normal')
   * @param {Array} cities - 所有城市数据
   * @param {Array} routeNames - 后端提供的路由城市名称数组（可选）
   */
  createMessageAnimation(fromCity, toCity, messageType, cities, routeNames = null) {
    if (!window.AMap || !this.mapInstance) return

    let path = null
    
    // 优先使用后端提供的路由（加密消息会有）
    if (routeNames && routeNames.length > 0) {
      console.log('[动画] 使用后端路由:', routeNames.join(' → '))
      path = routeNames.map(name => cities.find(c => c.name === name)).filter(c => c)
      
      // 验证路径是否完整
      if (path.length !== routeNames.length) {
        console.warn('[动画] 部分路由城市找不到坐标，缺失:', 
          routeNames.filter(name => !cities.find(c => c.name === name))
        )
      }
    }
    
    // 如果没有后端路由，使用BFS查找MST路径
    if (!path || path.length === 0) {
      console.log('[动画] 后端未提供路由，使用BFS查找MST路径')
      path = this.findMSTPath(fromCity.name, toCity.name)
      
      if (!path || path.length === 0) {
        // 如果找不到MST路径，使用直线
        console.warn('[动画] BFS未找到路径，使用直线')
        this.createDirectAnimation(fromCity, toCity, messageType)
        return
      }
    }

    console.log('[动画] 最终路径:', path.map(c => c.name).join(' → '))

    const color = messageType === 'encrypted' ? '#8b5cf6' : '#0ea5e9'
    const glowColor = messageType === 'encrypted' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(14, 165, 233, 0.4)'
    
    // 创建完整路径的线条
    const pathCoords = path.map(city => 
      new window.AMap.LngLat(Number(city.lng), Number(city.lat))
    )
    
    const messageLine = new window.AMap.Polyline({
      path: pathCoords,
      strokeColor: color,
      strokeWeight: 4,
      strokeOpacity: 0.8,
      strokeStyle: 'solid',
      geodesic: false,  // 关键：使用直线而非大圆航线
      zIndex: 100
    })
    
    messageLine.setMap(this.mapInstance)
    
    // 创建发光背景线条
    const glowLine = new window.AMap.Polyline({
      path: pathCoords,
      strokeColor: color,
      strokeWeight: 12,
      strokeOpacity: 0.3,
      strokeStyle: 'solid',
      geodesic: false,  // 关键：使用直线而非大圆航线
      zIndex: 99
    })
    
    glowLine.setMap(this.mapInstance)
    
    // 点对点消息只创建1个粒子，广播消息可以有多个
    const particleCount = 1  // 修改：只创建一个消息球
    const particleDelay = 150
    
    for (let i = 0; i < particleCount; i++) {
      setTimeout(() => {
        this.createPathParticle(path, color, glowColor, i)
      }, i * particleDelay)
    }
    
    // 路径闪烁动画
    let lineOpacity = 0.8
    let lineDirection = -1
    const lineInterval = setInterval(() => {
      lineOpacity += lineDirection * 0.1
      if (lineOpacity <= 0.3) {
        lineOpacity = 0.3
        lineDirection = 1
      } else if (lineOpacity >= 0.8) {
        lineOpacity = 0.8
        lineDirection = -1
      }
      if (messageLine && messageLine.setOptions) {
        messageLine.setOptions({ strokeOpacity: lineOpacity })
      }
    }, 100)
    
    // 清理动画
    const duration = 2500 + (path.length - 1) * 500 // 路径越长，持续时间越长
    setTimeout(() => {
      clearInterval(lineInterval)
      
      // 淡出效果
      let fadeOpacity = 0.8
      const fadeInterval = setInterval(() => {
        fadeOpacity -= 0.1
        if (fadeOpacity <= 0) {
          clearInterval(fadeInterval)
          messageLine.setMap(null)
          glowLine.setMap(null)
        } else {
          messageLine.setOptions({ strokeOpacity: fadeOpacity })
          glowLine.setOptions({ strokeOpacity: fadeOpacity * 0.3 })
        }
      }, 50)
    }, duration)
  }

  /**
   * 创建沿路径移动的粒子（调试版本）
   */
  createPathParticle(path, color, glowColor, index) {
    if (!window.AMap || !this.mapInstance || path.length < 2) return
    
    const size = 14 - index * 2
    
    console.log('[粒子] 创建粒子，路径:', path.map(c => `${c.name}(${c.lng},${c.lat})`).join(' → '))
    
    // 创建粒子标记 - 移除 offset，使用 position 居中
    const particleMarker = new window.AMap.Marker({
      position: new window.AMap.LngLat(Number(path[0].lng), Number(path[0].lat)),
      content: `
        <div class="message-particle" style="
          width: ${size}px;
          height: ${size}px;
          background: ${color};
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 0 20px ${glowColor}, 0 0 40px ${glowColor};
          position: relative;
          transform: translate(-50%, -50%);
        ">
          <div style="
            position: absolute;
            inset: -4px;
            border-radius: 50%;
            background: ${glowColor};
            filter: blur(6px);
            animation: particle-pulse 0.8s ease-in-out infinite;
            animation-delay: ${index * 0.15}s;
          "></div>
        </div>
      `,
      zIndex: 102 - index
    })
    
    particleMarker.setMap(this.mapInstance)
    
    // 计算动画时长
    const totalDuration = 2000 + (path.length - 1) * 400
    const startTime = Date.now()
    
    // 不使用缓动，先测试线性运动
    const self = this
    
    // 动画函数：均匀分段，每段时间相等
    const moveParticle = () => {
      const elapsed = Date.now() - startTime
      let progress = Math.min(elapsed / totalDuration, 1)
      
      // 将总进度映射到路径段
      const totalSegments = path.length - 1
      const progressInPath = progress * totalSegments
      const currentSegment = Math.min(Math.floor(progressInPath), totalSegments - 1)
      const segmentProgress = progressInPath - currentSegment
      
      // 获取当前段的起止点
      const fromCity = path[currentSegment]
      const toCity = path[currentSegment + 1]
      
      // 直接线性插值经纬度（与 geodesic: false 的 Polyline 一致）
      const currentLng = Number(fromCity.lng) + (Number(toCity.lng) - Number(fromCity.lng)) * segmentProgress
      const currentLat = Number(fromCity.lat) + (Number(toCity.lat) - Number(fromCity.lat)) * segmentProgress
      
      const newPos = new window.AMap.LngLat(currentLng, currentLat)
      particleMarker.setPosition(newPos)
      
      // 每秒打印一次位置（调试用）
      if (Math.floor(elapsed / 100) !== Math.floor((elapsed - 16) / 100)) {
        console.log(`[粒子] 进度: ${(progress * 100).toFixed(1)}%, 段: ${currentSegment}, 段进度: ${(segmentProgress * 100).toFixed(1)}%, 位置: (${currentLng.toFixed(4)}, ${currentLat.toFixed(4)})`)
      }
      
      if (progress < 1) {
        requestAnimationFrame(moveParticle)
      } else {
        console.log('[粒子] 到达终点')
        // 到达终点，显示到达效果
        const finalCity = path[path.length - 1]
        self.createArrivalEffect(finalCity, color, glowColor)
        
        // 淡出并移除粒子
        setTimeout(() => {
          particleMarker.setMap(null)
        }, 300)
      }
    }
    
    // 开始移动
    moveParticle()
  }

  /**
   * 创建直线动画（回退方案）
   */
  createDirectAnimation(fromCity, toCity, messageType) {
    const color = messageType === 'encrypted' ? '#8b5cf6' : '#0ea5e9'
    const glowColor = messageType === 'encrypted' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(14, 165, 233, 0.4)'
    
    // 简单直线，只创建1个粒子
    this.createPathParticle([fromCity, toCity], color, glowColor, 0)
  }

  /**
   * 创建到达爆炸效果
   */
  createArrivalEffect(city, color, glowColor) {
    if (!window.AMap || !this.mapInstance) return
    
    const effectMarker = new window.AMap.Marker({
      position: new window.AMap.LngLat(Number(city.lng), Number(city.lat)),
      content: `
        <div style="
          width: 40px;
          height: 40px;
          border: 3px solid ${color};
          border-radius: 50%;
          box-shadow: 0 0 30px ${glowColor};
          animation: arrival-burst 0.6s ease-out;
        "></div>
      `,
      offset: new window.AMap.Pixel(-20, -20),
      zIndex: 103
    })
    
    effectMarker.setMap(this.mapInstance)
    
    setTimeout(() => {
      effectMarker.setMap(null)
    }, 600)
  }

  /**
   * 清理所有动画
   */
  clearAll() {
    this.activeAnimations.forEach(animation => {
      if (animation && animation.stop) {
        animation.stop()
      }
    })
    this.activeAnimations = []
  }
}

export default MessageAnimator
