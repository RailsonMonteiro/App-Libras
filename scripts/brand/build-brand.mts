// Run with: npm run brand:build
// Builds the old combined logo (kept for AppSidebar.vue, not shown anywhere live any more) from
// the two artworks:
//   src/assets/images/logo-louvorja.svg   the LouvorJA mark
//   public/assets/logos/Libras.svg        the Libras hands (a black, single-colour file)
// and writes src/assets/images/logo.svg (the mark with the hands over its lower right corner).
//
// The application icon (build/icon.png, build/icon.ico, build/icon.icns) and the tray icon
// (src/assets/images/icon.png) come from the real logo instead - the hands alone, the app's main
// mark since 2026 - not from the combined artwork above:
//   src/assets/images/icon_electron.webp   the application icon's source
//   src/assets/images/icon.webp            the tray icon's source (a smaller copy)
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'

const root = resolve(import.meta.dirname, '../..')

// --- 1. The logo -------------------------------------------------------------------------------

const mark = readFileSync(resolve(root, 'src/assets/images/logo-louvorja.svg'), 'utf8')
const hands = readFileSync(resolve(root, 'public/assets/logos/Libras.svg'), 'utf8')

/** The paths of the LouvorJA mark (the original file keeps them in a group that it then uses). */
const markBody = /<g id="a">([\s\S]*)<\/g><\/defs>/.exec(mark)?.[1]
const handsPath = /<path[^>]* d="([^"]+)"/.exec(hands)?.[1]
const handsBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(hands)
if (!markBody || !handsPath || !handsBox) throw new Error('Unexpected artwork format')

const MARK = { width: 275, height: 285 }
const HANDS = { width: 190, x: 196, y: 106, halo: 4 }
const scale = HANDS.width / Number(handsBox[1])
const handsHeight = Number(handsBox[2]) * scale
const LOGO = { width: 392, height: Math.ceil(HANDS.y + handsHeight + HANDS.halo + 2) }

const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO.width} ${LOGO.height}" width="${LOGO.width}" height="${LOGO.height}">
<defs>
<linearGradient id="libras-gradient" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#ffc107"/>
<stop offset="1" stop-color="#0097d7"/>
</linearGradient>
</defs>
<g>${markBody}</g>
<path transform="translate(${HANDS.x} ${HANDS.y}) scale(${scale.toFixed(6)})" d="${handsPath}" fill="url(#libras-gradient)" stroke="#ffffff" stroke-width="${((2 * HANDS.halo) / scale).toFixed(0)}" stroke-linejoin="round" paint-order="stroke"/>
</svg>
`
if (MARK.width > LOGO.width || MARK.height > LOGO.height) throw new Error('Canvas too small')
writeFileSync(resolve(root, 'src/assets/images/logo.svg'), logo)
console.log(`logo.svg ${LOGO.width}x${LOGO.height}`)

// --- 2. The icons ------------------------------------------------------------------------------

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

/** Draws `artwork` (a .webp image), centred with a margin, on a transparent square of each size. */
async function render(artwork: Buffer, sizes: number[]): Promise<Map<number, Buffer>> {
  const scratch = mkdtempSync(join(tmpdir(), 'brand-'))
  const main = join(scratch, 'main.cjs')
  writeFileSync(main, "require('electron').app.whenReady().then(() => {})")
  // Editors built on Electron export ELECTRON_RUN_AS_NODE, which would boot it as plain Node.
  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [main], env })
  try {
    const dataUrl = `data:image/webp;base64,${artwork.toString('base64')}`
    const result = await app.evaluate(
      async ({ BrowserWindow }, { url, sizes }) => {
        const win = new BrowserWindow({ show: false })
        await win.loadURL('data:text/html,<body></body>')
        const script = `(async () => {
          const image = new Image()
          image.src = ${JSON.stringify(url)}
          await image.decode()
          const out = {}
          for (const size of ${JSON.stringify(sizes)}) {
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = size
            const ctx = canvas.getContext('2d')
            ctx.imageSmoothingQuality = 'high'
            const margin = size * 0.06
            const fit = Math.min(
              (size - 2 * margin) / image.naturalWidth,
              (size - 2 * margin) / image.naturalHeight
            )
            const w = image.naturalWidth * fit
            const h = image.naturalHeight * fit
            ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h)
            out[size] = canvas.toDataURL('image/png').split(',')[1]
          }
          return out
        })()`
        const pngs = (await win.webContents.executeJavaScript(script)) as Record<string, string>
        win.destroy()
        return pngs
      },
      { url: dataUrl, sizes }
    )
    return new Map(
      Object.entries(result).map(([size, b64]) => [Number(size), Buffer.from(b64, 'base64')])
    )
  } finally {
    await app.close()
  }
}

/** A Windows icon: a list of PNG images (Vista and later read them directly). */
function ico(images: Array<[number, Buffer]>): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  const directory = Buffer.alloc(16 * images.length)
  let offset = header.length + directory.length
  images.forEach(([size, png], index) => {
    const entry = index * 16
    directory.writeUInt8(size >= 256 ? 0 : size, entry) // 0 means 256
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    directory.writeUInt16LE(1, entry + 4) // colour planes
    directory.writeUInt16LE(32, entry + 6) // bits per pixel
    directory.writeUInt32LE(png.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, directory, ...images.map(([, png]) => png)])
}

/** A macOS icon: PNG images tagged with the size they are for. */
function icns(images: Array<[string, Buffer]>): Buffer {
  const chunks = images.map(([type, png]) => {
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([head, png])
  })
  const total = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 'ascii')
  head.writeUInt32BE(total, 4)
  return Buffer.concat([head, ...chunks])
}

const iconArtwork = readFileSync(resolve(root, 'src/assets/images/icon_electron.webp'))
const png = await render(iconArtwork, SIZES)
const get = (size: number): Buffer => {
  const image = png.get(size)
  if (!image) throw new Error(`No ${size}px image`)
  return image
}

mkdirSync(resolve(root, 'build'), { recursive: true })
writeFileSync(resolve(root, 'build/icon.png'), get(512))
writeFileSync(
  resolve(root, 'build/icon.ico'),
  ico([16, 24, 32, 48, 64, 128, 256].map((size) => [size, get(size)]))
)
writeFileSync(
  resolve(root, 'build/icon.icns'),
  icns([
    ['icp4', get(16)],
    ['icp5', get(32)],
    ['icp6', get(64)],
    ['ic07', get(128)],
    ['ic08', get(256)],
    ['ic09', get(512)],
    ['ic10', get(1024)]
  ])
)
console.log('build/icon.png, build/icon.ico, build/icon.icns')

// --- 3. The tray icon --------------------------------------------------------------------------
// Electron's nativeImage can't decode .webp (unlike Chromium's own <img>/<canvas>, used above,
// which is fine with it) - a Tray built straight from a .webp file shows no icon at all. This PNG
// copy is what createTray.ts actually loads.

const trayArtwork = readFileSync(resolve(root, 'src/assets/images/icon.webp'))
const trayPng = await render(trayArtwork, [256])
writeFileSync(resolve(root, 'src/assets/images/icon.png'), trayPng.get(256)!)
console.log('src/assets/images/icon.png')
