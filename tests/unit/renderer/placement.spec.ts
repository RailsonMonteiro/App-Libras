import { describe, expect, it } from 'vitest'
import { AVATAR_ASPECT, avatarBox } from '@/modules/avatar/composables/placement'

const stage = { left: 100, top: 50, width: 1000, height: 500 }

describe('avatarBox', () => {
  it('stands on the bottom edge, as tall as the scale says', () => {
    const box = avatarBox(stage, 90, 100)
    expect(box.height).toBe(450)
    expect(box.width).toBe(450 * AVATAR_ASPECT)
    expect(box.y + box.height).toBe(stage.top + stage.height)
  })

  it('slides from the left edge (0) through centre (50) to the right edge (100), with a small margin', () => {
    const left = avatarBox(stage, 100, 0)
    const center = avatarBox(stage, 100, 50)
    const right = avatarBox(stage, 100, 100)

    expect(left.x).toBe(100 + 20) // 2% of the width
    expect(center.x + center.width / 2).toBe(100 + 1000 / 2)
    expect(right.x + right.width).toBe(100 + 1000 - 20)
  })

  it('scales with the stage: a smaller preview is a miniature of the full screen', () => {
    const screen = avatarBox({ left: 0, top: 0, width: 1920, height: 1080 }, 80, 100)
    const preview = avatarBox({ left: 0, top: 0, width: 960, height: 540 }, 80, 100)
    expect(preview.height / screen.height).toBeCloseTo(0.5)
    expect(preview.width / screen.width).toBeCloseTo(0.5)
    expect(preview.x / 960).toBeCloseTo(screen.x / 1920)
  })
})
