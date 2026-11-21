import type { DatabaseSync } from 'node:sqlite'
import type {
  OcrProgress,
  OpenPresentation,
  PowerPointAction,
  UpcomingSlide
} from '../../../src/types/ipc'
import type { Presentation, Slide } from '../../../src/types/presentation'
import type { LogService } from '../LogService'
import { PresentationRepository } from '../louvorja/PresentationRepository'
import { SlideReceiverService } from '../louvorja/SlideReceiverService'
import {
  runListOpen,
  runOcrSlides,
  runReadOpen,
  runSendCommand,
  runShowPosition,
  type LinkedPresentation,
  type PptxSlideText,
  type ShowPosition
} from './powerpointCom'
import type { PowerPointSlideImageCache } from './PowerPointSlideImageCache'

export interface PowerPointState {
  presentation: Presentation | null
  currentSlide: Slide | null
  recentSlides: Slide[]
  upcomingSlides: UpcomingSlide[]
  linkedPath: string | null
  ocr: OcrProgress | null
}

export type PowerPointPushEvent =
  | { kind: 'presentation'; presentation: Presentation | null }
  | { kind: 'slide'; slide: Slide }
  | { kind: 'upcoming'; slides: UpcomingSlide[] }
  | { kind: 'ocr'; progress: OcrProgress | null }

export interface PowerPointServiceOptions {
  db: DatabaseSync
  logs?: LogService
  /** Shared with main/protocol.ts, which serves its images through `app://renderer/...`. */
  slideImages?: PowerPointSlideImageCache
  /** Injected in tests; the defaults talk to PowerPoint via COM (see powerpointCom.ts). */
  listOpen?: () => Promise<OpenPresentation[]>
  readOpen?: (path: string) => Promise<LinkedPresentation>
  sendCommand?: (path: string, action: PowerPointAction) => Promise<ShowPosition>
  showPosition?: (path: string) => Promise<ShowPosition>
  ocrSlides?: (
    path: string,
    indexes: number[],
    onSlide: (slide: PptxSlideText) => void,
    signal?: AbortSignal
  ) => Promise<void>
}

/**
 * Facade for a presentation the person already has open in their own PowerPoint, linked to the
 * app: PowerPoint shows it on the projector itself (its own slide show), the app drives that slide
 * show (its buttons, and the presenter remote - see PresenterRemote) and follows the slide it is
 * on, for the translation into Libras. Deliberately independent from LouvorJAService: no
 * endpoint, no retry/backoff, no "last connection". Never opens or closes the presentation - it
 * is the person's.
 */
export class PowerPointService {
  readonly slides: SlideReceiverService
  private readonly presentations: PresentationRepository
  private readonly listeners = new Set<(event: PowerPointPushEvent) => void>()
  private readonly slideImages: PowerPointSlideImageCache | undefined
  private readonly logs: LogService | undefined
  private readonly listOpenFn: () => Promise<OpenPresentation[]>
  private readonly readOpenFn: (path: string) => Promise<LinkedPresentation>
  private readonly sendCommandFn: (path: string, action: PowerPointAction) => Promise<ShowPosition>
  private readonly showPositionFn: (path: string) => Promise<ShowPosition>

  /** The linked presentation's slide texts, read in full when it is linked. */
  private file: { path: string; title: string; texts: PptxSlideText[] } | null = null
  /** 1-based slide PowerPoint's slide show is on; `null` while it is not presenting. */
  private currentIndex: number | null = null
  private readonly linkListeners = new Set<() => void>()
  private readonly ocrSlidesFn: NonNullable<PowerPointServiceOptions['ocrSlides']>
  /** Reading slide images (OCR) in progress, if any. */
  private ocr: OcrProgress | null = null
  private ocrAbort: AbortController | null = null
  /** path -> slide index (0-based) -> text read from its image (may be empty). */
  private readonly ocrCache = new Map<string, Map<number, string>>()

  constructor(options: PowerPointServiceOptions) {
    this.presentations = new PresentationRepository(options.db, 'powerpoint')
    this.slides = new SlideReceiverService(this.presentations)
    this.slideImages = options.slideImages
    this.logs = options.logs
    this.listOpenFn = options.listOpen ?? runListOpen
    this.readOpenFn = options.readOpen ?? runReadOpen
    this.sendCommandFn = options.sendCommand ?? runSendCommand
    this.showPositionFn = options.showPosition ?? runShowPosition
    this.ocrSlidesFn = options.ocrSlides ?? runOcrSlides

    this.slides.onPresentation((p) => this.emit({ kind: 'presentation', presentation: p }))
    this.slides.onSlide((slide) => this.emit({ kind: 'slide', slide }))
  }

  getState(): PowerPointState {
    return {
      presentation: this.slides.getPresentation(),
      currentSlide: this.slides.getCurrentSlide(),
      recentSlides: this.slides.getRecentSlides(),
      upcomingSlides: this.getUpcoming(),
      linkedPath: this.file?.path ?? null,
      ocr: this.ocr
    }
  }

  /** Whether a presentation is linked, and whether its slide show is running - what decides
   *  what the presenter remote's keys may do (see PresenterRemote). */
  getLink(): { linked: boolean; presenting: boolean } {
    return { linked: this.file !== null, presenting: this.currentIndex !== null }
  }

  /** Called whenever getLink() may have changed. */
  onLinkChange(listener: () => void): () => void {
    this.linkListeners.add(listener)
    return () => this.linkListeners.delete(listener)
  }

  async listOpen(): Promise<OpenPresentation[]> {
    return this.listOpenFn()
  }

  /** Links this open presentation and reads every slide's text. Already presenting in PowerPoint:
   *  the app picks the slide show up right where it is. */
  async link(path: string): Promise<void> {
    this.endTracking()
    // Forgotten before reading the new one, not after: if it is no longer open, nothing should
    // still point at the previous one.
    this.ocrAbort?.abort()
    this.ocrAbort = null
    if (this.ocr) this.setOcr(null)
    this.file = null
    this.slideImages?.setFile(null)
    this.notifyLink()

    const linked = await this.readOpenFn(path)
    this.file = { path, title: titleOf(path), texts: linked.slides }
    this.slideImages?.setFile(path)
    if (linked.showIndex !== null) this.goTo(linked.showIndex)
    this.notifyLink()
    this.startOcr()
  }

  /** Drives the linked presentation's slide show, then follows wherever PowerPoint ended up. */
  async control(action: PowerPointAction): Promise<void> {
    if (!this.file) return
    await this.follow(action, (path) => this.sendCommandFn(path, action))
  }

  /** Follows the slide show without changing it - PowerPoint already acted on a key by itself
   *  (its slide show window was in front). */
  async sync(): Promise<void> {
    if (!this.file) return
    await this.follow('position', (path) => this.showPositionFn(path))
  }

  private async follow(
    command: string,
    run: (path: string) => Promise<ShowPosition>
  ): Promise<void> {
    if (!this.file) return
    let position: ShowPosition
    try {
      position = await run(this.file.path)
    } catch (error) {
      this.logs?.warn('powerpoint', 'Slide show command failed', {
        command,
        error: error instanceof Error ? error.message : String(error)
      })
      return
    }

    if (position.presenting && position.index !== null) this.goTo(position.index)
    else this.endTracking()
    this.notifyLink()
  }

  /** Housekeeping run at startup. */
  prune(days = 30): void {
    this.presentations.prune(days)
  }

  onEvent(listener: (event: PowerPointPushEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.ocrAbort?.abort()
    this.listeners.clear()
    this.linkListeners.clear()
  }

  /**
   * Reads, in the background, the text drawn inside the slides that have none of their own (a
   * slide made of a single picture) - see ocrSlides.ps1. Starts from the slide the show is on, so
   * the one on the air is translated first; each slide is used as soon as it is read. Results are
   * kept for the session, so linking the same presentation again does not read it again.
   */
  private startOcr(): void {
    this.ocrAbort?.abort()
    this.ocrAbort = null
    const file = this.file
    if (!file) return this.setOcr(null)

    const cached = this.ocrCache.get(file.path) ?? new Map<number, string>()
    this.ocrCache.set(file.path, cached)
    for (const entry of file.texts) {
      if (!entry.text && cached.has(entry.index)) entry.text = cached.get(entry.index) ?? ''
    }

    const start = Math.max((this.currentIndex ?? 1) - 1, 0)
    const pending = file.texts
      .filter((entry) => !entry.text && !cached.has(entry.index))
      .map((entry) => entry.index)
      .sort((a, b) => Number(a < start) - Number(b < start) || a - b)
    if (pending.length === 0) return this.setOcr(null)

    const abort = new AbortController()
    this.ocrAbort = abort
    const progress = { done: 0, total: pending.length }
    this.setOcr({ ...progress })

    this.ocrSlidesFn(
      file.path,
      pending,
      ({ index, text }) => {
        if (abort.signal.aborted || this.file !== file) return
        cached.set(index, text)
        progress.done++
        this.setOcr({ ...progress })
        const entry = file.texts[index]
        if (!entry || !text || entry.text) return
        entry.text = text
        if (this.currentIndex === null) return
        if (index === this.currentIndex - 1) this.goTo(this.currentIndex)
        else if (index >= this.currentIndex)
          this.emit({ kind: 'upcoming', slides: this.getUpcoming() })
      },
      abort.signal
    )
      .catch((error: unknown) => {
        if (abort.signal.aborted) return
        this.logs?.warn('powerpoint', 'Reading slide images failed', {
          error: error instanceof Error ? error.message : String(error)
        })
      })
      .finally(() => {
        if (this.ocrAbort !== abort) return
        this.ocrAbort = null
        this.setOcr(null)
      })
  }

  private setOcr(progress: OcrProgress | null): void {
    this.ocr = progress
    this.emit({ kind: 'ocr', progress })
  }

  /** The app stops following the slide show (it ended, or another presentation was linked). */
  private endTracking(): void {
    if (this.currentIndex === null) return
    const presentation = this.slides.getPresentation()
    if (presentation) {
      this.slides.handle({ type: 'presentation-ended', presentationId: presentation.id })
    }
    this.currentIndex = null
    this.emit({ kind: 'upcoming', slides: [] })
  }

  /** Follows the slide show to this 1-based slide, starting to follow it if it was not yet. */
  private goTo(position: number): void {
    if (!this.file || this.file.texts.length === 0) return
    // PowerPoint's "end of slide show" black screen sits one past the last slide.
    const index = Math.min(Math.max(position, 1), this.file.texts.length)
    const entry = this.file.texts[index - 1]
    if (!entry) return

    if (this.currentIndex === null) {
      this.slides.handle({
        type: 'presentation-started',
        presentation: {
          id: this.file.path,
          title: this.file.title,
          startedAt: new Date().toISOString()
        }
      })
    }
    this.currentIndex = index

    this.slides.handle({
      type: 'slide',
      slide: {
        id: `${this.file.path}#${index}`,
        presentationId: this.file.path,
        index: entry.index,
        total: this.file.texts.length,
        title: null,
        text: entry.text,
        nextText: null,
        kind: 'text',
        receivedAt: new Date().toISOString()
      }
    })
    this.emit({ kind: 'upcoming', slides: this.getUpcoming() })
  }

  private getUpcoming(): UpcomingSlide[] {
    if (!this.file || this.currentIndex === null) return []
    return this.file.texts.slice(this.currentIndex)
  }

  private notifyLink(): void {
    this.linkListeners.forEach((listener) => listener())
  }

  private emit(event: PowerPointPushEvent): void {
    this.listeners.forEach((listener) => listener(event))
  }
}

/** "C:\cultos\Domingo.pptx" -> "Domingo.pptx"; an unsaved deck's id is already just its name. */
function titleOf(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}
