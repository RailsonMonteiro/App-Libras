import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoteKeyEvent } from '../../../electron/services/powerpoint/PresenterInput'
import { PresenterRemote } from '../../../electron/services/powerpoint/PresenterRemote'
import { DEFAULT_PRESENTER_KEYS, type PresenterKeys } from '../../../src/types/settings'

const REMOTE = 'VID_1234&PID_5678'
const KEYBOARD = 'VID_AAAA&PID_BBBB'

function setup(keys: PresenterKeys = { ...DEFAULT_PRESENTER_KEYS }) {
  const state = { linked: true, presenting: true, device: REMOTE as string | null, keys }
  const control = vi.fn()
  const sync = vi.fn()
  const onBindingKey = vi.fn()
  const remote = new PresenterRemote({
    getKeys: () => state.keys,
    getDevice: () => state.device,
    getLink: () => ({ linked: state.linked, presenting: state.presenting }),
    control,
    sync,
    onBindingKey,
    syncDelayMs: 100
  })
  const press = (key: string, device = REMOTE, slideShow = false) =>
    remote.handle({ device, key, slideShow } satisfies RemoteKeyEvent)
  return { remote, state, control, sync, onBindingKey, press }
}

describe('PresenterRemote', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('drives the slide show from the linked remote', () => {
    const { press, control } = setup()
    press('PageDown')
    press('PageUp')
    press('Escape')
    expect(control.mock.calls.map(([action]) => action)).toEqual(['next', 'previous', 'end'])
  })

  it('ignores the same keys from the keyboard', () => {
    const { press, control, sync } = setup()
    press('PageDown', KEYBOARD)
    press('Escape', KEYBOARD)
    vi.runAllTimers()
    expect(control).not.toHaveBeenCalled()
    expect(sync).not.toHaveBeenCalled()
  })

  it('does nothing until a remote is linked', () => {
    const { press, control, state } = setup()
    state.device = null
    press('PageDown')
    expect(control).not.toHaveBeenCalled()
  })

  it('does nothing while no presentation is linked', () => {
    const { press, control, state } = setup({ ...DEFAULT_PRESENTER_KEYS, start: 'F5' })
    state.linked = false
    state.presenting = false
    press('F5')
    expect(control).not.toHaveBeenCalled()
  })

  it('only starts while not presenting', () => {
    const { press, control, state } = setup({ ...DEFAULT_PRESENTER_KEYS, start: 'F5' })
    state.presenting = false
    press('PageDown')
    press('Escape')
    press('F5')
    expect(control.mock.calls).toEqual([['start']])
  })

  it('never lets another binding take Esc away from "Finalizar"', () => {
    const { press, control } = setup({ ...DEFAULT_PRESENTER_KEYS, next: 'Escape' })
    press('Escape')
    expect(control.mock.calls).toEqual([['end']])
  })

  it('reads bindings saved with the old key names', () => {
    const { press, control } = setup({ ...DEFAULT_PRESENTER_KEYS, next: 'ArrowRight', end: 'b' })
    press('Right')
    press('B')
    expect(control.mock.calls.map(([action]) => action)).toEqual(['next', 'end'])
  })

  it('only follows PowerPoint when its slide show is in front and already acts on the key', () => {
    const { press, control, sync } = setup({ ...DEFAULT_PRESENTER_KEYS, previous: 'B' })
    press('PageDown', REMOTE, true) // PowerPoint advances by itself - sending "next" would skip one
    press('PageDown', REMOTE, true)
    expect(control).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(sync).toHaveBeenCalledTimes(1) // one read, after the last press

    press('B', REMOTE, true) // "B" is not PowerPoint's own "previous" key - the app sends it
    expect(control).toHaveBeenCalledWith('previous')
  })

  it('follows PowerPoint when the keyboard moves its slide show in front', () => {
    const { press, control, sync } = setup()
    press('Right', KEYBOARD, true)
    vi.advanceTimersByTime(100)
    expect(control).not.toHaveBeenCalled()
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('reports every key while binding, without driving anything', () => {
    const { remote, press, control, onBindingKey } = setup()
    remote.setBinding(true)
    press('PageDown')
    press('X', KEYBOARD)
    expect(control).not.toHaveBeenCalled()
    expect(onBindingKey).toHaveBeenCalledTimes(2)

    remote.setBinding(false)
    press('PageDown')
    expect(control).toHaveBeenCalledWith('next')
  })
})
