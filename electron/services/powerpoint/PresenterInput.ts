import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import type { LogService } from '../LogService'
import { scriptPath } from './powerpointCom'

export interface RemoteKeyEvent {
  /** Which device the key came from (see presenterInput.ps1's DeviceId). */
  device: string
  /** Accelerator-style name: "PageDown", "Right", "B", "F5"... */
  key: string
  /** PowerPoint's slide show window was in front - PowerPoint acts on its own keys by itself. */
  slideShow: boolean
}

const eventSchema = z.object({ device: z.string(), key: z.string(), slideShow: z.boolean() })

/**
 * The long-lived presenterInput.ps1 helper: key presses with the device they came from (Windows
 * Raw Input), so only the presenter remote drives the slide show - never the keyboard. Restarts
 * the helper if it ever dies, and re-sends what it was told (binding mode, linked device).
 */
export class PresenterInput {
  private child: ChildProcess | null = null
  private disposed = false
  private restartDelay = 2_000
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private binding = false
  private device: string | null = null
  private readonly listeners = new Set<(event: RemoteKeyEvent) => void>()

  constructor(private readonly logs?: LogService) {}

  start(): void {
    if (process.platform !== 'win32' || this.child || this.disposed) return
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath('presenterInput.ps1')
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    this.child = child
    const startedAt = Date.now()

    createInterface({ input: child.stdout! }).on('line', (line) => this.onLine(line))
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2_000)
    })
    child.stdin?.on('error', () => undefined)
    child.on('error', (error) =>
      this.logs?.warn('powerpoint', 'Presenter input failed', { error: error.message })
    )
    child.on('exit', (code) => {
      this.child = null
      if (this.disposed) return
      this.logs?.warn('powerpoint', 'Presenter input stopped', { code, stderr: stderr.trim() })
      // Ran for a while: a one-off crash, retry soon. Died right away: back off.
      this.restartDelay =
        Date.now() - startedAt > 60_000 ? 2_000 : Math.min(this.restartDelay * 2, 60_000)
      this.restartTimer = setTimeout(() => this.start(), this.restartDelay)
    })

    this.send(`binding ${this.binding ? 1 : 0}`)
    this.send(this.device ? `device ${this.device}` : 'device')
  }

  onKey(listener: (event: RemoteKeyEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** While on, every key is reported (the person is pressing one to bind it). */
  setBinding(on: boolean): void {
    this.binding = on
    this.send(`binding ${on ? 1 : 0}`)
  }

  setDevice(device: string | null): void {
    if (device === this.device) return
    this.device = device
    this.send(device ? `device ${device}` : 'device')
  }

  dispose(): void {
    this.disposed = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.listeners.clear()
    // Closing its stdin is what makes the helper exit; kill() is the fallback.
    this.child?.stdin?.end()
    this.child?.kill()
    this.child = null
  }

  private send(line: string): void {
    if (this.child?.stdin?.writable) this.child.stdin.write(`${line}\n`)
  }

  private onLine(line: string): void {
    let event: RemoteKeyEvent
    try {
      event = eventSchema.parse(JSON.parse(line))
    } catch {
      return
    }
    this.listeners.forEach((listener) => listener(event))
  }
}
