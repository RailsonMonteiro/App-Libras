import { describe, expect, it } from 'vitest'
import { acceleratorFor } from '@/modules/powerpoint/types/presenterKeys'

describe('acceleratorFor', () => {
  it.each([
    ['PageDown', 'PageDown'],
    ['PageUp', 'PageUp'],
    ['Escape', 'Escape'],
    ['Enter', 'Enter'],
    [' ', 'Space'],
    ['+', 'Plus'],
    ['ArrowRight', 'Right'],
    ['ArrowLeft', 'Left'],
    ['MediaTrackNext', 'MediaNextTrack'],
    ['AudioVolumeUp', 'VolumeUp'],
    ['F5', 'F5'],
    ['F24', 'F24'],
    ['b', 'B'],
    ['.', '.'],
    ['1', '1']
  ])('maps %j to %j', (key, accelerator) => {
    expect(acceleratorFor(key)).toBe(accelerator)
  })

  it.each(['Unidentified', 'Dead', 'F25', 'ContextMenu', 'Shift', ''])(
    'refuses %j, which cannot be taken system-wide',
    (key) => {
      expect(acceleratorFor(key)).toBeNull()
    }
  )
})
