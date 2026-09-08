import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HARMONIC_STATE,
  harmonicCsv,
  harmonicHasState,
  harmonicSamples,
  harmonicSearch,
  harmonicStateFromSearch,
  harmonicValue,
  normalizeHarmonicState,
} from '../src/lib/visualizations/harmonics'
import {
  DEFAULT_MANDELBROT_VIEW,
  isCurrentMandelbrotRequest,
  mandelbrotEscape,
  mandelbrotPixels,
  normalizeMandelbrotView,
} from '../src/lib/visualizations/mandelbrot'

describe('harmonic visualization model', () => {
  it('calculates an exact sine baseline and evenly spaced samples', () => {
    expect(harmonicValue(0.25, { ...DEFAULT_HARMONIC_STATE, amplitude: 0 })).toBeCloseTo(1, 14)
    expect(harmonicSamples(DEFAULT_HARMONIC_STATE, 3).map((point) => point.x)).toEqual([0, 0.5, 1])
  })

  it('normalizes out-of-range, fractional, and non-finite control data', () => {
    expect(
      normalizeHarmonicState({ fundamental: 99, harmonic: 3.6, amplitude: -1, phase: Infinity })
    ).toEqual({ fundamental: 8, harmonic: 4, amplitude: 0, phase: 0 })
    expect(() => harmonicSamples(DEFAULT_HARMONIC_STATE, 1)).toThrow(RangeError)
  })

  it('round-trips only namespaced, validated query parameters', () => {
    const state = { fundamental: 2, harmonic: 7, amplitude: 0.35, phase: -45 }
    const search = harmonicSearch(state, 'unrelated=kept')
    expect(search).toContain('unrelated=kept')
    expect(harmonicStateFromSearch(search)).toEqual(state)
    expect(harmonicStateFromSearch('hv-f=999&hv-a=not-a-number&other=value')).toEqual({
      ...DEFAULT_HARMONIC_STATE,
      fundamental: 8,
    })
    expect(harmonicHasState('other=value')).toBe(false)
    expect(harmonicHasState('second-hv-f=2', 'second-hv')).toBe(true)
    expect(harmonicStateFromSearch('second-hv-f=2&second-hv-h=5', 'second-hv')).toEqual({
      ...DEFAULT_HARMONIC_STATE,
      fundamental: 2,
      harmonic: 5,
    })
  })

  it('exports a self-describing CSV with stable sample count', () => {
    const rows = harmonicCsv(DEFAULT_HARMONIC_STATE).split('\n')
    expect(rows[0]).toContain('fundamental=1')
    expect(rows[1]).toBe('x,signal')
    expect(rows).toHaveLength(243)
  })
})

describe('Mandelbrot pixel model', () => {
  it('keeps the origin bounded and escapes a point outside the set', () => {
    expect(mandelbrotEscape(0, 0, 80)).toBe(80)
    expect(mandelbrotEscape(2, 2, 80)).toBeLessThan(80)
  })

  it('is deterministic and gives the bounded set opaque black pixels', () => {
    const pixels = mandelbrotPixels(DEFAULT_MANDELBROT_VIEW, 3, 3)
    expect([...pixels]).toEqual([...mandelbrotPixels(DEFAULT_MANDELBROT_VIEW, 3, 3)])
    expect([...pixels.slice(16, 20)]).toEqual([0, 0, 0, 255])
  })

  it('clamps view limits and rejects invalid image dimensions', () => {
    expect(
      normalizeMandelbrotView({ centerX: 9, centerY: -9, span: -1, iterations: 9999 })
    ).toEqual({ centerX: 2, centerY: -1.5, span: 0.00001, iterations: 800 })
    expect(() => mandelbrotPixels(DEFAULT_MANDELBROT_VIEW, 0, 3)).toThrow(RangeError)
  })

  it('accepts only the latest worker result when requests overlap', () => {
    expect(isCurrentMandelbrotRequest(4, 4)).toBe(true)
    expect(isCurrentMandelbrotRequest(3, 4)).toBe(false)
    expect(isCurrentMandelbrotRequest(4.1, 4)).toBe(false)
  })
})
