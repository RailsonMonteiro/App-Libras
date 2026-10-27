import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { scriptsDir } from './scriptsDir'

const execFileAsync = promisify(execFile)

export interface PptxSlideText {
  /** 0-based, matching Slide.index elsewhere in this project. */
  index: number
  text: string
}

const loadFileResultSchema = z.object({
  slides: z.array(z.object({ index: z.number(), text: z.string() }))
})

async function runScript(script: string, args: string[], timeoutMs: number): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(scriptsDir(), script),
      ...args
    ],
    { windowsHide: true, timeout: timeoutMs }
  )
  return stdout
}

/** Opens this file hidden via COM (see loadFile.ps1) and returns every slide's text. Leaves the
 *  file open - see runCloseFile. */
export async function runLoadFile(path: string): Promise<PptxSlideText[]> {
  const stdout = await runScript('loadFile.ps1', ['-Path', path], 30_000)
  const parsed = loadFileResultSchema.parse(JSON.parse(stdout))
  return parsed.slides.map((s) => ({ index: s.index - 1, text: s.text }))
}

/** Closes this file in the hidden PowerPoint instance, best-effort (see closeFile.ps1). */
export async function runCloseFile(path: string): Promise<void> {
  await runScript('closeFile.ps1', ['-Path', path], 10_000)
}

/** Exports one slide of this (already hidden-open) file as a PNG (see exportSlide.ps1). */
export async function runExportSlide(path: string, index: number, outPath: string): Promise<void> {
  await runScript(
    'exportSlide.ps1',
    ['-Path', path, '-Index', String(index), '-OutPath', outPath],
    15_000
  )
}
