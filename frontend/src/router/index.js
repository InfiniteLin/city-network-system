import { createRouter, createWebHistory } from 'vue-router'

const Login = () => import('../views/Login.vue')
const NetworkDesign = () => import('../views/NetworkDesign.vue')
const MapOverlay = () => import('../views/MapOverlay.vue')
const CityCommunication = () => import('../views/CityCommunication.vue')
const CommunicationMonitor = () => import('../views/CommunicationMonitor.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: Login },
    { path: '/network', component: NetworkDesign, meta: { requiresAuth: true } },
    { path: '/map', component: MapOverlay, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/communication', component: CityCommunication, meta: { requiresAuth: true } },
    { path: '/monitor', component: CommunicationMonitor, meta: { requiresAuth: true, requiresAdmin: true } },
  ],
})

// 简单的导航守卫
router.beforeEach((to, from, next) => {
  const userRole = localStorage.getItem('userRole')
  
  if (to.meta.requiresAuth && !userRole) {
    next('/login')
  } else if (to.meta.requiresAdmin && userRole !== 'admin') {
    next('/network')
  } else {
    next()
  }
})

export default router


