import { BrowserWindow } from 'electron'
import { z } from 'zod'
import { IpcChannels, POWERPOINT_ACTIONS, type RemoteKey } from '../../../src/types/ipc'
import type { PowerPointService } from '../../services/powerpoint/PowerPointService'
import { handle } from './handle'

export function registerPowerPointIpc(
  service: PowerPointService,
  bindRemote: (on: boolean) => void
): { sendRemoteKey: (key: RemoteKey) => void } {
  handle(IpcChannels.powerpointGetState, z.undefined(), () => service.getState())
  handle(IpcChannels.powerpointControl, z.enum(POWERPOINT_ACTIONS), (action) =>
    service.control(action)
  )
  handle(IpcChannels.powerpointListOpen, z.undefined(), () => service.listOpen())
  handle(IpcChannels.powerpointLink, z.string().min(1), (path) => service.link(path))
  handle(IpcChannels.powerpointBindRemote, z.boolean(), (on) => bindRemote(on))

  const broadcast = (channel: string, payload: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }
  service.onEvent((event) => broadcast(IpcChannels.powerpointEvent, event))
  return { sendRemoteKey: (key) => broadcast(IpcChannels.powerpointRemoteKey, key) }
}
