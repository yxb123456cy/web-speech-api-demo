<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ERROR_TEXT, useSpeechSynthesis } from '@/composables/useSpeechSynthesis'

// 准备朗读的文本
const text = ref('你好,这是 Web Speech API 的语音合成示例。')
// 语速
const rate = ref(1)
// 选中的音色 voiceURI
const voiceURI = ref('')
// 状态文案
const status = ref('就绪')

const {
  voices,
  isSpeaking,
  isPaused,
  pendingCount,
  speak: speakText,
  stop: stopSpeak,
  pause,
  resume,
  findVoice,
} = useSpeechSynthesis()

// 音色列表是异步送达的,拿到之后默认挑一个中文语音,没有就退回列表第一个
watch(
  voices,
  (list) => {
    if (!voiceURI.value && list.length > 0) {
      const zh = list.find((v) => v.lang.startsWith('zh'))
      voiceURI.value = (zh ?? list[0])?.voiceURI ?? ''
    }
  },
  { immediate: true },
)

// 当前选中的音色
const selectedVoice = computed(() => findVoice(voiceURI.value) ?? null)

function speak() {
  speakText(text.value, {
    // 先设 lang 再设 voice:voice 会用自己的 lang 覆盖掉它
    lang: 'zh-CN',
    voice: selectedVoice.value,
    rate: rate.value,
    onstart: () => {
      status.value = '朗读中…'
    },
    onend: () => {
      status.value = '朗读完成'
    },
    onerror: (code) => {
      status.value = `出错:${code} —— ${ERROR_TEXT[code] ?? '未知错误'}`
    },
  })
}

function stop() {
  stopSpeak()
  status.value = '已停止'
}

function togglePause() {
  if (isPaused.value) {
    resume()
    status.value = '朗读中…'
  } else {
    pause()
    status.value = '已暂停'
  }
}
</script>

<template>
  <section>
    <h1>语音合成 SpeechSynthesis</h1>
    <p class="hint">
      通用封装在 <code>src/composables/useSpeechSynthesis.ts</code>。底层流程还是那三步:
      <code>new SpeechSynthesisUtterance(text)</code> → 设参数 →
      <code>speechSynthesis.speak(u)</code>。
    </p>

    <label class="field">
      <span>要朗读的文本</span>
      <textarea id="tts-text" name="text" v-model="text" rows="4" placeholder="输入一段文字…" />
    </label>

    <div class="row">
      <label class="field">
        <span>语音(本机共 {{ voices.length }} 个)</span>
        <select id="tts-voice" name="voice" v-model="voiceURI">
          <option value="">自动选择</option>
          <option v-for="v in voices" :key="v.voiceURI" :value="v.voiceURI">
            {{ v.name }}({{ v.lang }}){{ v.localService ? '' : ' · 网络' }}
          </option>
        </select>
      </label>

      <label class="field">
        <span>语速 rate = {{ rate }}</span>
        <input
          id="tts-rate"
          name="rate"
          v-model.number="rate"
          type="range"
          min="0.5"
          max="2"
          step="0.1"
        />
      </label>
    </div>

    <div class="actions">
      <button type="button" :disabled="isSpeaking" @click="speak">朗读</button>
      <button type="button" class="ghost" :disabled="!isSpeaking" @click="togglePause">
        {{ isPaused ? '继续' : '暂停' }}
      </button>
      <button type="button" class="ghost" :disabled="!isSpeaking && !pendingCount" @click="stop">
        停止
      </button>
    </div>

    <p class="status">
      状态:{{ status }}
      <span v-if="pendingCount > 0" class="status__queue">队列剩余 {{ pendingCount }} 条</span>
    </p>

    <aside class="note">
      <strong>三个容易踩的坑(composable 都处理了)</strong>
      <ol>
        <li>
          <code>getVoices()</code> 首次调用返回空数组是正常的,得监听 <code>voiceschanged</code>。
        </li>
        <li>
          主动调 <code>cancel()</code> 会触发 <code>error</code> 事件,错误码是
          <code>canceled</code> —— 用 <code>canceledByUser</code> 标记区分,不算故障。
        </li>
        <li>
          Chrome 会静默截断超过约 15 秒的单条朗读。composable 会按句拆成多条依次入队,
          所以状态栏会显示「队列剩余 N 条」。
        </li>
      </ol>
    </aside>
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 0.5rem;
}

.hint {
  margin: 0 0 1.5rem;
  opacity: 0.8;
  line-height: 1.7;
}

code {
  background: var(--color-background-mute);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-size: 0.9em;
}

.field {
  display: grid;
  gap: 0.4rem;
  margin-bottom: 1.25rem;
}

.field > span {
  font-size: 0.9rem;
  font-weight: 600;
}

textarea,
select {
  font: inherit;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
}

textarea {
  resize: vertical;
}

.row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1rem;
}

.actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

button {
  font: inherit;
  padding: 0.55rem 1.4rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--vt-c-indigo);
  color: #fff;
  cursor: pointer;
}

button.ghost {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-text);
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.status {
  margin-top: 1rem;
  font-weight: 600;
}

.status__queue {
  margin-left: 0.75rem;
  font-weight: 400;
  opacity: 0.7;
}

.note {
  margin-top: 2rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 0.92rem;
}

.note ol {
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
  line-height: 1.9;
}
</style>
