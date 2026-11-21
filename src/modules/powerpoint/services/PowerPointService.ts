import { api } from '@/services/api'
import type {
  OpenPresentation,
  PowerPointAction,
  PowerPointPushEvent,
  PowerPointState,
  RemoteKey
} from '@/types/ipc'

/**
 * Renderer-side client of the linked PowerPoint presentation (opened by the person in their own
 * PowerPoint, driven by the main process - see electron/services/powerpoint); this is a thin,
 * typed wrapper over the IPC bridge.
 */
export const PowerPointService = {
  getState: (): Promise<PowerPointState> => api().powerpoint.getState(),
  control: (action: PowerPointAction): Promise<void> => api().powerpoint.control(action),
  listOpen: (): Promise<OpenPresentation[]> => api().powerpoint.listOpen(),
  link: (path: string): Promise<void> => api().powerpoint.link(path),
  bindRemote: (on: boolean): Promise<void> => api().powerpoint.bindRemote(on),
  onRemoteKey: (listener: (event: RemoteKey) => void): (() => void) =>
    api().powerpoint.onRemoteKey(listener),
  onEvent: (listener: (event: PowerPointPushEvent) => void): (() => void) =>
    api().powerpoint.onEvent(listener)
}
