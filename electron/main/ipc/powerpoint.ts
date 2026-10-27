import { BrowserWindow, dialog } from 'electron'
import { z } from 'zod'
import { IpcChannels, POWERPOINT_ACTIONS } from '../../../src/types/ipc'
import type { PowerPointService } from '../../services/powerpoint/PowerPointService'
import { handle } from './handle'

export function registerPowerPointIpc(service: PowerPointService): void {
  handle(IpcChannels.powerpointGetState, z.undefined(), () => service.getState())
  handle(IpcChannels.powerpointControl, z.enum(POWERPOINT_ACTIONS), (action) =>
    service.control(action)
  )
  handle(IpcChannels.powerpointPickFile, z.undefined(), async (_payload, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Vincular apresentação do PowerPoint',
      // .ppt (the old binary format) is not an OOXML package and cannot be read by this app.
      filters: [{ name: 'PowerPoint', extensions: ['pptx', 'pptm'] }],
      properties: ['openFile']
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  handle(IpcChannels.powerpointLoadFile, z.string().min(1), (path) => service.loadFile(path))

  service.onEvent((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.powerpointEvent, event)
    }
  })
}
