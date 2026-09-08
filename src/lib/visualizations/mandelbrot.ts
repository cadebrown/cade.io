export type MandelbrotView = {
  centerX: number
  centerY: number
  span: number
  iterations: number
}

export const MANDELBROT_SIZE = { width: 720, height: 480 } as const
export const MANDELBROT_LIMITS = { iterations: { min: 20, max: 800 } } as const
export const DEFAULT_MANDELBROT_VIEW: MandelbrotView = {
  centerX: -0.5,
  centerY: 0,
  span: 3.2,
  iterations: 180,
}
export const MANDELBROT_PRESETS = {
  'Full set': DEFAULT_MANDELBROT_VIEW,
  'Seahorse valley': { centerX: -0.743643887, centerY: 0.131825904, span: 0.012, iterations: 420 },
  'Elephant valley': { centerX: 0.285, centerY: 0.01, span: 0.075, iterations: 360 },
} as const satisfies Record<string, MandelbrotView>

export function normalizeMandelbrotView(value: Partial<MandelbrotView> = {}): MandelbrotView {
  const number = (input: unknown, fallback: number) =>
    typeof input === 'number' && Number.isFinite(input) ? input : fallback
  return {
    centerX: Math.min(2, Math.max(-2.5, number(value.centerX, DEFAULT_MANDELBROT_VIEW.centerX))),
    centerY: Math.min(1.5, Math.max(-1.5, number(value.centerY, DEFAULT_MANDELBROT_VIEW.centerY))),
    span: Math.min(4, Math.max(0.00001, number(value.span, DEFAULT_MANDELBROT_VIEW.span))),
    iterations: Math.round(
      Math.min(
        MANDELBROT_LIMITS.iterations.max,
        Math.max(
          MANDELBROT_LIMITS.iterations.min,
          number(value.iterations, DEFAULT_MANDELBROT_VIEW.iterations)
        )
      )
    ),
  }
}

export function mandelbrotEscape(real: number, imaginary: number, iterations: number): number {
  const limit = normalizeMandelbrotView({ iterations }).iterations
  let zr = 0
  let zi = 0
  for (let index = 0; index < limit; index++) {
    const nextReal = zr * zr - zi * zi + real
    zi = 2 * zr * zi + imaginary
    zr = nextReal
    if (zr * zr + zi * zi > 4) return index + 1
  }
  return limit
}

export function mandelbrotPixels(
  view: MandelbrotView,
  width: number = MANDELBROT_SIZE.width,
  height: number = MANDELBROT_SIZE.height
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new RangeError('Image dimensions must be positive integers')
  const model = normalizeMandelbrotView(view)
  const pixels = new Uint8ClampedArray(width * height * 4)
  const verticalSpan = model.span * (height / width)
  for (let y = 0; y < height; y++) {
    const imaginary = model.centerY + verticalSpan / 2 - (y / (height - 1 || 1)) * verticalSpan
    for (let x = 0; x < width; x++) {
      const real = model.centerX - model.span / 2 + (x / (width - 1 || 1)) * model.span
      const escaped = mandelbrotEscape(real, imaginary, model.iterations)
      const offset = (y * width + x) * 4
      if (escaped === model.iterations) {
        pixels[offset + 3] = 255
        continue
      }
      const t = escaped / model.iterations
      pixels[offset] = Math.round(20 + 80 * t)
      pixels[offset + 1] = Math.round(70 + 120 * t)
      pixels[offset + 2] = Math.round(120 + 125 * t)
      pixels[offset + 3] = 255
    }
  }
  return pixels
}

/** A response from a superseded worker request must never replace the current view. */
export function isCurrentMandelbrotRequest(responseId: number, currentId: number): boolean {
  return Number.isSafeInteger(responseId) && responseId === currentId
}
