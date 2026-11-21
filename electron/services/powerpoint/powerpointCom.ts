import { execFile, spawn } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import { z } from 'zod'
import type { OpenPresentation, PowerPointAction } from '../../../src/types/ipc'
import { scriptsDir } from './scriptsDir'

const execFileAsync = promisify(execFile)

export interface PptxSlideText {
  /** 0-based, matching Slide.index elsewhere in this project. */
  index: number
  text: string
}

export interface LinkedPresentation {
  slides: PptxSlideText[]
  /** 1-based slide its slide show is on right now; `null` while it is not presenting. */
  showIndex: number | null
}

export interface ShowPosition {
  presenting: boolean
  /** 1-based; `null` while not presenting. */
  index: number | null
}

const listOpenSchema = z.object({
  presentations: z.array(z.object({ path: z.string(), name: z.string() }))
})
const readOpenSchema = z.object({
  slides: z.array(z.object({ index: z.number(), text: z.string() })),
  showIndex: z.number().nullable()
})
const showPositionSchema = z.object({ presenting: z.boolean(), index: z.number().nullable() })

/** PowerShell's ConvertTo-Json writes a one-item array as a bare object (and an empty one as
 *  nothing at all) - put both back to a real array before validating. */
function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  return value === null || value === undefined || value === '' ? [] : [value]
}

export function scriptPath(script: string): string {
  return join(scriptsDir(), script)
}

async function runScript(script: string, args: string[], timeoutMs: number): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath(script),
      ...args
    ],
    { windowsHide: true, timeout: timeoutMs, encoding: 'utf8' }
  )
  // The scripts write UTF-8 (paths with accents: "Área de Trabalho") - drop a BOM if one slips in.
  return stdout.replace(/^\uFEFF/, '')
}

/** The presentations open in the person's own PowerPoint (see listOpen.ps1). */
export async function runListOpen(): Promise<OpenPresentation[]> {
  const raw = JSON.parse(await runScript('listOpen.ps1', [], 10_000))
  return listOpenSchema.parse({ presentations: asArray(raw.presentations) }).presentations
}

/** Every slide's text of this already-open presentation, and where its show is (readOpen.ps1). */
export async function runReadOpen(path: string): Promise<LinkedPresentation> {
  const raw = JSON.parse(await runScript('readOpen.ps1', ['-Path', path], 30_000))
  const parsed = readOpenSchema.parse({ ...raw, slides: asArray(raw.slides) })
  return {
    slides: parsed.slides.map((s) => ({ index: s.index - 1, text: s.text })),
    showIndex: parsed.showIndex
  }
}

/** Drives this presentation's slide show and reports where it ended up (sendCommand.ps1). */
export async function runSendCommand(
  path: string,
  action: PowerPointAction
): Promise<ShowPosition> {
  const stdout = await runScript('sendCommand.ps1', ['-Path', path, '-Command', action], 10_000)
  return showPositionSchema.parse(JSON.parse(stdout))
}

/** Where this presentation's slide show is, without changing anything (sendCommand.ps1). */
export async function runShowPosition(path: string): Promise<ShowPosition> {
  const stdout = await runScript('sendCommand.ps1', ['-Path', path, '-Command', 'position'], 10_000)
  return showPositionSchema.parse(JSON.parse(stdout))
}

const ocrLineSchema = z.object({ index: z.number(), text: z.string() })

/** Reads the text drawn inside these slides with Windows' OCR (see ocrSlides.ps1), reporting
 *  each one (0-based index, like PptxSlideText) as soon as it is read. Aborting stops it. */
export function runOcrSlides(
  path: string,
  indexes: number[],
  onSlide: (slide: PptxSlideText) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath('ocrSlides.ps1'),
        '-Path',
        path,
        '-Indexes',
        indexes.map((index) => index + 1).join(',')
      ],
      { windowsHide: true, signal }
    )
    createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const parsed = ocrLineSchema.parse(JSON.parse(line.replace(/^\uFEFF/, '')))
        onSlide({ index: parsed.index - 1, text: parsed.text })
      } catch {
        // Not one of its lines (a stray PowerShell message) - ignore it.
      }
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(code === 3 ? 'No OCR language installed' : `OCR exited with ${code}`))
    })
  })
}

/** Exports one slide of this open presentation as a PNG (see exportSlide.ps1). */
export async function runExportSlide(path: string, index: number, outPath: string): Promise<void> {
  await runScript(
    'exportSlide.ps1',
    ['-Path', path, '-Index', String(index), '-OutPath', outPath],
    15_000
  )
}
