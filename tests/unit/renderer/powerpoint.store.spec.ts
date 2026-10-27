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
      ...state
    }),
    control: vi.fn().mockResolvedValue(undefined),
    pickFile: vi.fn().mockResolvedValue(null),
    loadFile: vi.fn().mockResolvedValue(undefined),
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

  it('picks and loads the chosen file, remembering it as the linked file', async () => {
    const { store, powerpoint } = setup()
    powerpoint.pickFile.mockResolvedValue('C:\\slides\\culto.pptx')

    await store.linkFile()

    expect(powerpoint.loadFile).toHaveBeenCalledWith('C:\\slides\\culto.pptx')
    expect(store.linkedFile).toBe('C:\\slides\\culto.pptx')
  })

  it('does nothing when the file picker is cancelled', async () => {
    const { store, powerpoint } = setup()
    powerpoint.pickFile.mockResolvedValue(null)

    await store.linkFile()

    expect(powerpoint.loadFile).not.toHaveBeenCalled()
    expect(store.linkedFile).toBeNull()
  })
})
