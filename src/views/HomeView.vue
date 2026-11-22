<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section>
    <h1>Web Speech API 学习</h1>
    <p class="lead">用 Vue 3 + TypeScript 动手练 Web 语音接口。</p>

    <ul class="cards">
      <li>
        <RouterLink to="/synthesis">
          <strong>语音合成 SpeechSynthesis</strong>
          <span>把文字念出来:SpeechSynthesisUtterance、语音列表、朗读队列。</span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 0.5rem;
  color: var(--color-heading);
}

.lead {
  margin: 0 0 2rem;
  color: var(--color-text);
  opacity: 0.75;
}

.cards {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 1rem;
}

.cards a {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  text-decoration: none;
  color: var(--color-text);
  transition: border-color 0.2s;
}

.cards a:hover {
  border-color: var(--vt-c-indigo);
}

.cards span {
  font-size: 0.9rem;
  opacity: 0.75;
}
</style>
