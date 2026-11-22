import { onScopeDispose, ref } from 'vue'

/**
 * 单条 utterance 的默认最大字符数。
 * Chrome 会在约 15 秒后「静默」截断单条朗读(不报错、直接不念了),
 * 所以长文本必须拆成多条入队,这里用字符数粗略估算时长。
 */
const DEFAULT_MAX_CHUNK_LENGTH = 100

/**
 * 句子边界:中英文句末标点、分号、换行。
 * 英文句点要求后面跟空格,避免把 "3.14" 这类数字切开。
 */
const SENTENCE_BOUNDARY = /(?<=[。！？!?;；\n])|(?<=\.\s)/

/** 语音合成错误码 → 中文说明(示例用;正式项目请走 i18n) */
export const ERROR_TEXT: Record<string, string> = {
  'audio-busy': '音频输出设备忙',
  'audio-hardware': '音频硬件异常',
  canceled: '朗读被取消',
  interrupted: '朗读被打断',
  network: '网络错误',
  'not-allowed': '权限被拒绝',
  'synthesis-failed': '语音合成失败',
  'synthesis-unavailable': '语音合成服务不可用',
  'text-too-long': '文本过长',
  'voice-unavailable': '所选语音不可用',
  'invalid-argument': '参数非法',
}

export interface SpeakOptions {
  /** 语言,如 'zh-CN';不传则沿用 voice 自带的 lang */
  lang?: string
  /** 音色;传了会覆盖 lang */
  voice?: SpeechSynthesisVoice | null
  /** 语速,0.1 ~ 10,默认 1 */
  rate?: number
  /** 音调,0 ~ 2,默认 1 */
  pitch?: number
  /** 音量,0 ~ 1,默认 1 */
  volume?: number
  /** 长文本是否自动按句拆分入队,默认 true */
  autoChunk?: boolean
  /** 单条文本最大字符数 */
  maxChunkLength?: number
  /** 第一条开始朗读时触发 */
  onstart?: () => void
  /** 队列全部念完时触发 */
  onend?: () => void
  /** 出错时触发,参数是原始错误码 */
  onerror?: (code: string) => void
}

/**
 * 把长文本切成不超过 maxLength 字的若干条,用于规避 Chrome 的 15 秒截断。
 * 先按句子切,再把相邻短句合并,最后对超长单句做硬切。
 */
export function chunkText(text: string, maxLength = DEFAULT_MAX_CHUNK_LENGTH): string[] {
  const sentences = text
    .split(SENTENCE_BOUNDARY)
    .map((s) => s.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    // 单句就超长:直接硬切
    if (sentence.length > maxLength) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      for (let i = 0; i < sentence.length; i += maxLength) {
        chunks.push(sentence.slice(i, i + maxLength))
      }
      continue
    }

    // 加上这句就超长:先收尾,另起一条
    if (current && current.length + sentence.length > maxLength) {
      chunks.push(current)
      current = sentence
    } else {
      current += sentence
    }
  }

  if (current) chunks.push(current)
  return chunks
}

/**
 * 通用语音合成(TTS)封装。
 *
 * 注意:`window.speechSynthesis` 本身是平台级的全局单例,
 * 所以即使创建多个实例,它们共用同一条朗读队列 —— 一个实例调 stop() 会把另一个也停掉。
 */
export function useSpeechSynthesis() {
  const synth = typeof window === 'undefined' ? undefined : window.speechSynthesis

  /** 本机可用的音色列表 */
  const voices = ref<SpeechSynthesisVoice[]>([])
  /** 是否正在朗读 */
  const isSpeaking = ref(false)
  /** 是否处于暂停状态 */
  const isPaused = ref(false)
  /** 最近的错误码,null 表示没有错误 */
  const error = ref<string | null>(null)
  /** 队列里还没念完的条数 */
  const pendingCount = ref(0)

  /** 区分「用户主动停止」和「真的出错」 */
  let canceledByUser = false

  /** 加载可用的语音列表 */
  function loadVoices() {
    if (!synth) return
    voices.value = synth.getVoices()
    // 打印本机可用的音色,学习时方便观察各语音的 lang / localService
    console.log(voices.value)
  }

  /** 按 voiceURI 找音色 */
  function findVoice(voiceURI: string): SpeechSynthesisVoice | undefined {
    return voices.value.find((v) => v.voiceURI === voiceURI)
  }

  /** 队列里少一条 */
  function finishOne() {
    pendingCount.value = Math.max(0, pendingCount.value - 1)
    if (pendingCount.value === 0) {
      isSpeaking.value = false
      isPaused.value = false
    }
  }

  /**
   * 朗读一段文本。
   * 文本较长时会自动按句拆成多条依次入队,每条独立计时,规避 15 秒截断。
   */
  function speak(text: string, options: SpeakOptions = {}) {
    if (!synth) {
      error.value = '当前环境不支持语音合成'
      options.onerror?.('unsupported')
      return
    }

    const content = text.trim()
    if (!content) {
      error.value = '没有可朗读的文本'
      options.onerror?.('empty-text')
      return
    }

    const {
      lang,
      voice = null,
      rate = 1,
      pitch = 1,
      volume = 1,
      autoChunk = true,
      maxChunkLength = DEFAULT_MAX_CHUNK_LENGTH,
      onstart,
      onend,
      onerror,
    } = options

    error.value = null
    isPaused.value = false
    canceledByUser = false

    const chunks = autoChunk ? chunkText(content, maxChunkLength) : [content]
    let started = false

    for (const chunk of chunks) {
      const utterance = new SpeechSynthesisUtterance(chunk)

      if (lang) utterance.lang = lang
      // 先设 lang 再设 voice:voice 会用自己的 lang 覆盖掉上面那个
      if (voice) utterance.voice = voice
      utterance.rate = rate
      utterance.pitch = pitch
      utterance.volume = volume

      utterance.onstart = () => {
        isSpeaking.value = true
        // 只有第一条的 onstart 才通知外部,避免长文本重复回调
        if (!started) {
          started = true
          onstart?.()
        }
      }

      utterance.onend = () => {
        finishOne()
        if (pendingCount.value === 0) onend?.()
      }

      utterance.onerror = (event) => {
        finishOne()
        // 用户主动 stop() 同样会触发 error(canceled),那不算故障
        if (canceledByUser || event.error === 'canceled') {
          if (pendingCount.value === 0) onend?.()
          return
        }
        error.value = event.error
        onerror?.(event.error)
      }

      pendingCount.value += 1
      synth.speak(utterance)
    }
  }

  /** 停止朗读并清空队列 */
  function stop() {
    if (!synth) return
    canceledByUser = true
    synth.cancel()
    // cancel() 会直接丢掉队列里没念的条目,它们可能不触发任何事件,这里手动归零
    pendingCount.value = 0
    isSpeaking.value = false
    isPaused.value = false
  }

  /** 暂停 */
  function pause() {
    if (!synth || !isSpeaking.value) return
    synth.pause()
    isPaused.value = true
  }

  /** 继续 */
  function resume() {
    if (!synth || !isPaused.value) return
    synth.resume()
    isPaused.value = false
  }

  // getVoices() 是异步的:首次调用通常返回空数组,
  // 真正的语音列表要靠 voiceschanged 事件异步送达。
  loadVoices()
  synth?.addEventListener('voiceschanged', loadVoices)

  onScopeDispose(() => {
    synth?.removeEventListener('voiceschanged', loadVoices)
    synth?.cancel()
  })

  return {
    voices,
    isSpeaking,
    isPaused,
    error,
    pendingCount,
    speak,
    stop,
    pause,
    resume,
    findVoice,
    loadVoices,
  }
}
