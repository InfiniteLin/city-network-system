<script setup>
import { ref } from 'vue'

const note = ref('此页将演示：哈夫曼编码、AES/DES加解密、A→B动画')
</script>

<template>
  <div class="page">
    <div class="header">
      <h2>模拟通信演示</h2>
      <p class="muted">此页将演示：哈夫曼编码、AES/DES加解密、A→B动画</p>
    </div>
  </div>
</template>

<style scoped>
.page { display: grid; gap: 16px; }
.header { text-align: center; position: relative; padding-bottom: 8px; }
.header h2 { margin: 0; font-size: 24px; letter-spacing: .5px; }
.header:after { content: ""; display: block; height: 3px; width: 120px; margin: 12px auto 0; border-radius: 999px; background: linear-gradient(90deg, var(--primary), var(--accent)); opacity: .6; }
</style>


