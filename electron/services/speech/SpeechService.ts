import { spawn, type ChildProcess } from 'node:child_process'
import type { DatabaseSync } from 'node:sqlite'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import type { SpeechPushEvent, SpeechState, SpeechStatus } from '../../../src/types/ipc'
import type { SpeechError } from '../../../src/types/ipc'
import type { LogService } from '../LogService'
import { PresentationRepository } from '../louvorja/PresentationRepository'
import { SlideReceiverService } from '../louvorja/SlideReceiverService'
import { scriptPath } from '../powerpoint/powerpointCom'

const lineSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('error'),
    code: z.enum(['privacy', 'microphone', 'other']),
    message: z.string().optional()
  })
])
export type SpeechLine = z.infer<typeof lineSchema>

/** The running recognizer, as SpeechService sees it - a child process in the app. */
export interface SpeechProcess {
  onLine(listener: (line: string) => void): void
  onExit(listener: (code: number | null) => void): void
  kill(): void
}

export interface SpeechServiceOptions {
  db: DatabaseSync
  logs?: LogService
  /** Injected in tests; the default runs speechInput.ps1. */
  spawnRecognizer?: () => SpeechProcess
}

/**
 * The microphone as a third source of text, next to LouvorJA and PowerPoint: while it is on, each
 * phrase Windows recognizes (see speechInput.ps1) arrives as a "slide" - translated and signed by
 * the avatar exactly like a slide from the other two. One "presentation" lasts from turning the
 * microphone on until turning it off.
 */
export class SpeechService {
  readonly slides: SlideReceiverService
  private readonly presentations: PresentationRepository
  private readonly listeners = new Set<(event: SpeechPushEvent) => void>()
  private readonly logs: LogService | undefined
  private readonly spawnRecognizer: () => SpeechProcess

  private process: SpeechProcess | null = null
  private status: SpeechStatus = 'idle'
  private error: SpeechError | null = null
  private sessionId: string | null = null
  private phrase = 0

  constructor(options: SpeechServiceOptions) {
    this.presentations = new PresentationRepository(options.db, 'speech')
    this.slides = new SlideReceiverService(this.presentations)
    this.logs = options.logs
    this.spawnRecognizer = options.spawnRecognizer ?? spawnSpeechInput

    this.slides.onPresentation((p) => this.emit({ kind: 'presentation', presentation: p }))
    this.slides.onSlide((slide) => this.emit({ kind: 'slide', slide }))
  }

  getState(): SpeechState {
    return {
      status: this.status,
      error: this.error,
      presentation: this.slides.getPresentation(),
      currentSlide: this.slides.getCurrentSlide(),
      recentSlides: this.slides.getRecentSlides()
    }
  }

  start(): void {
    if (this.process) return
    this.error = null
    this.setStatus('starting')

    const child = this.spawnRecognizer()
    this.process = child
    child.onLine((raw) => {
      if (this.process !== child) return
      let line: SpeechLine
      try {
        line = lineSchema.parse(JSON.parse(raw.replace(/^\uFEFF/, '')))
      } catch {
        return
      }
      this.onLine(line)
    })
    child.onExit((code) => {
      if (this.process !== child) return
      this.process = null
      if (this.status !== 'error') {
        if (code !== 0) {
          this.error = { code: 'other', message: `exit ${code}` }
          this.setStatus('error')
        } else {
          this.setStatus('idle')
        }
      }
      this.endSession()
    })
  }

  stop(): void {
    const child = this.process
    this.process = null
    child?.kill()
    this.endSession()
    this.error = null
    this.setStatus('idle')
  }

  /** Housekeeping run at startup. */
  prune(days = 30): void {
    this.presentations.prune(days)
  }

  onEvent(listener: (event: SpeechPushEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.process?.kill()
    this.process = null
    this.listeners.clear()
  }

  private onLine(line: SpeechLine): void {
    switch (line.type) {
      case 'ready':
        this.startSession()
        this.setStatus('listening')
        break
      case 'text': {
        if (!this.sessionId) this.startSession()
        const sessionId = this.sessionId!
        this.phrase++
        this.slides.handle({
          type: 'slide',
          slide: {
            id: `${sessionId}#${this.phrase}`,
            presentationId: sessionId,
            index: null,
            total: null,
            title: null,
            text: line.text,
            nextText: null,
            kind: 'text',
            receivedAt: new Date().toISOString()
          }
        })
        break
      }
      case 'error':
        this.error = { code: line.code, message: line.message ?? null }
        this.logs?.warn('speech', 'Speech recognition stopped', {
          code: line.code,
          message: line.message
        })
        this.setStatus('error')
        break
    }
  }

  private startSession(): void {
    if (this.sessionId) return
    const startedAt = new Date().toISOString()
    this.sessionId = `speech-${startedAt}`
    this.phrase = 0
    this.slides.handle({
      type: 'presentation-started',
      presentation: { id: this.sessionId, title: '', startedAt }
    })
  }

  private endSession(): void {
    if (!this.sessionId) return
    this.slides.handle({ type: 'presentation-ended', presentationId: this.sessionId })
    this.sessionId = null
  }

  private setStatus(status: SpeechStatus): void {
    this.status = status
    this.emit({ kind: 'status', status, error: this.error })
  }

  private emit(event: SpeechPushEvent): void {
    this.listeners.forEach((listener) => listener(event))
  }
}

/** speechInput.ps1 as a child process; it also stops by itself if this app is gone. */
function spawnSpeechInput(): SpeechProcess {
  const child: ChildProcess = spawn(
    'powershell.exe',
    [
      // Windows PowerShell runs STA by default, and there the recognizer's result waits for the
      // very thread that is blocked waiting for it: RecognizeAsync never returns (tested).
      '-MTA',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath('speechInput.ps1'),
      '-ParentPid',
      String(process.pid)
    ],
    { windowsHide: true }
  )
  const lines = createInterface({ input: child.stdout! })
  return {
    onLine: (listener) => lines.on('line', listener),
    onExit: (listener) => {
      child.on('exit', (code) => listener(code))
      child.on('error', () => listener(-1))
    },
    kill: () => {
      child.kill()
    }
  }
}
