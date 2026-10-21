import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LouvorJAFluteAdapter } from '../../../electron/services/louvorja/adapters/LouvorJAFluteAdapter'
import type { Endpoint, LouvorJAEvent } from '../../../src/modules/louvorja/types/louvorja.types'

interface SlideData {
  type: 'media' | 'bible' | 'idle'
  slideIndex?: number
  totalSlides?: number
  currentLyric?: string
  nextLyric?: string
  bibleText?: string
  bibleReference?: string
}

interface Harness {
  host: string
  port: number
  playSong(slides: string[]): void
  nextSlide(): void
  stopSong(): void
  showVerse(verse: { text: string; reference: string }): void
  clearVerse(): void
  close(): Promise<void>
}

/** A bare-bones stand-in for LouvorJA Flute's own server (`electron/services/streaming-
 *  server.ts` in its source) - just `/api/ping` and `/api/status`, the only two routes
 *  `LouvorJAFluteAdapter` actually reads. */
function startMock(options: { token?: string } = {}): Promise<Harness> {
  let slides: string[] = []
  let index = 0
  let data: SlideData = { type: 'idle' }

  const setSong = (): void => {
    data = {
      type: 'media',
      slideIndex: index,
      totalSlides: slides.length,
      currentLyric: slides[index]?.replace(/\n/g, '<br>') ?? '',
      nextLyric: slides[index + 1]?.replace(/\n/g, '<br>') ?? ''
    }
  }

  return new Promise((resolve) => {
    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.pathname === '/api/ping') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({ status: 'ok', app: 'LouvorJA', running: true, tokenRequired: false })
        )
        return
      }
      // The real server never checks the token for /api/status itself - only /api/verify-token
      // (and the control routes this adapter never calls) actually do.
      const tokenMismatches = options.token && url.searchParams.get('token') !== options.token
      if (url.pathname === '/api/verify-token') {
        if (tokenMismatches) {
          res.writeHead(401, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ status: 'error', valid: false }))
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok', valid: true }))
        return
      }
      if (url.pathname === '/api/status') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok', data }))
        return
      }
      res.writeHead(404).end()
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      const harness: Harness = {
        host: '127.0.0.1',
        port,
        playSong: (newSlides) => {
          slides = newSlides
          index = 0
          setSong()
        },
        nextSlide: () => {
          index += 1
          setSong()
        },
        stopSong: () => {
          slides = []
          index = 0
          data = { type: 'idle' }
        },
        showVerse: (verse) => {
          data = { type: 'bible', bibleText: verse.text, bibleReference: verse.reference }
        },
        clearVerse: () => {
          data = { type: 'idle' }
        },
        close: () => new Promise((r) => server.close(() => r()))
      }
      harnesses.push(harness)
      resolve(harness)
    })
  })
}

const harnesses: Harness[] = []
const adapters: LouvorJAFluteAdapter[] = []

function adapterFor(
  target: { host: string; port: number },
  token = ''
): { adapter: LouvorJAFluteAdapter; events: LouvorJAEvent[] } {
  const endpoint: Endpoint = { host: target.host, port: target.port, token }
  const adapter = new LouvorJAFluteAdapter(endpoint, { pollIntervalMs: 20, requestTimeoutMs: 2000 })
  adapters.push(adapter)
  const events: LouvorJAEvent[] = []
  adapter.onEvent((event) => events.push(event))
  return { adapter, events }
}

const slides = (events: LouvorJAEvent[]) =>
  events.flatMap((event) => (event.type === 'slide' ? [event.slide] : []))

afterEach(async () => {
  adapters.splice(0).forEach((adapter) => adapter.disconnect())
  await Promise.all(harnesses.splice(0).map((h) => h.close()))
})

describe('LouvorJAFluteAdapter', () => {
  it('reports the song on screen from /api/status, with index/total and the next slide known ahead', async () => {
    const server = await startMock()
    const { adapter, events } = adapterFor(server)
    server.playSong(['PRIMEIRA LINHA\nSEGUNDA LINHA', 'CORO'])
    await adapter.connect()

    expect(slides(events)).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'presentation-started',
      presentation: { title: 'PRIMEIRA LINHA' }
    })
    expect(slides(events)[0]).toMatchObject({
      kind: 'lyrics',
      text: 'PRIMEIRA LINHA\nSEGUNDA LINHA',
      nextText: 'CORO',
      index: 0,
      total: 2
    })
  })

  it('does not repeat the same slide twice', async () => {
    const server = await startMock()
    server.playSong(['IGUAL'])
    const { adapter, events } = adapterFor(server)
    await adapter.connect()
    await new Promise((r) => setTimeout(r, 80))

    expect(slides(events)).toHaveLength(1)
  })

  it('moves to the next slide and updates index/total', async () => {
    const server = await startMock()
    server.playSong(['UM', 'DOIS', 'TRÊS'])
    const { adapter, events } = adapterFor(server)
    await adapter.connect()

    server.nextSlide()
    await vi.waitFor(() => expect(slides(events)).toHaveLength(2))
    expect(slides(events)[1]).toMatchObject({ text: 'DOIS', index: 1, total: 3, nextText: 'TRÊS' })
  })

  it('ends the presentation when the song closes, and starts a new one later', async () => {
    const server = await startMock()
    server.playSong(['UM'])
    const { adapter, events } = adapterFor(server)
    await adapter.connect()

    server.stopSong()
    await vi.waitFor(() =>
      expect(events.map((e) => e.type)).toEqual([
        'presentation-started',
        'slide',
        'presentation-ended'
      ])
    )

    server.playSong(['DOIS'])
    await vi.waitFor(() => expect(events).toHaveLength(5))
    expect(events[3]).toMatchObject({
      type: 'presentation-started',
      presentation: { title: 'DOIS' }
    })
  })

  it('reports a bible verse, and ends the presentation when it is cleared', async () => {
    const server = await startMock()
    server.showVerse({ text: 'No princípio...', reference: 'Gênesis 1:1' })
    const { adapter, events } = adapterFor(server)
    await adapter.connect()

    expect(slides(events)[0]).toMatchObject({
      kind: 'verse',
      text: 'No princípio...',
      title: 'Gênesis 1:1'
    })

    server.clearVerse()
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe('presentation-ended'))
  })

  it('rejects a wrong token as unauthorized', async () => {
    const server = await startMock({ token: 'AB12c' })
    const { adapter } = adapterFor(server, 'WRONG')
    await expect(adapter.connect()).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('connects with the right token, sent only in the query string', async () => {
    const server = await startMock({ token: 'AB12c' })
    server.playSong(['UM'])
    const { adapter, events } = adapterFor(server, 'AB12c')
    await adapter.connect()
    expect(slides(events)).toHaveLength(1)
  })
})
