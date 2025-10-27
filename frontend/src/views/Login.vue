<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const selectedRole = ref('')

function login() {
  if (!selectedRole.value) {
    alert('请选择身份')
    return
  }
  
  localStorage.setItem('userRole', selectedRole.value)
  router.push('/network')
}

function selectRole(role) {
  selectedRole.value = role
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="logo-large">CN</div>
        <h1>城市网络通信系统</h1>
        <p class="subtitle">City Network Communication System</p>
      </div>
      
      <div class="role-selection">
        <h2>请选择您的身份</h2>
        <div class="role-options">
          <div 
            class="role-card"
            :class="{ selected: selectedRole === 'admin' }"
            @click="selectRole('admin')"
          >
            <div class="role-icon admin-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                <circle cx="12" cy="8" r="2" fill="#0ea5e9"/>
              </svg>
            </div>
            <h3>管理员</h3>
            <p>访问所有功能模块</p>
            <ul class="features">
              <li>通信网络设计</li>
              <li>城市通讯监控</li>
              <li>城市地图</li>
            </ul>
          </div>
          
          <div 
            class="role-card"
            :class="{ selected: selectedRole === 'user' }"
            @click="selectRole('user')"
          >
            <div class="role-icon user-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <h3>普通用户</h3>
            <p>访问基础功能</p>
            <ul class="features">
              <li>通信网络设计</li>
              <li>城市通讯</li>
            </ul>
          </div>
        </div>
        
        <button 
          class="login-btn" 
          :disabled="!selectedRole"
          @click="login"
        >
          进入系统
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  width: 100vw;
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 50%, #7dd3fc 100%);
  padding: 20px;
  overflow: auto;
}

.login-card {
  background: white;
  border-radius: 20px;
  padding: 40px;
  max-width: 700px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(14, 165, 233, 0.15);
}

.login-header {
  text-align: center;
  margin-bottom: 40px;
}

.logo-large {
  display: inline-grid;
  place-items: center;
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  color: white;
  font-weight: 900;
  font-size: 36px;
  margin-bottom: 20px;
  box-shadow: 0 8px 20px rgba(14, 165, 233, 0.3);
}

.login-header h1 {
  margin: 0;
  font-size: 28px;
  color: #1e293b;
  margin-bottom: 8px;
}

.subtitle {
  margin: 0;
  color: #64748b;
  font-size: 14px;
}

.role-selection h2 {
  text-align: center;
  margin: 0 0 30px 0;
  font-size: 20px;
  color: #334155;
}

.role-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 30px;
}

.role-card {
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
  background: #ffffff;
}

.role-card:hover {
  border-color: #0ea5e9;
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(14, 165, 233, 0.15);
}

.role-card.selected {
  border-color: #0ea5e9;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.05) 0%, rgba(34, 197, 94, 0.05) 100%);
  box-shadow: 0 8px 20px rgba(14, 165, 233, 0.2);
}

.role-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  transition: all 0.3s ease;
}

.admin-icon {
  background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
  color: #0369a1;
}

.admin-icon svg {
  width: 40px;
  height: 40px;
}

.user-icon {
  background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
  color: #15803d;
}

.user-icon svg {
  width: 36px;
  height: 36px;
}

.role-card:hover .role-icon {
  transform: scale(1.1);
}

.role-card.selected .admin-icon {
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
}

.role-card.selected .user-icon {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
}

.role-card h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  color: #1e293b;
}

.role-card p {
  margin: 0 0 16px 0;
  color: #64748b;
  font-size: 13px;
}

.features {
  list-style: none;
  padding: 0;
  margin: 0;
  text-align: left;
}

.features li {
  padding: 6px 0;
  color: #475569;
  font-size: 13px;
  position: relative;
  padding-left: 20px;
}

.features li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: #0ea5e9;
  font-weight: bold;
}

.role-card.selected .features li::before {
  color: #22c55e;
}

.login-btn {
  width: 100%;
  padding: 14px 24px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.2);
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(14, 165, 233, 0.3);
}

.login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
