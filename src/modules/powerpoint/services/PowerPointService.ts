import { api } from '@/services/api'
import type { PowerPointAction, PowerPointPushEvent, PowerPointState } from '@/types/ipc'

/**
 * Renderer-side client of the PowerPoint file (read and driven entirely by this app - see
 * electron/services/powerpoint); this is a thin, typed wrapper over the IPC bridge.
 */
export const PowerPointService = {
  getState: (): Promise<PowerPointState> => api().powerpoint.getState(),
  control: (action: PowerPointAction): Promise<void> => api().powerpoint.control(action),
  pickFile: (): Promise<string | null> => api().powerpoint.pickFile(),
  loadFile: (path: string): Promise<void> => api().powerpoint.loadFile(path),
  onEvent: (listener: (event: PowerPointPushEvent) => void): (() => void) =>
    api().powerpoint.onEvent(listener)
}
