import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Presentation, Slide } from '@/types/presentation'
import type {
  OcrProgress,
  OpenPresentation,
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
  /** The presentation linked to the app (an OpenPresentation.path), if any. */
  const linkedPath = ref<string | null>(null)
  /** The last one picked could no longer be read (closed in PowerPoint in the meantime...). */
  const linkError = ref(false)
  /** What PowerPoint has open, as of the last refreshOpen(). */
  const openPresentations = ref<OpenPresentation[]>([])
  const loadingOpen = ref(false)
  /** Reading the text inside slide images (OCR) in progress, if any. */
  const ocr = ref<OcrProgress | null>(null)

  let unsubscribe: (() => void) | null = null

  function applyState(state: PowerPointState): void {
    presentation.value = state.presentation
    currentSlide.value = state.currentSlide
    recentSlides.value = state.recentSlides
    upcomingSlides.value = state.upcomingSlides
    linkedPath.value = state.linkedPath
    ocr.value = state.ocr ?? null
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
      case 'ocr':
        ocr.value = event.progress
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

  /** Drives the linked presentation's slide show (ignored while none is linked). */
  async function control(action: PowerPointAction): Promise<void> {
    await PowerPointService.control(action)
  }

  /** Asks PowerPoint what it has open right now. */
  async function refreshOpen(): Promise<void> {
    loadingOpen.value = true
    try {
      openPresentations.value = await PowerPointService.listOpen()
    } catch {
      openPresentations.value = []
    } finally {
      loadingOpen.value = false
    }
  }

  /** Links one of the open presentations and reads its slides. */
  async function link(path: string): Promise<void> {
    linkError.value = false
    linkedPath.value = null
    try {
      await PowerPointService.link(path)
      linkedPath.value = path
    } catch {
      linkError.value = true
    }
  }

  return {
    presentation,
    currentSlide,
    recentSlides,
    upcomingSlides,
    linkedPath,
    linkError,
    openPresentations,
    loadingOpen,
    ocr,
    init,
    dispose,
    control,
    refreshOpen,
    link
  }
})
