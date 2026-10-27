import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Presentation, Slide } from '@/types/presentation'
import type {
  PowerPointAction,
  PowerPointPushEvent,
  PowerPointState,
  UpcomingSlide
} from '@/types/ipc'
import { PowerPointService } from '../services/PowerPointService'

export const usePowerPointStore = defineStore('powerpoint', () => {
  const presentation = ref<Presentation | null>(null)
  const currentSlide = ref<Slide | null>(null)
  /** Oldest first, like in the main process. */
  const recentSlides = ref<Slide[]>([])
  /** Slides not yet reached, nearest first - unrelated to LouvorJA's own "Slides recebidos". */
  const upcomingSlides = ref<UpcomingSlide[]>([])
  /** Full path of the file loaded through linkFile(), for this session only. */
  const linkedFile = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  function applyState(state: PowerPointState): void {
    presentation.value = state.presentation
    currentSlide.value = state.currentSlide
    recentSlides.value = state.recentSlides
    upcomingSlides.value = state.upcomingSlides
  }

  function applyEvent(event: PowerPointPushEvent): void {
    switch (event.kind) {
      case 'presentation':
        // Also clears when the presentation ends (event.presentation null): unlike LouvorJA,
        // ending here means "Finalizar apresentação" was pressed - the preview must go back to
        // its empty state right away, not keep showing the last slide alongside it.
        if (event.presentation?.id !== presentation.value?.id) {
          currentSlide.value = null
          recentSlides.value = []
        }
        presentation.value = event.presentation
        break
      case 'slide': {
        const last = recentSlides.value.at(-1)
        if (last?.id === event.slide.id && last.text === event.slide.text) break
        currentSlide.value = event.slide
        recentSlides.value = [...recentSlides.value, event.slide].slice(-100)
        break
      }
      case 'upcoming':
        upcomingSlides.value = event.slides
        break
    }
  }

  /** Subscribes first and then loads the snapshot, so no event is lost in between. */
  async function init(): Promise<void> {
    if (unsubscribe) return
    unsubscribe = PowerPointService.onEvent(applyEvent)
    applyState(await PowerPointService.getState())
  }

  function dispose(): void {
    unsubscribe?.()
    unsubscribe = null
  }

  /** Moves between slides of the loaded file (ignored while none is loaded). */
  async function control(action: PowerPointAction): Promise<void> {
    await PowerPointService.control(action)
  }

  /** Opens the native file picker and, unless cancelled, reads and parses the chosen file. */
  async function linkFile(): Promise<void> {
    const path = await PowerPointService.pickFile()
    if (!path) return
    linkedFile.value = path
    await PowerPointService.loadFile(path)
  }

  return {
    presentation,
    currentSlide,
    recentSlides,
    upcomingSlides,
    linkedFile,
    init,
    dispose,
    control,
    linkFile
  }
})
