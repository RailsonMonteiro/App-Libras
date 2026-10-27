import {
  DEFAULT_DICTIONARY_URL,
  type AvatarId,
  type RegionCode
} from '@/modules/avatar/types/avatar.types'
import {
  DEFAULT_SIGNS_INDEX_URL,
  DEFAULT_TRANSLATOR_URL
} from '@/modules/libras/types/libras.types'

export const THEME_MODES = ['system', 'light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

/** The app ships in exactly three languages: Portuguese (Brazil), Spanish and English. */
export const APP_LOCALES = ['pt-BR', 'es', 'en'] as const
export type AppLocale = (typeof APP_LOCALES)[number]

/** Limits of the avatar size (percent of the stage height). */
export const AVATAR_SCALE_RANGE = { min: 0, max: 100 } as const

/**
 * How long (seconds) the avatar waits after a slide comes on the air before it starts signing.
 * Positive: a deliberate pause once the signs are ready. Negative: the opposite direction,
 * "advance" - it shortens how long the avatar is willing to wait for the signs to finish
 * downloading first, down to not waiting at all (see SIGNS_WAIT_MS in avatar.store.ts, which
 * `min` mirrors: going more negative than that would not shorten anything further).
 */
export const INTERPRET_DELAY_RANGE = { min: -2.5, max: 15, step: 0.5 } as const

export interface AppSettings {
  theme: ThemeMode
  locale: AppLocale
  /** Keeps the sidebar expanded instead of collapsing it to an icon rail. */
  sidebarPinned: boolean
  /** Reconnects to the last LouvorJA endpoint when the app starts. */
  autoConnect: boolean
  /** Minimizing the window hides it to the system tray instead of dropping it to the taskbar. */
  runInBackground: boolean
  /** Registers the app to start with Windows (or the OS login) itself, hidden in the tray. */
  startWithWindows: boolean
  /** Lets the app send slide text to a VLibras translation server, instead of only the local
   *  translator - when on, that text leaves the computer. */
  onlineTranslator: boolean
  translatorUrl: string
  signsIndexUrl: string

  /** Which of the VLibras avatars signs. */
  avatar: AvatarId
  avatarSpeed: number
  /** Regional variant of the signs ("BR" is the national standard). */
  signRegion: RegionCode
  /** Signs every slide that arrives from LouvorJA without anyone pressing play. */
  autoInterpret: boolean
  /**
   * Instead of jumping straight to whatever slide is on the air (dropping anything still being
   * signed), plays through every slide received, in order, moving to the next only once the
   * current one finishes on its own - until there is nothing left queued.
   */
  continuousPlayback: boolean
  /** Seconds between a slide coming on the air and the avatar starting to sign it. Not exposed
   *  in Ajustes any more - it always sits at INTERPRET_DELAY_RANGE.min (fastest start). */
  interpretDelay: number
  /** Where the avatar stands on the stage (see AVATAR_POSITION_RANGE), and how big it is. */
  avatarPosition: number
  avatarScale: number
  /** Shows the slide text behind the avatar in the projection preview. */
  stageShowSlide: boolean
  /** Base address of the sign dictionary (signs are downloaded from here, once each). */
  dictionaryUrl: string

  /** Screen that shows the avatar overlay. `null`: a second screen if there is one, else the main one. */
  overlayDisplayId: number | null
  /** Opens the overlay by itself when the app starts. */
  overlayAutoOpen: boolean
  /** The overlay stays open but shows the avatar only from the first text to the last one. */
  overlayOnlyDuringPresentation: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  locale: 'pt-BR',
  sidebarPinned: true,
  autoConnect: true,
  runInBackground: true,
  startWithWindows: false,
  onlineTranslator: true,
  translatorUrl: DEFAULT_TRANSLATOR_URL,
  signsIndexUrl: DEFAULT_SIGNS_INDEX_URL,

  avatar: 'icaro',
  avatarSpeed: 2.5,
  signRegion: 'BR',
  autoInterpret: true,
  continuousPlayback: true,
  // No longer adjustable from Ajustes: always the fastest the avatar can start (see
  // INTERPRET_DELAY_RANGE.min above) - it should sign the moment the text arrives.
  interpretDelay: INTERPRET_DELAY_RANGE.min,
  avatarPosition: 100,
  avatarScale: 60,
  stageShowSlide: true,
  dictionaryUrl: DEFAULT_DICTIONARY_URL,

  overlayDisplayId: null,
  overlayAutoOpen: true,
  overlayOnlyDuringPresentation: true
}
