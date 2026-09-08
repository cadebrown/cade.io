/// <reference lib="webworker" />
import { mandelbrotPixels, normalizeMandelbrotView, type MandelbrotView } from './mandelbrot'

export type MandelbrotWorkerRequest = {
  id: number
  width: number
  height: number
  view: MandelbrotView
}
export type MandelbrotWorkerResponse =
  { id: number; ok: true; pixels: ArrayBuffer } | { id: number; ok: false; message: string }

self.onmessage = ({ data }: MessageEvent<MandelbrotWorkerRequest>) => {
  try {
    const pixels = mandelbrotPixels(normalizeMandelbrotView(data.view), data.width, data.height)
    // Uint8ClampedArray is allocated locally, so its backing store is transferable.
    const buffer = pixels.buffer as ArrayBuffer
    const response: MandelbrotWorkerResponse = { id: data.id, ok: true, pixels: buffer }
    self.postMessage(response, [buffer])
  } catch (error) {
    const response: MandelbrotWorkerResponse = {
      id: data.id,
      ok: false,
      message: error instanceof Error ? error.message : 'Mandelbrot worker failed',
    }
    self.postMessage(response)
  }
}
