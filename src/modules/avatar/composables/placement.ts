/** The avatar is taller than wide: its box is this many times as wide as it is tall. */
export const AVATAR_ASPECT = 0.75

export interface Area {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Where the avatar stands on a stage (the preview) or on a whole screen (the overlay): on the
 * bottom edge, sliding from the left edge (`position` 0) to the right edge (100), 50 being dead
 * centre, and `scalePercent` of the stage's height tall.
 */
export function avatarBox(
  stage: Area,
  scalePercent: number,
  position: number
): { x: number; y: number; width: number; height: number } {
  const height = stage.height * (scalePercent / 100)
  const width = height * AVATAR_ASPECT
  const margin = stage.width * 0.02

  const minX = stage.left + margin
  const maxX = stage.left + stage.width - width - margin
  // Clamped so a stale or out-of-range `position` (e.g. settings not reloaded after an update)
  // can never push the avatar outside the stage - it always lands somewhere between the margins.
  const fraction = Number.isFinite(position) ? Math.min(100, Math.max(0, position)) / 100 : 0.5
  const x = minX + (maxX - minX) * fraction

  return { x, y: stage.top + stage.height - height, width, height }
}
