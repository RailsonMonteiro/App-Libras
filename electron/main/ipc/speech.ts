import { BrowserWindow, shell } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../src/types/ipc'
import type { SpeechService } from '../../services/speech/SpeechService'
import { handle } from './handle'

/** Windows' own settings pages - fixed addresses, never anything from the renderer. */
const SETTINGS_PAGES = {
  privacy: 'ms-settings:privacy-speech',
  microphone: 'ms-settings:privacy-microphone'
} as const

export function registerSpeechIpc(service: SpeechService): void {
  handle(IpcChannels.speechGetState, z.undefined(), () => service.getState())
  handle(IpcChannels.speechStart, z.undefined(), () => service.start())
  handle(IpcChannels.speechStop, z.undefined(), () => service.stop())
  handle(IpcChannels.speechOpenSettings, z.enum(['privacy', 'microphone']), (kind) =>
    shell.openExternal(SETTINGS_PAGES[kind])
  )

  service.onEvent((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.speechEvent, event)
    }
  })
}
