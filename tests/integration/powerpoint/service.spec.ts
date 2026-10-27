import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../../electron/services/DatabaseService'
import { PowerPointService } from '../../../electron/services/powerpoint/PowerPointService'
import type { PowerPointPushEvent } from '../../../electron/services/powerpoint/PowerPointService'
import type { PowerPointSlideImageCache } from '../../../electron/services/powerpoint/PowerPointSlideImageCache'
import type { PptxSlideText } from '../../../electron/services/powerpoint/powerpointCom'

function setup(
  texts: PptxSlideText[] = [
    { index: 0, text: 'UM' },
    { index: 1, text: 'DOIS' }
  ]
) {
  const db = openDatabase(':memory:')
  const slideImages = { setFile: vi.fn() } as unknown as PowerPointSlideImageCache
  const loadFile = vi.fn().mockResolvedValue(texts)
  const closeFile = vi.fn().mockResolvedValue(undefined)
  const service = new PowerPointService({ db, loadFile, closeFile, slideImages })
  const events: PowerPointPushEvent[] = []
  service.onEvent((event) => events.push(event))
  return { service, events, slideImages, loadFile, closeFile }
}

describe('PowerPointService', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('has no presentation before a file is loaded', () => {
    const { service } = setup()
    expect(service.getState()).toMatchObject({ presentation: null, currentSlide: null })
  })

  it('opens the file hidden and reads every slide, without starting a presentation yet', async () => {
    const { service, loadFile, closeFile, slideImages } = setup()
    await service.loadFile('C:/culto.pptx')

    expect(loadFile).toHaveBeenCalledWith('C:/culto.pptx')
    expect(closeFile).not.toHaveBeenCalled() // nothing was open before this
    expect(slideImages.setFile).toHaveBeenCalledWith('C:/culto.pptx')
    expect(service.getState()).toMatchObject({ presentation: null, currentSlide: null })
  })

  it('starts on the first slide and reports the rest as upcoming', async () => {
    const { service, events } = setup()
    await service.loadFile('C:/culto.pptx')
    events.length = 0

    service.control('start')

    expect(service.getState()).toMatchObject({
      presentation: { id: 'C:/culto.pptx', title: 'culto.pptx' },
      currentSlide: { text: 'UM', index: 0, total: 2 },
      upcomingSlides: [{ index: 1, text: 'DOIS' }]
    })
    expect(events.map((e) => e.kind)).toEqual(['presentation', 'slide', 'upcoming'])
  })

  it('moves next/previous within range, and first/last jump to the ends', async () => {
    const { service } = setup([
      { index: 0, text: 'UM' },
      { index: 1, text: 'DOIS' },
      { index: 2, text: 'TRÊS' }
    ])
    await service.loadFile('p.pptx')

    service.control('start')
    expect(service.getState().currentSlide).toMatchObject({ text: 'UM' })

    service.control('next')
    expect(service.getState().currentSlide).toMatchObject({ text: 'DOIS' })

    service.control('next')
    service.control('next') // already on the last slide - stays there
    expect(service.getState().currentSlide).toMatchObject({ text: 'TRÊS' })
    expect(service.getState().upcomingSlides).toEqual([])

    service.control('previous')
    expect(service.getState().currentSlide).toMatchObject({ text: 'DOIS' })

    service.control('first')
    expect(service.getState().currentSlide).toMatchObject({ text: 'UM' })

    service.control('previous') // already on the first slide - stays there
    expect(service.getState().currentSlide).toMatchObject({ text: 'UM' })

    service.control('last')
    expect(service.getState().currentSlide).toMatchObject({ text: 'TRÊS' })
  })

  it('ends the presentation, clearing the upcoming list', async () => {
    const { service, events } = setup()
    await service.loadFile('p.pptx')
    service.control('start')
    events.length = 0

    service.control('end')

    // SlideReceiverService (shared with LouvorJA) only clears currentSlide/recentSlides when a
    // *different* presentation starts - the renderer store clears the stale slide from the UI
    // once `presentation` itself goes null (see powerpoint.store.ts).
    expect(service.getState().presentation).toBeNull()
    expect(service.getState().upcomingSlides).toEqual([])
    expect(events).toEqual(
      expect.arrayContaining([
        { kind: 'presentation', presentation: null },
        { kind: 'upcoming', slides: [] }
      ])
    )
  })

  it('ignores control actions while no file is loaded', () => {
    const { service, events } = setup()
    service.control('start')
    expect(service.getState().currentSlide).toBeNull()
    expect(events).toEqual([])
  })

  it('closes the previous file (best-effort) and ends its presentation when a different one is loaded', async () => {
    const { service, events, closeFile } = setup()
    await service.loadFile('a.pptx')
    service.control('start')
    events.length = 0

    await service.loadFile('b.pptx')

    expect(closeFile).toHaveBeenCalledWith('a.pptx')
    expect(events).toEqual(expect.arrayContaining([{ kind: 'presentation', presentation: null }]))
    expect(service.getState().presentation).toBeNull()
  })

  it('does not close anything when the same file is linked again', async () => {
    const { service, closeFile } = setup()
    await service.loadFile('a.pptx')
    await service.loadFile('a.pptx')
    expect(closeFile).not.toHaveBeenCalled()
  })

  it('survives (and ignores) a failure while closing the previous file', async () => {
    const db = openDatabase(':memory:')
    const loadFile = vi.fn().mockResolvedValue([{ index: 0, text: 'UM' }])
    const closeFile = vi.fn().mockRejectedValue(new Error('powershell not found'))
    const service = new PowerPointService({ db, loadFile, closeFile })
    await service.loadFile('a.pptx')

    await expect(service.loadFile('b.pptx')).resolves.toBeUndefined()
  })

  it('closes the open file on dispose', async () => {
    const { service, closeFile } = setup()
    await service.loadFile('a.pptx')
    service.dispose()
    expect(closeFile).toHaveBeenCalledWith('a.pptx')
  })
})
