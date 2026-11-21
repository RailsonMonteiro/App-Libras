import { describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../../electron/services/DatabaseService'
import { SpeechService, type SpeechProcess } from '../../../electron/services/speech/SpeechService'
import type { SpeechPushEvent } from '../../../src/types/ipc'

/** A stand-in for speechInput.ps1: the test writes its lines and decides when it exits. */
function fakeRecognizer() {
  let lineListener: (line: string) => void = () => undefined
  let exitListener: (code: number | null) => void = () => undefined
  const process: SpeechProcess = {
    onLine: (listener) => (lineListener = listener),
    onExit: (listener) => (exitListener = listener),
    kill: vi.fn(() => exitListener(null))
  }
  return {
    process,
    say: (object: unknown) => lineListener(JSON.stringify(object)),
    exit: (code: number) => exitListener(code)
  }
}

function setup() {
  const recognizer = fakeRecognizer()
  const logs = { warn: vi.fn() }
  const service = new SpeechService({
    db: openDatabase(':memory:'),
    logs: logs as never,
    spawnRecognizer: () => recognizer.process
  })
  const events: SpeechPushEvent[] = []
  service.onEvent((event) => events.push(event))
  return { service, recognizer, events, logs }
}

describe('SpeechService', () => {
  it('is off at first', () => {
    const { service } = setup()
    expect(service.getState()).toMatchObject({ status: 'idle', presentation: null })
  })

  it('starts a presentation once listening, and turns each phrase into a slide', () => {
    const { service, recognizer } = setup()
    service.start()
    expect(service.getState().status).toBe('starting')

    recognizer.say({ type: 'ready' })
    recognizer.say({ type: 'text', text: 'Deus é amor' })
    recognizer.say({ type: 'text', text: 'Ele cuida de nós' })

    const state = service.getState()
    expect(state.status).toBe('listening')
    expect(state.presentation).not.toBeNull()
    expect(state.currentSlide).toMatchObject({ text: 'Ele cuida de nós', kind: 'text' })
    expect(state.recentSlides.map((s) => s.text)).toEqual(['Deus é amor', 'Ele cuida de nós'])
  })

  it('ends the presentation and stops the recognizer when turned off', () => {
    const { service, recognizer } = setup()
    service.start()
    recognizer.say({ type: 'ready' })

    service.stop()

    expect(recognizer.process.kill).toHaveBeenCalled()
    expect(service.getState()).toMatchObject({ status: 'idle', presentation: null })
  })

  it('reports that online speech recognition is off in Windows', () => {
    const { service, recognizer, logs } = setup()
    service.start()
    recognizer.say({ type: 'error', code: 'privacy' })
    recognizer.exit(4)

    expect(service.getState()).toMatchObject({
      status: 'error',
      error: { code: 'privacy', message: null }
    })
    expect(logs.warn).toHaveBeenCalled()
  })

  it('reports an unexpected exit as an error', () => {
    const { service, recognizer } = setup()
    service.start()
    recognizer.say({ type: 'ready' })
    recognizer.exit(1)

    expect(service.getState()).toMatchObject({ status: 'error', presentation: null })
  })

  it('ignores anything that is not one of its lines', () => {
    const { service, recognizer } = setup()
    service.start()
    recognizer.say({ type: 'ready' })
    recognizer.say({ hello: 'world' })
    expect(service.getState().currentSlide).toBeNull()
  })

  it('can be started again after an error', () => {
    const { service, recognizer } = setup()
    service.start()
    recognizer.say({ type: 'error', code: 'microphone' })
    recognizer.exit(5)

    service.start()
    recognizer.say({ type: 'ready' })
    expect(service.getState()).toMatchObject({ status: 'listening', error: null })
  })
})
