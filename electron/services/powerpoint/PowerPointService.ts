import { basename } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { PowerPointAction, UpcomingSlide } from '../../../src/types/ipc'
import type { Presentation, Slide } from '../../../src/types/presentation'
import type { LogService } from '../LogService'
import { PresentationRepository } from '../louvorja/PresentationRepository'
import { SlideReceiverService } from '../louvorja/SlideReceiverService'
import { runCloseFile, runLoadFile, type PptxSlideText } from './powerpointCom'
import type { PowerPointSlideImageCache } from './PowerPointSlideImageCache'

export interface PowerPointState {
  presentation: Presentation | null
  currentSlide: Slide | null
  recentSlides: Slide[]
  upcomingSlides: UpcomingSlide[]
}

export type PowerPointPushEvent =
  | { kind: 'presentation'; presentation: Presentation | null }
  | { kind: 'slide'; slide: Slide }
  | { kind: 'upcoming'; slides: UpcomingSlide[] }

export interface PowerPointServiceOptions {
  db: DatabaseSync
  logs?: LogService
  /** Shared with main/protocol.ts, which serves its images through `app://renderer/...`. */
  slideImages?: PowerPointSlideImageCache
  /** Injected in tests; defaults to opening the file hidden via COM (see powerpointCom.ts). */
  loadFile?: (path: string) => Promise<PptxSlideText[]>
  /** Injected in tests; defaults to closing it via COM, best-effort. */
  closeFile?: (path: string) => Promise<void>
}

/**
 * Facade for a PowerPoint file opened hidden (no visible window, ever) via COM automation - see
 * powerpointCom.ts. Deliberately independent from LouvorJAService: no endpoint, no
 * retry/backoff, no "last connection".
 */
export class PowerPointService {
  readonly slides: SlideReceiverService
  private readonly presentations: PresentationRepository
  private readonly listeners = new Set<(event: PowerPointPushEvent) => void>()
  private readonly slideImages: PowerPointSlideImageCache | undefined
  private readonly logs: LogService | undefined
  private readonly loadFileFn: (path: string) => Promise<PptxSlideText[]>
  private readonly closeFileFn: (path: string) => Promise<void>

  /** The linked file's slide texts, known in full as soon as it is loaded - there is nothing to
   *  poll for. */
  private file: { path: string; title: string; texts: PptxSlideText[] } | null = null
  /** 1-based; `null` while no presentation is in progress (see control('start')/('end')). */
  private currentIndex: number | null = null

  constructor(options: PowerPointServiceOptions) {
    this.presentations = new PresentationRepository(options.db, 'powerpoint')
    this.slides = new SlideReceiverService(this.presentations)
    this.slideImages = options.slideImages
    this.logs = options.logs
    this.loadFileFn = options.loadFile ?? runLoadFile
    this.closeFileFn = options.closeFile ?? runCloseFile

    this.slides.onPresentation((p) => this.emit({ kind: 'presentation', presentation: p }))
    this.slides.onSlide((slide) => this.emit({ kind: 'slide', slide }))
  }

  getState(): PowerPointState {
    return {
      presentation: this.slides.getPresentation(),
      currentSlide: this.slides.getCurrentSlide(),
      recentSlides: this.slides.getRecentSlides(),
      upcomingSlides: this.getUpcoming()
    }
  }

  /** Opens this file hidden and reads every slide's text - no presentation starts yet (see
   *  control('start')). A previously linked, different file is closed first. */
  async loadFile(path: string): Promise<void> {
    const previous = this.slides.getPresentation()
    if (previous) this.slides.handle({ type: 'presentation-ended', presentationId: previous.id })

    if (this.file && this.file.path !== path) {
      await this.closeFileFn(this.file.path).catch((error) => {
        this.logs?.warn('powerpoint', 'Closing the previous file failed', {
          path: this.file?.path,
          error: error instanceof Error ? error.message : String(error)
        })
      })
    }

    const texts = await this.loadFileFn(path)
    this.file = { path, title: basename(path), texts }
    this.currentIndex = null
    this.slideImages?.setFile(path)
    this.emit({ kind: 'upcoming', slides: [] })
  }

  /** Moves between slides of the loaded file (ignored while none is loaded). */
  control(action: PowerPointAction): void {
    if (!this.file || this.file.texts.length === 0) return
    const total = this.file.texts.length

    switch (action) {
      case 'end':
        if (this.currentIndex !== null) {
          this.slides.handle({ type: 'presentation-ended', presentationId: this.file.path })
          this.currentIndex = null
          this.emit({ kind: 'upcoming', slides: [] })
        }
        return
      case 'start':
      case 'first':
        this.goTo(1)
        return
      case 'last':
        this.goTo(total)
        return
      case 'next':
        this.goTo(Math.min(total, (this.currentIndex ?? 0) + 1))
        return
      case 'previous':
        this.goTo(Math.max(1, (this.currentIndex ?? 1) - 1))
        return
    }
  }

  /** Housekeeping run at startup. */
  prune(days = 30): void {
    this.presentations.prune(days)
  }

  onEvent(listener: (event: PowerPointPushEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Closes the hidden file (best-effort), so no PowerPoint process is left running after the
   *  app quits. */
  dispose(): void {
    if (this.file) void this.closeFileFn(this.file.path).catch(() => undefined)
    this.listeners.clear()
  }

  /** Jumps to the given 1-based slide, starting the presentation first if none was running. */
  private goTo(index: number): void {
    if (!this.file) return
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

  private emit(event: PowerPointPushEvent): void {
    this.listeners.forEach((listener) => listener(event))
  }
}
