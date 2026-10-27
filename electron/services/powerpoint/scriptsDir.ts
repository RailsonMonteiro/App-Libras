import { join } from 'node:path'
import { app } from 'electron'

/** Where the bundled PowerShell scripts live - a packaged build cannot run one from inside
 *  app.asar, so they are copied out as an extraResource (see electron-builder.yml) instead. */
export function scriptsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'powershell')
    : join(app.getAppPath(), 'electron/services/powerpoint/scripts')
}
