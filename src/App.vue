<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <header class="bar">
    <span class="bar__brand">Web Speech API</span>
    <nav class="bar__nav">
      <RouterLink to="/">首页</RouterLink>
      <RouterLink to="/synthesis">语音合成</RouterLink>
    </nav>
  </header>

  <main class="page">
    <RouterView />
  </main>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1rem 2rem;
  border-bottom: 1px solid var(--color-border);
}

.bar__brand {
  font-weight: 700;
  font-size: 1.05rem;
}

.bar__nav {
  display: flex;
  gap: 1rem;
}

.bar__nav a {
  text-decoration: none;
  color: var(--color-text);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.bar__nav a.router-link-exact-active {
  background: var(--color-background-mute);
  font-weight: 600;
}

.page {
  padding: 2rem;
  max-width: 860px;
  margin: 0 auto;
}
</style>
