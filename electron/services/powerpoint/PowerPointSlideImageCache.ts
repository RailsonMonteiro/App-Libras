import { randomUUID } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LogService } from '../LogService'
import { runExportSlide } from './powerpointCom'

export type SlideImageResult =
  | { status: 200; body: Buffer }
  /** Index out of range, or not the file currently loaded. */
  | { status: 404 }
  /** The request itself is malformed. */
  | { status: 400 }
  /** Export failed - `message` is surfaced in the response body (see main/protocol.ts) so it
   *  shows up in the renderer's devtools Network tab without needing the main process's own
   *  console/log table. */
  | { status: 502; message: string }

/** Generous, but finite - an export that is genuinely stuck (rather than just slow) must not
 *  block every slide queued behind it forever. */
const EXPORT_TIMEOUT_MS = 30_000

export interface PowerPointSlideImageCacheOptions {
  logs?: LogService
  /** Injected in tests; defaults to exporting via COM (see powerpointCom.ts). */
  exportSlide?: (path: string, index: number, outPath: string) => Promise<void>
}

/**
 * Exports PowerPoint slides to PNG thumbnails on demand, from the same hidden instance
 * PowerPointService keeps open (see powerpointCom.ts's runExportSlide), served through the
 * `app://renderer/__pptx-slide__/...` route (see main/protocol.ts). Exporting is far costlier
 * than reading text, so it only ever runs for a slide actually requested by the renderer, never
 * eagerly for the whole file.
 */
export class PowerPointSlideImageCache {
  private readonly cache = new Map<string, Buffer>()
  private readonly inFlight = new Map<string, Promise<SlideImageResult>>()
  private readonly exportSlideFn: (path: string, index: number, outPath: string) => Promise<void>
  private presentationId: string | null = null
  /** Serializes the actual exports - each one is a real, CPU-bound PowerPoint operation, so
   *  running several at once (e.g. the current slide plus every "Próximos slides" thumbnail,
   *  all requested together) doesn't make them finish any sooner, just makes everything
   *  (PowerPoint included) sluggish until they all eventually drain - one at a time is both
   *  simpler and faster. */
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly options: PowerPointSlideImageCacheOptions = {}) {
    this.exportSlideFn = options.exportSlide ?? runExportSlide
  }

  /** Called whenever the loaded file changes - drops images from the previous one. */
  setFile(presentationId: string | null): void {
    if (presentationId === this.presentationId) return
    this.presentationId = presentationId
    this.cache.clear()
  }

  async get(presentationId: string, index: number): Promise<SlideImageResult> {
    if (!Number.isInteger(index) || index < 1) return { status: 400 }
    if (presentationId !== this.presentationId) return { status: 404 }

    const key = `${presentationId}#${index}`
    const cached = this.cache.get(key)
    if (cached) return { status: 200, body: cached }

    const pending = this.inFlight.get(key)
    if (pending) return pending

    const work = this.enqueue(presentationId, index, key).finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, work)
    return work
  }

  /** Queues this export behind whichever one is already running, so at most one ever executes
   *  at a time - see `queue` above. */
  private enqueue(path: string, index: number, key: string): Promise<SlideImageResult> {
    const result = this.queue.then(() => this.render(path, index, key))
    this.queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async render(path: string, index: number, key: string): Promise<SlideImageResult> {
    const outPath = join(tmpdir(), `pptx-slide-${randomUUID()}.png`)
    try {
      await this.withTimeout(this.exportSlideFn(path, index, outPath), index)
      const body = await readFile(outPath)
      this.cache.set(key, body)
      return { status: 200, body }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.options.logs?.warn('powerpoint', 'Slide image export failed', { index, error: message })
      return { status: 502, message }
    } finally {
      await rm(outPath, { force: true }).catch(() => undefined)
    }
  }

  private async withTimeout(task: Promise<void>, index: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout>
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Slide ${index} export timed out after ${EXPORT_TIMEOUT_MS}ms`)),
        EXPORT_TIMEOUT_MS
      )
    })
    try {
      await Promise.race([task, timeout])
    } finally {
      clearTimeout(timer!)
    }
  }
}
