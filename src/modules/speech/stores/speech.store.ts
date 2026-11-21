import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/services/api'
import type { Presentation, Slide } from '@/types/presentation'
import type { SpeechError, SpeechPushEvent, SpeechState, SpeechStatus } from '@/types/ipc'

/** The microphone source: each phrase recognized while it is on arrives as a slide. */
export const useSpeechStore = defineStore('speech', () => {
  const status = ref<SpeechStatus>('idle')
  const error = ref<SpeechError | null>(null)
  const presentation = ref<Presentation | null>(null)
  const currentSlide = ref<Slide | null>(null)
  /** Oldest first, like in the main process. */
  const recentSlides = ref<Slide[]>([])

  const active = computed(() => status.value === 'starting' || status.value === 'listening')

  let unsubscribe: (() => void) | null = null

  function applyState(state: SpeechState): void {
    status.value = state.status
    error.value = state.error
    presentation.value = state.presentation
    currentSlide.value = state.currentSlide
    recentSlides.value = state.recentSlides
  }

  function applyEvent(event: SpeechPushEvent): void {
    switch (event.kind) {
      case 'status':
        status.value = event.status
        error.value = event.error
        break
      case 'presentation':
        if (event.presentation?.id !== presentation.value?.id) {
          currentSlide.value = null
          recentSlides.value = []
        }
        presentation.value = event.presentation
        break
      case 'slide':
        currentSlide.value = event.slide
        recentSlides.value = [...recentSlides.value, event.slide].slice(-100)
        break
    }
  }

  /** Subscribes first and then loads the snapshot, so no event is lost in between. */
  async function init(): Promise<void> {
    if (unsubscribe) return
    unsubscribe = api().speech.onEvent(applyEvent)
    applyState(await api().speech.getState())
  }

  function dispose(): void {
    unsubscribe?.()
    unsubscribe = null
  }

  async function start(): Promise<void> {
    await api().speech.start()
  }

  async function stop(): Promise<void> {
    await api().speech.stop()
  }

  async function openSettings(kind: 'privacy' | 'microphone'): Promise<void> {
    await api().speech.openSettings(kind)
  }

  return {
    status,
    error,
    presentation,
    currentSlide,
    recentSlides,
    active,
    init,
    dispose,
    start,
    stop,
    openSettings
  }
})
