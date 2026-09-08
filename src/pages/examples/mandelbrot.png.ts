import type { APIRoute } from 'astro'
import sharp from 'sharp'
import {
  DEFAULT_MANDELBROT_VIEW,
  MANDELBROT_SIZE,
  mandelbrotPixels,
} from '../../lib/visualizations/mandelbrot'

export const GET: APIRoute = async () => {
  const pixels = mandelbrotPixels(DEFAULT_MANDELBROT_VIEW)
  const png = await sharp(Buffer.from(pixels), {
    raw: { width: MANDELBROT_SIZE.width, height: MANDELBROT_SIZE.height, channels: 4 },
  })
    .png()
    .toBuffer()
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
