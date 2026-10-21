import { app, Menu, Notification, Tray, type BrowserWindow } from 'electron'
// A PNG copy of icon.webp, not the .webp itself - Electron's nativeImage (unlike Chromium's own
// <img>/<canvas>, which decodes the source .webp just fine) returns an empty image for it, so a
// Tray built from it shows no icon at all. Converted once (canvas.toDataURL in a devtools
// console), kept as a plain file so this isn't redone on every build.
import icon from '../../../src/assets/images/icon.png?asset'
import type { AppLocale } from '../../../src/types/settings'

const STRINGS: Record<
  AppLocale,
  { open: string; quit: string; hidden: string; hiddenBody: string }
> = {
  'pt-BR': {
    open: 'Abrir LouvorJA Libras',
    quit: 'Sair',
    hidden: 'LouvorJA Libras continua aberto',
    hiddenBody:
      'O app continua rodando na bandeja. Clique no ícone para abrir de novo, ou "Sair" para encerrar.'
  },
  es: {
    open: 'Abrir LouvorJA Libras',
    quit: 'Salir',
    hidden: 'LouvorJA Libras sigue abierto',
    hiddenBody:
      'La app sigue ejecutándose en la bandeja. Haz clic en el ícono para abrirla de nuevo, o "Salir" para cerrarla.'
  },
  en: {
    open: 'Open LouvorJA Libras',
    quit: 'Quit',
    hidden: 'LouvorJA Libras is still running',
    hiddenBody:
      'The app keeps running in the tray. Click the icon to reopen it, or "Quit" to close it for good.'
  }
}

/**
 * Keeps the app reachable after the window is minimized: with "Executar em segundo plano" on,
 * minimizing (see ipc/index.ts) hides the window instead of dropping it to the taskbar, and this
 * tray icon is the way back - or, through its menu, the actual way to quit. Closing the window
 * (the titlebar's own "X") always quits, regardless of that setting.
 */
export function createTray(getWindow: () => BrowserWindow, locale: AppLocale): Tray {
  const strings = STRINGS[locale]
  const tray = new Tray(icon)
  tray.setToolTip('LouvorJA Libras')

  const show = (): void => {
    const win = getWindow()
    win.show()
    win.focus()
  }

  tray.on('click', show)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: strings.open, click: show },
      { type: 'separator' },
      { label: strings.quit, click: () => app.quit() }
    ])
  )

  return tray
}

/** Told once per run, the first time the window is hidden rather than closed for good. */
export function notifyHiddenToTray(locale: AppLocale): void {
  if (!Notification.isSupported()) return
  const { hidden, hiddenBody } = STRINGS[locale]
  new Notification({ title: hidden, body: hiddenBody }).show()
}
