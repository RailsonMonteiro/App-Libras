import { acceleratorFor } from '../../../src/modules/powerpoint/types/presenterKeys'
import {
  PRESENTER_ACTIONS,
  PRESENTER_END_KEY,
  type PresenterAction,
  type PresenterKeys
} from '../../../src/types/settings'
import type { RemoteKeyEvent } from './PresenterInput'

/** What PowerPoint's slide show does by itself with each key, whenever its window is in front. */
const NATIVE: Partial<Record<PresenterAction, ReadonlySet<string>>> = {
  next: new Set(['PageDown', 'Right', 'Down', 'Space', 'Enter', 'N']),
  previous: new Set(['PageUp', 'Left', 'Up', 'Backspace', 'P']),
  end: new Set(['Escape'])
}
const NATIVE_ANY = new Set([...Object.values(NATIVE).flatMap((keys) => [...keys]), 'Home', 'End'])

export interface PresenterRemoteOptions {
  getKeys: () => PresenterKeys
  /** The linked remote (see presenterInput.ps1's DeviceId), `null` when none is linked yet. */
  getDevice: () => string | null
  getLink: () => { linked: boolean; presenting: boolean }
  control: (action: PresenterAction) => void
  /** Re-reads where PowerPoint's slide show is, without changing it. */
  sync: () => void
  /** While binding, every key goes here instead of driving anything. */
  onBindingKey: (event: RemoteKeyEvent) => void
  /** PowerPoint needs a moment to act on a key itself before its new position can be read. */
  syncDelayMs?: number
}

/**
 * Turns key presses (with the device each came from - see PresenterInput) into slide show
 * commands. Only the linked presenter remote drives anything: the keyboard never does. "Iniciar"
 * works while a presentation is linked; Voltar, Avançar, Finalizar and Esc only while its slide
 * show runs. Nothing is taken away from other programs, so when PowerPoint's own slide show window
 * is in front it already acts on its usual keys (from the remote or the keyboard) by itself - the
 * app then just follows it instead of sending the same command a second time.
 */
export class PresenterRemote {
  private binding = false
  private syncTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: PresenterRemoteOptions) {}

  setBinding(on: boolean): void {
    this.binding = on
  }

  handle(event: RemoteKeyEvent): void {
    if (this.binding) {
      this.options.onBindingKey(event)
      return
    }
    const { linked, presenting } = this.options.getLink()
    if (!linked) return

    const device = this.options.getDevice()
    const action =
      device !== null && event.device === device ? this.actionFor(event.key, presenting) : null

    if (action && !(event.slideShow && NATIVE[action]?.has(event.key))) {
      this.options.control(action)
    } else if (presenting && event.slideShow && NATIVE_ANY.has(event.key)) {
      this.scheduleSync()
    }
  }

  dispose(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.syncTimer = null
  }

  private actionFor(key: string, presenting: boolean): PresenterAction | null {
    if (presenting && key === PRESENTER_END_KEY) return 'end'
    const keys = this.options.getKeys()
    for (const action of PRESENTER_ACTIONS) {
      const bound = keys[action]
      if (bound === null || normalize(bound) !== key) continue
      if (action === 'start' || presenting) return action
    }
    return null
  }

  /** Several presses in a row - one read, after the last. */
  private scheduleSync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null
      this.options.sync()
    }, this.options.syncDelayMs ?? 250)
  }
}

/** Bindings saved by older versions used `KeyboardEvent.key` names ("ArrowRight", " "). */
function normalize(key: string): string {
  return acceleratorFor(key) ?? key
}
