<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
// 准备朗读的文本;
const text = ref("你好,这是 Web Speech API 的语音合成示例。");
// 语速;
const rate = ref(1);
// SpeechSynthesisVoice
// 音色;
const voices = ref<SpeechSynthesisVoice[]>([]);
const voiceURI = ref("");
const status = ref("就绪");
// 是否停止;
const stoppedByUser = ref(false);

// 语音合成错误码 → 中文说明。
// 这里刻意用 Record<string, string> 而不是精确联合类型:TS 的 SpeechSynthesisErrorCode
// 把 "language-unavailable" 误写成了 "language&available",按联合类型穷举会对不上。
const ERROR_TEXT: Record<string, string> = {
  "audio-busy": "音频输出设备忙",
  "audio-hardware": "音频硬件异常",
  canceled: "朗读被取消",
  interrupted: "朗读被打断",
  network: "网络错误",
  "not-allowed": "权限被拒绝",
  "synthesis-failed": "语音合成失败",
  "synthesis-unavailable": "语音合成服务不可用",
  "text-too-long": "文本过长",
  "voice-unavailable": "所选语音不可用",
  "invalid-argument": "参数非法",
};

//加载可用的语音列表;
function loadVoices() {
  // 获取可用的语音列表;
  voices.value = speechSynthesis.getVoices();
  console.log(voices.value);
  // 默认挑一个中文语音,没有就退回列表第一个
  if (!voiceURI.value && voices.value.length > 0) {
    const zh = voices.value.find((v) => v.lang.startsWith("zh"));
    voiceURI.value = (zh ?? voices.value[0])?.voiceURI ?? "";
  }
}

onMounted(() => {
  loadVoices();
  // getVoices() 是异步的:首次调用通常返回空数组,
  // 真正的语音列表要靠 voiceschanged 事件异步送达。
  // 语音列表变化事件监听
  speechSynthesis.addEventListener("voiceschanged", loadVoices);
});

onBeforeUnmount(() => {
  // 卸载事件;
  speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  // 取消所有队列中的语音
  speechSynthesis.cancel();
});

function speak() {
  if (!text.value.trim()) {
    status.value = "没有可朗读的文本";
    return;
  }

  stoppedByUser.value = false;
  // 丢弃队列里还没念完的内容,避免文字越积越多
  speechSynthesis.cancel();
  // SpeechSynthesisUtterance 表示一个语音请求，包含了要朗读的文本内容以及如何朗读的配置参数。
  const utterance = new SpeechSynthesisUtterance(text.value);
  utterance.lang = "zh-CN";
  utterance.rate = rate.value;
  // utterance.pitch; //设置音调;
  // utterance.volume; // 设置音量;
  // 先设 lang 再设 voice:voice 会用自己的 lang 覆盖掉上面的值
  const voice = voices.value.find((v) => v.voiceURI === voiceURI.value);
  if (voice) {
    utterance.voice = voice;
  }
  // 开始播放时 触发;
  utterance.onstart = () => {
    status.value = "朗读中…";
  };
  // 语音播放完成时触发
  utterance.onend = () => {
    status.value = "朗读完成";
  };
  // 播放过程中出现错误时触发
  utterance.onerror = (event) => {
    // 用户主动 cancel() 同样会触发 error(canceled),那不算故障
    if (stoppedByUser.value || event.error === "canceled") {
      status.value = "已停止";
      return;
    }
    status.value = `出错:${event.error} —— ${ERROR_TEXT[event.error] ?? "未知错误"}`;
  };
  // 开始播放;
  speechSynthesis.speak(utterance);
}

function stop() {
  stoppedByUser.value = true;
  // 取消所有队列中的语音
  speechSynthesis.cancel();
  status.value = "已停止";
}
</script>

<template>
  <section>
    <h1>语音合成 SpeechSynthesis</h1>
    <p class="hint">
      用 <code>SpeechSynthesisUtterance</code> 把一段文字交给浏览器念出来:
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
            {{ v.name }}({{ v.lang }}){{ v.localService ? "" : " · 网络" }}
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
      <button type="button" @click="speak">朗读</button>
      <button type="button" class="ghost" @click="stop">停止</button>
    </div>

    <p class="status">状态:{{ status }}</p>

    <aside class="note">
      <strong>三个容易踩的坑</strong>
      <ol>
        <li>
          <code>getVoices()</code> 首次调用返回空数组是正常的,得监听 <code>voiceschanged</code>。
        </li>
        <li>
          主动调 <code>cancel()</code> 会触发 <code>error</code> 事件,错误码是
          <code>canceled</code>。
        </li>
        <li>Chrome 会静默截断超过约 15 秒的单条朗读,长文本要按句拆分入队。</li>
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

.status {
  margin-top: 1rem;
  font-weight: 600;
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
