import { z } from 'zod'
import type {
  Endpoint,
  LouvorJAEvent,
  ServerInfo,
  SlideKind
} from '../../../../src/modules/louvorja/types/louvorja.types'
import { ConnectionError, type LouvorJAAdapter } from './LouvorJAAdapter'
import { describeError } from './errorDetail'

/**
 * Talks to LouvorJA Flute's own server (`electron/services/streaming-server.ts` in its source,
 * read directly - "D:\Meus Projetos\LouvorJA-Flute" - not guessed). A from-scratch rewrite, not
 * a copy of the original LouvorJA's wire format: no `/api/v2/*` namespace at all, the token can
 * be read from a `?token=` query or an `api-token` header (never `Authorization`, so the "Token
 * recusado" bug that affects the original LouvorJA cannot happen here) - this adapter only ever
 * sends it in the query string anyway, the same policy every adapter in this app follows now.
 *
 * `/api/ping` answers `{status,app:"LouvorJA",running,tokenRequired}` - `running`/`tokenRequired`
 * are the tell that distinguishes it from the original LouvorJA's v1 (`{status,app:"LouvorJA"}`,
 * nothing else) and from violin-app's (`authorized`/`permissions` instead) - see
 * `createAdapter.ts`'s `probe()`.
 *
 * `/api/status` hands back the whole slide object in one request (no SSE client here, even
 * though Flute also offers `/api/events` - polled, same as the original LouvorJA, as cheap as
 * polling gets) - but it never actually checks the token at all (read the real source: the
 * token check only runs for routes reached *after* `/api/status` already returned). `/api/verify-
 * token` is the one route that does check it, so `connect()` calls that first - otherwise a
 * wrong token would silently "work" forever instead of being reported.
 */

export interface LouvorJAFluteAdapterOptions {
  /** Time between the end of one poll and the start of the next. */
  pollIntervalMs?: number
  requestTimeoutMs?: number
  /** Consecutive polls that cannot reach the server before the connection is called lost. */
  maxFailures?: number
  onWarning?: (message: string) => void
  now?: () => Date
}

const pingEnvelope = z.looseObject({
  app: z.string().optional(),
  running: z.boolean().optional(),
  tokenRequired: z.boolean().optional()
})
const verifyEnvelope = z.looseObject({ valid: z.boolean().optional() })

const slideData = z.looseObject({
  type: z.enum(['media', 'bible', 'idle']).optional(),
  slideIndex: z.number().optional(),
  totalSlides: z.number().optional(),
  currentLyric: z.string().optional(),
  nextLyric: z.string().optional(),
  bibleText: z.string().optional(),
  bibleReference: z.string().optional()
})
const statusEnvelope = z.looseObject({ status: z.string().optional(), data: slideData.optional() })

/** What is being shown right now. */
type Observed =
  | { kind: 'none' }
  | {
      kind: 'song'
      text: string
      nextText: string | null
      index: number | null
      total: number | null
    }
  | { kind: 'bible'; text: string; reference: string }

interface OpenPresentation {
  id: string
  kind: 'song' | 'bible'
}

export class LouvorJAFluteAdapter implements LouvorJAAdapter {
  private eventListener: ((event: LouvorJAEvent) => void) | null = null
  private closeListener: ((error: ConnectionError) => void) | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = true
  private failures = 0

  private presentation: OpenPresentation | null = null
  private presentationCount = 0
  private slideCount = 0
  private lastSlideKey: string | null = null

  constructor(
    private readonly endpoint: Endpoint,
    private readonly options: LouvorJAFluteAdapterOptions = {}
  ) {}

  onEvent(listener: (event: LouvorJAEvent) => void): void {
    this.eventListener = listener
  }

  onClose(listener: (error: ConnectionError) => void): void {
    this.closeListener = listener
  }

  describe(): ServerInfo {
    return { version: null, protocol: 'flute' }
  }

  async connect(): Promise<void> {
    const reply = await this.request(pingEnvelope, '/api/ping')
    if (reply.status !== 200 || reply.body?.app !== 'LouvorJA') {
      throw new ConnectionError('incompatible', 'the answer to ping is not from LouvorJA')
    }

    // /api/status itself never checks the token (see the class doc) - this is the one request
    // that actually does, so a wrong token is caught now rather than never.
    const verify = await this.request(verifyEnvelope, '/api/verify-token')
    if (verify.status !== 200 || verify.body?.valid === false) {
      throw new ConnectionError('unauthorized')
    }

    this.stopped = false
    await this.poll(true)
  }

  disconnect(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  // --- polling ---

  private schedule(): void {
    if (this.stopped) return
    this.timer = setTimeout(() => void this.poll(false), this.options.pollIntervalMs ?? 700)
  }

  /** `first` is the poll inside connect(): its errors must reach connect()'s caller. */
  private async poll(first: boolean): Promise<void> {
    try {
      this.publish(await this.observe())
      this.failures = 0
    } catch (error) {
      if (first) throw error
      const failure = error instanceof ConnectionError ? error : new ConnectionError('closed')
      if (failure.fatal) return this.lose(failure)

      this.failures += 1
      if (this.failures >= (this.options.maxFailures ?? 3)) return this.lose(failure)
    }
    this.schedule()
  }

  private lose(error: ConnectionError): void {
    this.stopped = true
    this.closeListener?.(error)
  }

  /** Asks LouvorJA Flute what is on screen - one request, the whole slide object back. */
  private async observe(): Promise<Observed> {
    const reply = await this.request(statusEnvelope, '/api/status')
    if (reply.status !== 200 || !reply.body) {
      this.options.onWarning?.(`Unexpected answer to /api/status (HTTP ${reply.status})`)
      return { kind: 'none' }
    }

    const data = reply.body.data
    if (data?.type === 'media') {
      const text = tidy(stripHtml(data.currentLyric ?? ''))
      if (!text) return { kind: 'none' }
      const nextText = data.nextLyric ? tidy(stripHtml(data.nextLyric)) || null : null
      return {
        kind: 'song',
        text,
        nextText,
        index: data.slideIndex ?? null,
        total: data.totalSlides ?? null
      }
    }
    if (data?.type === 'bible') {
      const text = tidy(stripHtml(data.bibleText ?? ''))
      if (!text) return { kind: 'none' }
      return { kind: 'bible', text, reference: tidy(stripHtml(data.bibleReference ?? '')) }
    }
    return { kind: 'none' }
  }

  // --- turning observations into events ---

  private publish(observed: Observed): void {
    if (observed.kind === 'none') {
      this.endPresentation()
      return
    }

    if (this.presentation?.kind !== observed.kind) {
      this.endPresentation()
      this.startPresentation(observed)
    }

    const title = observed.kind === 'bible' ? observed.reference || null : null
    const key = `${observed.kind}|${observed.text}|${title ?? ''}`
    if (key === this.lastSlideKey) return
    this.lastSlideKey = key

    const kind: SlideKind = observed.kind === 'bible' ? 'verse' : 'lyrics'
    this.eventListener?.({
      type: 'slide',
      slide: {
        id: `${this.presentation!.id}:${++this.slideCount}`,
        presentationId: this.presentation!.id,
        index: observed.kind === 'song' ? observed.index : null,
        total: observed.kind === 'song' ? observed.total : null,
        title,
        text: observed.text,
        nextText: observed.kind === 'song' ? observed.nextText : null,
        kind,
        receivedAt: this.at()
      }
    })
  }

  private startPresentation(observed: Extract<Observed, { kind: 'song' | 'bible' }>): void {
    const id = `${observed.kind}-${++this.presentationCount}`
    this.presentation = { id, kind: observed.kind }
    this.slideCount = 0
    // A song opens on its cover slide, whose first line is the song title - same convention as
    // the original LouvorJA and violin-app.
    const title = observed.kind === 'song' ? (observed.text.split('\n')[0] ?? '') : ''
    this.eventListener?.({
      type: 'presentation-started',
      presentation: { id, title, startedAt: this.at() }
    })
  }

  private endPresentation(): void {
    if (!this.presentation) return
    this.eventListener?.({ type: 'presentation-ended', presentationId: this.presentation.id })
    this.presentation = null
    this.lastSlideKey = null
  }

  private at(): string {
    return (this.options.now?.() ?? new Date()).toISOString()
  }

  // --- HTTP ---

  private async request<S extends z.ZodType>(
    schema: S,
    path: string
  ): Promise<{ status: number; body: z.infer<S> | null }> {
    const { host, port, token } = this.endpoint
    const url = new URL(`http://${host}:${port}${path}`)
    if (token) url.searchParams.set('token', token)

    let response: Response
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.requestTimeoutMs ?? 8000)
      })
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') throw new ConnectionError('timeout')
      const detail = describeError(error)
      this.options.onWarning?.(`Could not reach ${host}:${port}${path}: ${detail}`)
      throw new ConnectionError('unreachable', detail)
    }

    if (response.status === 401) throw new ConnectionError('unauthorized')

    const parsed = schema.safeParse(await response.json().catch(() => null))
    return { status: response.status, body: parsed.success ? parsed.data : null }
  }
}

/** Flute keeps line breaks as `<br>`, same as the original LouvorJA and violin-app. */
function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
}

/** Trims and unifies line breaks (the text may end with stray blanks). */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}
