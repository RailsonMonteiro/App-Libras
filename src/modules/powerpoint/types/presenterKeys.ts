/** `KeyboardEvent.key` names that differ from Electron's accelerator names. */
const NAMED_KEYS: Record<string, string> = {
  ' ': 'Space',
  '+': 'Plus',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  // Some remotes send media keys instead of PageUp/PageDown.
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPreviousTrack',
  MediaPlayPause: 'MediaPlayPause',
  MediaStop: 'MediaStop',
  AudioVolumeUp: 'VolumeUp',
  AudioVolumeDown: 'VolumeDown',
  AudioVolumeMute: 'VolumeMute'
}
const SAME_NAME = new Set([
  'Escape',
  'PageUp',
  'PageDown',
  'Enter',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End'
])

/**
 * The accelerator-style name (what presenterInput.ps1 reports and bindings are saved as) for a
 * `KeyboardEvent.key` - how bindings saved by older versions are read - or `null` when it has none.
 */
export function acceleratorFor(key: string): string | null {
  if (NAMED_KEYS[key]) return NAMED_KEYS[key]
  if (SAME_NAME.has(key)) return key
  if (/^F([1-9]|1\d|2[0-4])$/.test(key)) return key
  if (key.length === 1 && /\S/.test(key)) return key.toUpperCase()
  return null
}
