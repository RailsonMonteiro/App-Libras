import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePowerPointStore } from '@/modules/powerpoint/stores/powerpoint.store'
import type { Slide } from '@/types/presentation'
import type { LouvorJAApi, PowerPointPushEvent, PowerPointState } from '@/types/ipc'

const slide = (id: string, text = id): Slide => ({
  id,
  presentationId: 'p1',
  index: null,
  total: null,
  title: null,
  text,
  nextText: null,
  kind: 'text',
  receivedAt: '2026-01-01T10:00:00.000Z'
})

function setup(state: Partial<PowerPointState> = {}) {
  let push: (event: PowerPointPushEvent) => void = () => undefined
  const unsubscribe = vi.fn()
  const powerpoint = {
    getState: vi.fn().mockResolvedValue({
      presentation: null,
      currentSlide: null,
      recentSlides: [],
      upcomingSlides: [],
      linkedPath: null,
      ...state
    }),
    control: vi.fn().mockResolvedValue(undefined),
    listOpen: vi.fn().mockResolvedValue([]),
    link: vi.fn().mockResolvedValue(undefined),
    bindRemote: vi.fn().mockResolvedValue(undefined),
    onRemoteKey: vi.fn().mockReturnValue(() => undefined),
    onEvent: vi.fn().mockImplementation((listener) => {
      push = listener
      return unsubscribe
    })
  }
  vi.stubGlobal('window', { louvorja: { powerpoint } as unknown as LouvorJAApi })
  setActivePinia(createPinia())
  return {
    store: usePowerPointStore(),
    powerpoint,
    unsubscribe,
    push: (e: PowerPointPushEvent) => push(e)
  }
}

describe('powerpoint store', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('loads the snapshot', async () => {
    const { store } = setup()
    await store.init()
    expect(store.presentation).toBeNull()
    expect(store.currentSlide).toBeNull()
  })

  it('follows presentation and slide events', async () => {
    const { store, push } = setup()
    await store.init()

    push({ kind: 'presentation', presentation: { id: 'p1', title: 'Culto', startedAt: 'x' } })
    push({ kind: 'slide', slide: slide('a') })
    push({ kind: 'slide', slide: slide('b') })
    expect(store.currentSlide?.id).toBe('b')
    expect(store.recentSlides.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('loads upcoming slides from the snapshot and follows upcoming events', async () => {
    const { store, push } = setup({ upcomingSlides: [{ index: 1, text: 'DOIS' }] })
    await store.init()
    expect(store.upcomingSlides).toEqual([{ index: 1, text: 'DOIS' }])

    push({
      kind: 'upcoming',
      slides: [
        { index: 1, text: 'DOIS' },
        { index: 2, text: 'TRÊS' }
      ]
    })
    expect(store.upcomingSlides).toEqual([
      { index: 1, text: 'DOIS' },
      { index: 2, text: 'TRÊS' }
    ])
  })

  it('clears the slides when a different presentation starts', async () => {
    const { store, push } = setup()
    await store.init()
    push({ kind: 'presentation', presentation: { id: 'p1', title: 'A', startedAt: 'x' } })
    push({ kind: 'slide', slide: slide('a') })
    push({ kind: 'presentation', presentation: { id: 'p2', title: 'B', startedAt: 'x' } })

    expect(store.recentSlides).toEqual([])
    expect(store.currentSlide).toBeNull()
  })

  it('clears the slides when the presentation ends', async () => {
    const { store, push } = setup()
    await store.init()
    push({ kind: 'presentation', presentation: { id: 'p1', title: 'A', startedAt: 'x' } })
    push({ kind: 'slide', slide: slide('a') })
    push({ kind: 'presentation', presentation: null })

    expect(store.recentSlides).toEqual([])
    expect(store.currentSlide).toBeNull()
    expect(store.presentation).toBeNull()
  })

  it('delegates control and stops listening on dispose', async () => {
    const { store, powerpoint, unsubscribe } = setup()
    await store.init()
    await store.init() // idempotent
    expect(powerpoint.onEvent).toHaveBeenCalledTimes(1)

    await store.control('next')
    expect(powerpoint.control).toHaveBeenCalledWith('next')

    store.dispose()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('follows the progress of reading slide images', async () => {
    const { store, push } = setup()
    await store.init()
    push({ kind: 'ocr', progress: { done: 2, total: 14 } })
    expect(store.ocr).toEqual({ done: 2, total: 14 })
    push({ kind: 'ocr', progress: null })
    expect(store.ocr).toBeNull()
  })

  it('loads the linked presentation from the snapshot', async () => {
    const { store } = setup({ linkedPath: 'C:\\slides\\culto.pptx' })
    await store.init()
    expect(store.linkedPath).toBe('C:\\slides\\culto.pptx')
  })

  it('lists the presentations open in PowerPoint', async () => {
    const { store, powerpoint } = setup()
    powerpoint.listOpen.mockResolvedValue([{ path: 'C:\\culto.pptx', name: 'culto.pptx' }])

    await store.refreshOpen()

    expect(store.openPresentations).toEqual([{ path: 'C:\\culto.pptx', name: 'culto.pptx' }])
    expect(store.loadingOpen).toBe(false)
  })

  it('shows an empty list when PowerPoint cannot be asked', async () => {
    const { store, powerpoint } = setup()
    powerpoint.listOpen.mockRejectedValue(new Error('powershell not found'))

    await store.refreshOpen()

    expect(store.openPresentations).toEqual([])
    expect(store.loadingOpen).toBe(false)
  })

  it('links the chosen presentation, remembering it', async () => {
    const { store, powerpoint } = setup()

    await store.link('C:\\slides\\culto.pptx')

    expect(powerpoint.link).toHaveBeenCalledWith('C:\\slides\\culto.pptx')
    expect(store.linkedPath).toBe('C:\\slides\\culto.pptx')
    expect(store.linkError).toBe(false)
  })

  it('reports a presentation that could not be read instead of showing it as linked', async () => {
    const { store, powerpoint } = setup()
    powerpoint.link.mockRejectedValue(new Error('not open'))

    await store.link('C:\\slides\\fechada.pptx')

    expect(store.linkedPath).toBeNull()
    expect(store.linkError).toBe(true)
  })
})
