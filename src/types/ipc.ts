import type { RegionCode } from '@/modules/avatar/types/avatar.types'
import type { CatalogStatus, TranslationResult } from '@/modules/libras/types/libras.types'
import type {
  ConnectionHistory,
  Endpoint,
  IntegrationPushEvent,
  IntegrationState
} from '@/modules/louvorja/types/louvorja.types'
import type { Presentation, Slide } from './presentation'
import type { AppSettings } from './settings'

/** Every IPC channel the renderer may use. Anything not listed here is rejected. */
export const IpcChannels = {
  appGetInfo: 'app:get-info',
  settingsGetAll: 'settings:get-all',
  settingsSet: 'settings:set',
  settingsResetAll: 'settings:reset-all',
  windowControl: 'window:control',
  louvorjaGetState: 'louvorja:get-state',
  louvorjaConnect: 'louvorja:connect',
  louvorjaDisconnect: 'louvorja:disconnect',
  louvorjaGetHistory: 'louvorja:get-history',
  louvorjaRemoveConnection: 'louvorja:remove-connection',
  powerpointGetState: 'powerpoint:get-state',
  powerpointControl: 'powerpoint:control',
  powerpointPickFile: 'powerpoint:pick-file',
  powerpointLoadFile: 'powerpoint:load-file',
  librasTranslate: 'libras:translate',
  librasCatalogStatus: 'libras:catalog-status',
  librasCatalogRefresh: 'libras:catalog-refresh',
  librasSaveOverride: 'libras:save-override',
  librasRemoveOverride: 'libras:remove-override',
  avatarPrefetch: 'avatar:prefetch',
  avatarCacheStats: 'avatar:cache-stats',
  avatarCacheClear: 'avatar:cache-clear',
  overlayGetState: 'overlay:get-state',
  overlayOpen: 'overlay:open',
  overlayClose: 'overlay:close',
  overlayIdentify: 'overlay:identify',
  overlayCommand: 'overlay:command',
  updaterGetState: 'updater:get-state',
  updaterCheck: 'updater:check',
  updaterDownload: 'updater:download',
  updaterInstall: 'updater:install',
  /** main -> renderer events */
  windowMaximizedChanged: 'window:maximized-changed',
  louvorjaEvent: 'louvorja:event',
  powerpointEvent: 'powerpoint:event',
  settingsChanged: 'settings:changed',
  overlayStateChanged: 'overlay:state-changed',
  overlayCommandEvent: 'overlay:command-event',
  updaterStateChanged: 'updater:state-changed'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

export const WINDOW_ACTIONS = ['minimize', 'maximize', 'close', 'is-maximized'] as const
export type WindowAction = (typeof WINDOW_ACTIONS)[number]

/** Moves the live slide show, the same as pressing the arrow keys in PowerPoint itself -
 *  `start` begins it (from the active presentation, if none is already running) and `end`
 *  closes it (the same as pressing Esc during the slide show). */
export const POWERPOINT_ACTIONS = ['start', 'end', 'first', 'previous', 'next', 'last'] as const
export type PowerPointAction = (typeof POWERPOINT_ACTIONS)[number]

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  dataPath: string
}

/** Signs the avatar player has downloaded and kept on this computer. */
export interface SignCacheStats {
  files: number
  bytes: number
}

export interface LouvorJAApiAvatar {
  /** Downloads signs ahead of time so they play instantly, and offline later. */
  prefetch(
    region: RegionCode,
    signs: string[]
  ): Promise<{ cached: number; downloaded: number; failed: number }>
  getCacheStats(): Promise<SignCacheStats>
  /** Deletes every downloaded sign and returns the new (empty) stats. */
  clearCache(): Promise<SignCacheStats>
}

/** A screen the overlay can be shown on. */
export interface OverlayDisplay {
  id: number
  /** "1 · 1920×1080". */
  label: string
  width: number
  height: number
  primary: boolean
}

export interface OverlayState {
  open: boolean
  /** The screen the overlay is on now, when open. */
  displayId: number | null
  displays: OverlayDisplay[]
}

/** What the projection page can ask the overlay window to do. */
export type OverlayCommand =
  | { type: 'play'; gloss: string }
  | { type: 'repeat' }
  | { type: 'stop' }
  | { type: 'pause' }
  | { type: 'resume' }

/**
 * - `unavailable`: this build cannot self-update (a dev run, or `app.isPackaged` is false).
 * - `checking`: asking GitHub Releases whether a newer version exists.
 * - `available`: found one, but has not started downloading yet - `download()` starts it.
 * - `downloading`: fetching the installer (`progressPercent` fills in).
 * - `downloaded`: ready - `install()` restarts the app to apply it.
 * - `upToDate`: checked, already on the latest version.
 * - `error`: the check or download failed (`error` has a message).
 */
export type UpdaterStatus =
  | 'idle'
  | 'unavailable'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'upToDate'
  | 'error'

export interface UpdaterState {
  status: UpdaterStatus
  /** The version being downloaded or ready to install, once known. */
  version: string | null
  /** 0-100 while `downloading`. */
  progressPercent: number | null
  /** What changed in `version` (plain text, from the GitHub release body), once known. */
  releaseNotes: string | null
  error: string | null
}

/** A slide not yet reached in the loaded file - PowerPoint-only, and unrelated to LouvorJA's own
 *  "Slides recebidos" (a history of what already aired, not a look-ahead). */
export interface UpcomingSlide {
  /** 0-based, matching Slide.index. */
  index: number
  text: string
}

export interface PowerPointState {
  presentation: Presentation | null
  currentSlide: Slide | null
  recentSlides: Slide[]
  upcomingSlides: UpcomingSlide[]
}

export type PowerPointPushEvent =
  | { kind: 'presentation'; presentation: Presentation | null }
  | { kind: 'slide'; slide: Slide }
  | { kind: 'upcoming'; slides: UpcomingSlide[] }

/** API exposed to the renderer as `window.louvorja` through the preload script. */
export interface LouvorJAApi {
  app: {
    getInfo(): Promise<AppInfo>
  }
  settings: {
    getAll(): Promise<AppSettings>
    set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<AppSettings>
    /** Forgets every stored value, going back to the app's defaults. */
    resetAll(): Promise<AppSettings>
    /** Called with every setting whenever one changes, in any window. Returns the unsubscribe. */
    onChange(listener: (settings: AppSettings) => void): () => void
  }
  window: {
    /** Returns whether the window is maximized after the action. */
    control(action: WindowAction): Promise<boolean>
    /** Subscribes to maximize/restore events. Returns the unsubscribe function. */
    onMaximizedChange(listener: (maximized: boolean) => void): () => void
  }
  /** Connection to the LouvorJA presentation software. */
  integration: {
    getState(): Promise<IntegrationState>
    /** Starts connecting (with automatic retries) and returns right away. */
    connect(endpoint: Endpoint): Promise<void>
    disconnect(): Promise<void>
    getHistory(): Promise<ConnectionHistory>
    removeConnection(id: number): Promise<ConnectionHistory>
    /** Subscribes to status, presentation and slide events. Returns the unsubscribe function. */
    onEvent(listener: (event: IntegrationPushEvent) => void): () => void
  }
  /** A PowerPoint file read and driven entirely by this app - no Microsoft PowerPoint involved.
   *  Independent from `integration` above - its own source. */
  powerpoint: {
    getState(): Promise<PowerPointState>
    /** Moves between slides of the loaded file (ignored while none is loaded). */
    control(action: PowerPointAction): Promise<void>
    /** Opens the native "Open file" dialog, filtered to PowerPoint files. `null` if cancelled. */
    pickFile(): Promise<string | null>
    /** Reads and parses this .pptx file - no presentation starts yet (see control('start')). */
    loadFile(path: string): Promise<void>
    onEvent(listener: (event: PowerPointPushEvent) => void): () => void
  }
  /** Portuguese text to Libras gloss. */
  libras: {
    translate(text: string): Promise<TranslationResult>
    /** Stores a gloss written by a person for this text. An empty gloss removes it. */
    saveOverride(text: string, gloss: string): Promise<TranslationResult>
    removeOverride(text: string): Promise<TranslationResult>
    getCatalogStatus(): Promise<CatalogStatus>
    /** Downloads the list of available signs. Rejects if the server cannot be reached. */
    refreshCatalog(): Promise<CatalogStatus>
  }
  /** The signing avatar: signs kept on this computer. */
  avatar: LouvorJAApiAvatar
  /** The transparent window that puts the avatar over the presentation. */
  overlay: {
    getState(): Promise<OverlayState>
    /** Opens it on this screen (`null`: the automatic choice). */
    open(displayId: number | null): Promise<OverlayState>
    close(): Promise<OverlayState>
    /** Shows a big number for a few seconds on every screen, to tell which is which. */
    identify(): Promise<void>
    /** Sends a command to the overlay window (ignored while it is closed). */
    command(command: OverlayCommand): Promise<void>
    onStateChange(listener: (state: OverlayState) => void): () => void
    /** For the overlay window itself: commands sent from the projection page. */
    onCommand(listener: (command: OverlayCommand) => void): () => void
  }
  /** Checks GitHub Releases for a newer build; downloading and installing are both only ever
   *  started by request (never behind someone's back). */
  updater: {
    getState(): Promise<UpdaterState>
    /** Starts a check (a no-op while one is already checking or downloading) and returns at once. */
    check(): Promise<UpdaterState>
    /** Starts downloading the available update. Ignored unless one was actually found. */
    download(): Promise<UpdaterState>
    /** Quits and installs the downloaded update. Ignored unless a version is ready. */
    install(): Promise<void>
    onStateChange(listener: (state: UpdaterState) => void): () => void
  }
}
