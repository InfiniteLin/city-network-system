<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const userRole = ref(localStorage.getItem('userRole') || '')

// 监听路由变化，更新用户角色
watch(() => route.path, () => {
  userRole.value = localStorage.getItem('userRole') || ''
})

// 根据用户角色显示不同的导航项
const navItems = computed(() => {
  if (userRole.value === 'admin') {
    return [
      { path: '/network', label: '通信网络设计' },
      { path: '/monitor', label: '城市通讯监控' },
      { path: '/map', label: '城市地图' },
    ]
  } else if (userRole.value === 'user') {
    return [
      { path: '/network', label: '通信网络设计' },
      { path: '/communication', label: '城市通讯' },
    ]
  }
  return []
})

const showSidebar = computed(() => route.path !== '/login')

function logout() {
  localStorage.removeItem('userRole')
  userRole.value = ''
  router.push('/login')
}
</script>

<template>
  <div class="app-shell" :class="{ 'no-sidebar': !showSidebar }">
    <aside v-if="showSidebar" class="sidebar card">
      <div class="brand">
        <span class="logo">CN</span>
        <span>City Network</span>
      </div>
      <div class="user-info">
        <span class="role-badge">{{ userRole === 'admin' ? '管理员' : '普通用户' }}</span>
        <button @click="logout" class="logout-btn">退出</button>
      </div>
      <nav class="nav">
        <RouterLink 
          v-for="item in navItems" 
          :key="item.path"
          :to="item.path" 
          class="nav-item"
        >
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>
    <main class="content">
      <div class="container">
        <RouterView />
      </div>
    </main>
  </div>
  
</template>

<style scoped>
.app-shell { display: grid; grid-template-columns: 260px 1fr; height: 100vh; gap: 16px; padding: 16px; }
.app-shell.no-sidebar { grid-template-columns: 1fr; padding: 0; }
.sidebar { padding: 16px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; margin-bottom: 16px; }
.logo { display:inline-grid; place-items:center; width:28px; height:28px; border-radius:8px; background: var(--accent); color:#001018; font-weight: 900; }
.user-info { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #f1f5f9; border-radius: 8px; margin-bottom: 16px; }
.role-badge { font-size: 13px; font-weight: 600; color: #334155; }
.logout-btn { padding: 4px 12px; font-size: 12px; border: none; background: #e11d48; color: white; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
.logout-btn:hover { background: #be123c; }
.nav { display: grid; gap: 6px; }
.nav-item { color: var(--text); text-decoration: none; padding: 10px 12px; border-radius: 10px; border:1px solid transparent; display: flex; align-items: center; gap: 8px; transition: all 0.2s ease; }
.nav-item:hover { background: #f1f5f9; border-color: var(--stroke); }
.nav-item.router-link-active { background: var(--primary); color: white; border-color: var(--primary); }
.content { padding: 8px 0; overflow: auto; }
.no-sidebar .content { padding: 0; }
.container { max-width: 1100px; margin: 0 auto; }
</style>
