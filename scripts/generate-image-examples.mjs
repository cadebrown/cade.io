import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'
import { mandelbrotPixels } from '../src/lib/visualizations/mandelbrot.ts'

// Both examples use the same window and pixel grid; only the escape limit changes.
const output = new URL('../src/assets/examples/', import.meta.url)
await mkdir(output, { recursive: true })
for (const iterations of [40, 320]) {
  const pixels = mandelbrotPixels(
    { centerX: -0.65, centerY: 0.25, span: 1.3, iterations },
    720,
    480
  )
  await sharp(Buffer.from(pixels), { raw: { width: 720, height: 480, channels: 4 } })
    .png()
    .toFile(new URL(`mandelbrot-${iterations}.png`, output).pathname)
}
