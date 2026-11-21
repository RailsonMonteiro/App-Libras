import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../../electron/services/DatabaseService'
import { PowerPointService } from '../../../electron/services/powerpoint/PowerPointService'
import type { PowerPointPushEvent } from '../../../electron/services/powerpoint/PowerPointService'
import type { PowerPointSlideImageCache } from '../../../electron/services/powerpoint/PowerPointSlideImageCache'
import type {
  PptxSlideText,
  ShowPosition
} from '../../../electron/services/powerpoint/powerpointCom'
import type { PowerPointAction } from '../../../src/types/ipc'

/** A stand-in for PowerPoint's own slide show, driven the way sendCommand.ps1 drives it. */
function fakeSlideShow(total: number, startAt: number | null = null) {
  let index = startAt
  return {
    get index() {
      return index
    },
    send: vi.fn(async (_path: string, action: PowerPointAction): Promise<ShowPosition> => {
      if (action === 'start' && index === null) index = 1
      else if (action === 'end') index = null
      else if (index !== null) {
        if (action === 'next') index = Math.min(index + 1, total + 1) // +1: the black end screen
        if (action === 'previous') index = Math.max(index - 1, 1)
        if (action === 'first') index = 1
        if (action === 'last') index = total
      }
      return { presenting: index !== null, index }
    })
  }
}

function setup(
  texts: PptxSlideText[] = [
    { index: 0, text: 'UM' },
    { index: 1, text: 'DOIS' }
  ],
  showIndex: number | null = null
) {
  const db = openDatabase(':memory:')
  const slideImages = { setFile: vi.fn() } as unknown as PowerPointSlideImageCache
  const show = fakeSlideShow(texts.length, showIndex)
  // A fresh copy each time, like a real read - the service fills OCR text into what it gets.
  const readOpen = vi.fn(async () => ({
    slides: texts.map((slide) => ({ ...slide })),
    showIndex: show.index
  }))
  const listOpen = vi.fn().mockResolvedValue([{ path: 'C:/culto.pptx', name: 'culto.pptx' }])
  const ocrTexts = new Map<number, string>()
  const ocrSlides = vi.fn(
    async (_path: string, indexes: number[], onSlide: (slide: PptxSlideText) => void) => {
      for (const index of indexes) onSlide({ index, text: ocrTexts.get(index) ?? '' })
    }
  )
  const service = new PowerPointService({
    db,
    slideImages,
    readOpen,
    listOpen,
    sendCommand: show.send,
    showPosition: (path) => show.send(path, 'position' as PowerPointAction),
    ocrSlides
  })
  const events: PowerPointPushEvent[] = []
  service.onEvent((event) => events.push(event))
  return { service, events, slideImages, readOpen, listOpen, show, ocrSlides, ocrTexts }
}

const pictureSlides: PptxSlideText[] = [
  { index: 0, text: '' },
  { index: 1, text: 'TÍTULO' },
  { index: 2, text: '' }
]

describe('PowerPointService', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('has nothing linked at first', () => {
    const { service } = setup()
    expect(service.getState()).toMatchObject({
      presentation: null,
      currentSlide: null,
      linkedPath: null
    })
    expect(service.getLink()).toEqual({ linked: false, presenting: false })
  })

  it('lists what PowerPoint has open', async () => {
    const { service, listOpen } = setup()
    await expect(service.listOpen()).resolves.toEqual([
      { path: 'C:/culto.pptx', name: 'culto.pptx' }
    ])
    expect(listOpen).toHaveBeenCalled()
  })

  it('links an open presentation and reads its slides, without starting the slide show', async () => {
    const { service, readOpen, slideImages, show } = setup()
    await service.link('C:/culto.pptx')

    expect(readOpen).toHaveBeenCalledWith('C:/culto.pptx')
    expect(slideImages.setFile).toHaveBeenLastCalledWith('C:/culto.pptx')
    expect(show.send).not.toHaveBeenCalled()
    expect(service.getState()).toMatchObject({
      presentation: null,
      currentSlide: null,
      linkedPath: 'C:/culto.pptx'
    })
    expect(service.getLink()).toEqual({ linked: true, presenting: false })
  })

  it('picks up a slide show already running in PowerPoint when linking', async () => {
    const { service } = setup(undefined, 2)
    await service.link('C:/culto.pptx')

    expect(service.getState().currentSlide).toMatchObject({ text: 'DOIS', index: 1 })
    expect(service.getLink()).toEqual({ linked: true, presenting: true })
  })

  it('starts the slide show and follows it, reporting the rest as upcoming', async () => {
    const { service, events, show } = setup()
    await service.link('C:/culto.pptx')
    events.length = 0

    await service.control('start')

    expect(show.send).toHaveBeenCalledWith('C:/culto.pptx', 'start')
    expect(service.getState()).toMatchObject({
      presentation: { id: 'C:/culto.pptx', title: 'culto.pptx' },
      currentSlide: { text: 'UM', index: 0, total: 2 },
      upcomingSlides: [{ index: 1, text: 'DOIS' }]
    })
    expect(events.map((e) => e.kind)).toEqual(['presentation', 'slide', 'upcoming'])
    expect(service.getLink()).toEqual({ linked: true, presenting: true })
  })

  it('follows next/previous/first/last wherever PowerPoint ends up', async () => {
    const { service } = setup([
      { index: 0, text: 'UM' },
      { index: 1, text: 'DOIS' },
      { index: 2, text: 'TRÊS' }
    ])
    await service.link('p.pptx')

    await service.control('start')
    await service.control('next')
    expect(service.getState().currentSlide).toMatchObject({ text: 'DOIS' })

    await service.control('next')
    await service.control('next') // PowerPoint's black end screen - stays on the last slide
    expect(service.getState().currentSlide).toMatchObject({ text: 'TRÊS' })
    expect(service.getState().upcomingSlides).toEqual([])

    await service.control('previous')
    await service.control('previous')
    expect(service.getState().currentSlide).toMatchObject({ text: 'DOIS' })

    await service.control('first')
    expect(service.getState().currentSlide).toMatchObject({ text: 'UM' })

    await service.control('last')
    expect(service.getState().currentSlide).toMatchObject({ text: 'TRÊS' })
  })

  it('stops following when the slide show ends, clearing the upcoming list', async () => {
    const { service, events } = setup()
    await service.link('p.pptx')
    await service.control('start')
    events.length = 0

    await service.control('end')

    expect(service.getState().presentation).toBeNull()
    expect(service.getState().upcomingSlides).toEqual([])
    expect(events).toEqual(
      expect.arrayContaining([
        { kind: 'presentation', presentation: null },
        { kind: 'upcoming', slides: [] }
      ])
    )
    expect(service.getLink()).toEqual({ linked: true, presenting: false })
  })

  it('ignores control actions while nothing is linked', async () => {
    const { service, events, show } = setup()
    await service.control('start')
    expect(show.send).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('logs and keeps its state when PowerPoint rejects a command', async () => {
    const db = openDatabase(':memory:')
    const logs = { warn: vi.fn() }
    const service = new PowerPointService({
      db,
      logs: logs as never,
      readOpen: async () => ({ slides: [{ index: 0, text: 'UM' }], showIndex: 1 }),
      sendCommand: vi.fn().mockRejectedValue(new Error('not open'))
    })
    await service.link('a.pptx')

    await expect(service.control('next')).resolves.toBeUndefined()

    expect(logs.warn).toHaveBeenCalled()
    expect(service.getState().currentSlide).toMatchObject({ text: 'UM' })
  })

  it('ends the previous slide show tracking when another presentation is linked', async () => {
    const { service, events } = setup()
    await service.link('a.pptx')
    await service.control('start')
    events.length = 0

    await service.link('b.pptx')

    expect(events).toEqual(expect.arrayContaining([{ kind: 'presentation', presentation: null }]))
    expect(service.getState().linkedPath).toBe('b.pptx')
  })

  it('forgets the previous presentation when the new one cannot be read', async () => {
    const { service, readOpen, slideImages, show } = setup()
    await service.link('a.pptx')
    readOpen.mockRejectedValueOnce(new Error('not open'))

    await expect(service.link('b.pptx')).rejects.toThrow('not open')

    expect(slideImages.setFile).toHaveBeenLastCalledWith(null)
    expect(service.getState().linkedPath).toBeNull()
    await service.control('start') // nothing linked any more - must not drive a.pptx
    expect(show.send).not.toHaveBeenCalled()
  })

  it('follows a slide show PowerPoint moved by itself, without sending it anything', async () => {
    const { service, show } = setup()
    await service.link('p.pptx')
    await service.control('start')
    await show.send('p.pptx', 'next') // PowerPoint acted on a key itself, behind the app's back
    show.send.mockClear()

    await service.sync()

    expect(show.send.mock.calls.map(([, action]) => action)).toEqual(['position'])
    expect(service.getState().currentSlide).toMatchObject({ text: 'DOIS' })
  })

  it('reads the text of picture-only slides (OCR) and translates the one on the air', async () => {
    const { service, events, ocrSlides, ocrTexts } = setup(pictureSlides, 1)
    ocrTexts.set(0, 'FERIDAS')
    ocrTexts.set(2, 'EFÉSIOS 4:32')

    await service.link('p.pptx')
    await vi.runAllTimersAsync()

    expect(ocrSlides).toHaveBeenCalledWith(
      'p.pptx',
      [0, 2],
      expect.any(Function),
      expect.anything()
    )
    expect(service.getState().currentSlide).toMatchObject({ index: 0, text: 'FERIDAS' })
    expect(service.getState().upcomingSlides).toEqual([
      { index: 1, text: 'TÍTULO' },
      { index: 2, text: 'EFÉSIOS 4:32' }
    ])
    expect(service.getState().ocr).toBeNull()
    expect(events).toContainEqual({ kind: 'ocr', progress: { done: 0, total: 2 } })
    expect(events).toContainEqual({ kind: 'ocr', progress: null })
  })

  it('reads from the slide on the air onwards first', async () => {
    const { service, ocrSlides } = setup(pictureSlides, 3)
    await service.link('p.pptx')
    expect(ocrSlides.mock.calls[0]![1]).toEqual([2, 0])
  })

  it('does not read the same presentation again when it is linked again', async () => {
    const { service, ocrSlides, ocrTexts } = setup(pictureSlides)
    ocrTexts.set(0, 'FERIDAS')
    await service.link('p.pptx')
    await vi.runAllTimersAsync()

    await service.link('p.pptx')
    await service.control('start')

    expect(ocrSlides).toHaveBeenCalledTimes(1)
    expect(service.getState().currentSlide).toMatchObject({ text: 'FERIDAS' })
  })

  it('logs an OCR failure and keeps going without it', async () => {
    const db = openDatabase(':memory:')
    const logs = { warn: vi.fn() }
    const service = new PowerPointService({
      db,
      logs: logs as never,
      readOpen: async () => ({ slides: [{ index: 0, text: '' }], showIndex: null }),
      ocrSlides: vi.fn().mockRejectedValue(new Error('No OCR language installed'))
    })

    await service.link('a.pptx')
    await vi.runAllTimersAsync()

    expect(logs.warn).toHaveBeenCalledWith('powerpoint', 'Reading slide images failed', {
      error: 'No OCR language installed'
    })
    expect(service.getState().ocr).toBeNull()
    expect(service.getState().linkedPath).toBe('a.pptx')
  })

  it('notifies link changes (what the presenter remote shortcuts follow)', async () => {
    const { service } = setup()
    const states: Array<{ linked: boolean; presenting: boolean }> = []
    service.onLinkChange(() => states.push(service.getLink()))

    await service.link('a.pptx')
    await service.control('start')
    await service.control('end')

    expect(states).toEqual([
      { linked: false, presenting: false },
      { linked: true, presenting: false },
      { linked: true, presenting: true },
      { linked: true, presenting: false }
    ])
  })
})
