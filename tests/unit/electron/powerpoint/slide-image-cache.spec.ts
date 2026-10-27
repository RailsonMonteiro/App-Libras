import { stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { PowerPointSlideImageCache } from '../../../../electron/services/powerpoint/PowerPointSlideImageCache'

const png = (label: string): Buffer => Buffer.from(`PNG\0${label}`, 'latin1')

/** Stands in for exportSlide.ps1: writes a canned PNG to outPath, as if COM had exported it. */
function fakeExport(bodies: Record<string, Buffer>, calls: string[]) {
  return vi.fn(async (path: string, index: number, outPath: string) => {
    const key = `${path}#${index}`
    calls.push(key)
    const body = bodies[key]
    if (!body) throw new Error('export failed')
    await writeFile(outPath, body)
  })
}

describe('PowerPointSlideImageCache', () => {
  it('exports a slide once and serves it from memory afterwards', async () => {
    const calls: string[] = []
    const cache = new PowerPointSlideImageCache({
      exportSlide: fakeExport({ 'p.pptx#1': png('um') }, calls)
    })
    cache.setFile('p.pptx')

    const first = await cache.get('p.pptx', 1)
    expect(first).toMatchObject({ status: 200 })
    const second = await cache.get('p.pptx', 1)
    expect(second).toMatchObject({ status: 200 })
    expect(calls).toEqual(['p.pptx#1'])
  })

  it('answers 404 for a presentation that is not the file currently loaded', async () => {
    const calls: string[] = []
    const cache = new PowerPointSlideImageCache({ exportSlide: fakeExport({}, calls) })
    cache.setFile('a.pptx')

    expect(await cache.get('b.pptx', 1)).toEqual({ status: 404 })
    expect(calls).toEqual([])
  })

  it('answers 404 while no file is loaded', async () => {
    const calls: string[] = []
    const cache = new PowerPointSlideImageCache({ exportSlide: fakeExport({}, calls) })
    expect(await cache.get('p.pptx', 1)).toEqual({ status: 404 })
  })

  it('rejects a malformed index without exporting anything', async () => {
    const calls: string[] = []
    const cache = new PowerPointSlideImageCache({ exportSlide: fakeExport({}, calls) })
    cache.setFile('p.pptx')

    expect(await cache.get('p.pptx', 0)).toEqual({ status: 400 })
    expect(await cache.get('p.pptx', -1)).toEqual({ status: 400 })
    expect(await cache.get('p.pptx', 1.5)).toEqual({ status: 400 })
    expect(calls).toEqual([])
  })

  it('answers 502 when the export fails, without caching anything', async () => {
    const calls: string[] = []
    const cache = new PowerPointSlideImageCache({ exportSlide: fakeExport({}, calls) })
    cache.setFile('p.pptx')

    expect(await cache.get('p.pptx', 1)).toEqual({ status: 502, message: 'export failed' })
    expect(await cache.get('p.pptx', 1)).toEqual({ status: 502, message: 'export failed' })
    expect(calls).toEqual(['p.pptx#1', 'p.pptx#1'])
  })

  it('shares one export between simultaneous requests for the same slide', async () => {
    const calls: string[] = []
    const cache = new PowerPointSlideImageCache({
      exportSlide: fakeExport({ 'p.pptx#1': png('um') }, calls)
    })
    cache.setFile('p.pptx')

    await Promise.all([cache.get('p.pptx', 1), cache.get('p.pptx', 1), cache.get('p.pptx', 1)])
    expect(calls).toEqual(['p.pptx#1'])
  })

  it('drops cached images once a different file is loaded', async () => {
    const calls: string[] = []
    const cache = new PowerPointSlideImageCache({
      exportSlide: fakeExport({ 'a.pptx#1': png('a'), 'b.pptx#1': png('b') }, calls)
    })

    cache.setFile('a.pptx')
    await cache.get('a.pptx', 1)

    cache.setFile('b.pptx')
    expect(await cache.get('a.pptx', 1)).toEqual({ status: 404 })
    await cache.get('b.pptx', 1)
    expect(calls).toEqual(['a.pptx#1', 'b.pptx#1'])
  })

  it('keeps the cache when the same file is set again', async () => {
    const calls: string[] = []
    const cache = new PowerPointSlideImageCache({
      exportSlide: fakeExport({ 'p.pptx#1': png('um') }, calls)
    })
    cache.setFile('p.pptx')
    await cache.get('p.pptx', 1)

    cache.setFile('p.pptx')
    expect(await cache.get('p.pptx', 1)).toMatchObject({ status: 200 })
    expect(calls).toEqual(['p.pptx#1'])
  })

  it('exports different slides one at a time, never overlapping', async () => {
    // Each export only resolves once told to - if two ran concurrently, "slide 2 started" would
    // appear before "slide 1 finished".
    const resolvers: Record<number, () => void> = {}
    const order: string[] = []
    const exportSlide = vi.fn(
      (_path: string, index: number, outPath: string) =>
        new Promise<void>((resolve) => {
          order.push(`slide ${index} started`)
          resolvers[index] = () => writeFile(outPath, png(`slide${index}`)).then(resolve)
        })
    )
    const cache = new PowerPointSlideImageCache({ exportSlide })
    cache.setFile('p.pptx')

    const first = cache.get('p.pptx', 1)
    const second = cache.get('p.pptx', 2)
    await Promise.resolve() // let both get() calls reach the queue
    expect(order).toEqual(['slide 1 started']) // slide 2 must not have started yet

    resolvers[1]?.()
    await first
    expect(order).toEqual(['slide 1 started', 'slide 2 started'])

    resolvers[2]?.()
    await second
  })

  it('answers 502 instead of hanging forever when an export never settles', async () => {
    vi.useFakeTimers()
    try {
      const cache = new PowerPointSlideImageCache({
        exportSlide: () => new Promise<void>(() => undefined) // never resolves or rejects
      })
      cache.setFile('p.pptx')

      const result = cache.get('p.pptx', 1)
      await vi.advanceTimersByTimeAsync(30_000)
      expect(await result).toMatchObject({ status: 502 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('cleans up its temporary file either way', async () => {
    let capturedPath = ''
    const exportSlide = vi.fn(async (_path: string, _index: number, outPath: string) => {
      capturedPath = outPath
      await writeFile(outPath, png('x'))
    })
    const cache = new PowerPointSlideImageCache({ exportSlide })
    cache.setFile('p.pptx')
    await cache.get('p.pptx', 1)

    expect(capturedPath.startsWith(tmpdir())).toBe(true)
    await expect(stat(capturedPath)).rejects.toThrow()
  })
})
