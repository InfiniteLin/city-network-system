/**
 * 消息动画服务
 * 封装地图上的消息传输动画逻辑
 */

/**
 * 创建消息动画
 */
export function createMessageAnimation(fromCity, toCity, messageType, mapInstance) {
  if (!window.AMap || !mapInstance) {
    console.log('[动画] 地图未准备好，跳过动画')
    return
  }

  const color = messageType === 'encrypted' ? '#8b5cf6' : '#0ea5e9'
  const glowColor = messageType === 'encrypted' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(14, 165, 233, 0.4)'
  
  // 创建动态闪烁的路径线条
  const messageLine = new window.AMap.Polyline({
    path: [
      new window.AMap.LngLat(Number(fromCity.lng), Number(fromCity.lat)),
      new window.AMap.LngLat(Number(toCity.lng), Number(toCity.lat))
    ],
    strokeColor: color,
    strokeWeight: 4,
    strokeOpacity: 0.8,
    strokeStyle: 'solid',
    zIndex: 100
  })
  
  messageLine.setMap(mapInstance)
  
  // 创建发光背景线条
  const glowLine = new window.AMap.Polyline({
    path: [
      new window.AMap.LngLat(Number(fromCity.lng), Number(fromCity.lat)),
      new window.AMap.LngLat(Number(toCity.lng), Number(toCity.lat))
    ],
    strokeColor: color,
    strokeWeight: 12,
    strokeOpacity: 0.3,
    strokeStyle: 'solid',
    zIndex: 99
  })
  
  glowLine.setMap(mapInstance)
  
  // 创建多个粒子效果
  const particleCount = 3
  const particleDelay = 150
  
  for (let i = 0; i < particleCount; i++) {
    setTimeout(() => {
      createParticle(fromCity, toCity, color, glowColor, i, mapInstance)
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
  const duration = 2500
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
 * 创建单个粒子
 */
function createParticle(fromCity, toCity, color, glowColor, index, mapInstance) {
  if (!window.AMap || !mapInstance) return
  
  const size = 14 - index * 2
  
  const particleMarker = new window.AMap.Marker({
    position: new window.AMap.LngLat(Number(fromCity.lng), Number(fromCity.lat)),
    content: `
      <div class="message-particle" style="
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 0 20px ${glowColor}, 0 0 40px ${glowColor};
        position: relative;
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
    offset: new window.AMap.Pixel(-size/2, -size/2),
    zIndex: 102 - index
  })
  
  particleMarker.setMap(mapInstance)
  
  const trailMarker = new window.AMap.Marker({
    position: new window.AMap.LngLat(Number(fromCity.lng), Number(fromCity.lat)),
    content: `
      <div style="
        width: ${size * 3}px;
        height: ${size}px;
        background: linear-gradient(90deg, transparent, ${glowColor}, transparent);
        border-radius: ${size}px;
        filter: blur(4px);
        opacity: 0.6;
      "></div>
    `,
    offset: new window.AMap.Pixel(-size * 1.5, -size/2),
    zIndex: 101 - index
  })
  
  trailMarker.setMap(mapInstance)
  
  // 粒子移动动画
  const duration = 2000
  const startTime = Date.now()
  
  function easeInOutCubic(t) {
    return t < 0.5 
      ? 4 * t * t * t 
      : 1 - Math.pow(-2 * t + 2, 3) / 2
  }
  
  function moveParticle() {
    const elapsed = Date.now() - startTime
    let progress = Math.min(elapsed / duration, 1)
    progress = easeInOutCubic(progress)
    
    const currentLng = fromCity.lng + (toCity.lng - fromCity.lng) * progress
    const currentLat = fromCity.lat + (toCity.lat - fromCity.lat) * progress
    
    particleMarker.setPosition(new window.AMap.LngLat(Number(currentLng), Number(currentLat)))
    
    const trailProgress = Math.max(0, progress - 0.05)
    const trailLng = fromCity.lng + (toCity.lng - fromCity.lng) * trailProgress
    const trailLat = fromCity.lat + (toCity.lat - fromCity.lat) * trailProgress
    trailMarker.setPosition(new window.AMap.LngLat(Number(trailLng), Number(trailLat)))
    
    if (progress < 1) {
      requestAnimationFrame(moveParticle)
    } else {
      createArrivalEffect(toCity, color, glowColor, mapInstance)
      setTimeout(() => {
        particleMarker.setMap(null)
        trailMarker.setMap(null)
      }, 300)
    }
  }
  
  moveParticle()
}

/**
 * 创建到达爆炸效果
 */
function createArrivalEffect(city, color, glowColor, mapInstance) {
  if (!window.AMap || !mapInstance) return
  
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
  
  effectMarker.setMap(mapInstance)
  
  setTimeout(() => {
    effectMarker.setMap(null)
  }, 600)
}

export default {
  createMessageAnimation
}
