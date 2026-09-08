export const HARMONIC_LIMITS = {
  fundamental: { min: 1, max: 8, step: 1 },
  harmonic: { min: 1, max: 12, step: 1 },
  amplitude: { min: 0, max: 1, step: 0.05 },
  phase: { min: -180, max: 180, step: 5 },
} as const

export type HarmonicState = {
  fundamental: number
  harmonic: number
  amplitude: number
  phase: number
}

export const DEFAULT_HARMONIC_STATE: HarmonicState = {
  fundamental: 1,
  harmonic: 3,
  amplitude: 0.45,
  phase: 0,
}

export const HARMONIC_PRESETS = {
  'Pure sine': { fundamental: 1, harmonic: 3, amplitude: 0, phase: 0 },
  'Warm third': DEFAULT_HARMONIC_STATE,
  'Strong third': { fundamental: 1, harmonic: 3, amplitude: 0.9, phase: 0 },
} as const satisfies Record<string, HarmonicState>

export type HarmonicPoint = { x: number; y: number }

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(
  value: number,
  { min, max, step }: (typeof HARMONIC_LIMITS)[keyof typeof HARMONIC_LIMITS]
) {
  const rounded = Math.round((Math.min(max, Math.max(min, value)) - min) / step) * step + min
  return Number(rounded.toFixed(8))
}

export function normalizeHarmonicState(value: Partial<HarmonicState> = {}): HarmonicState {
  return {
    fundamental: clamp(
      finite(value.fundamental, DEFAULT_HARMONIC_STATE.fundamental),
      HARMONIC_LIMITS.fundamental
    ),
    harmonic: clamp(
      finite(value.harmonic, DEFAULT_HARMONIC_STATE.harmonic),
      HARMONIC_LIMITS.harmonic
    ),
    amplitude: clamp(
      finite(value.amplitude, DEFAULT_HARMONIC_STATE.amplitude),
      HARMONIC_LIMITS.amplitude
    ),
    phase: clamp(finite(value.phase, DEFAULT_HARMONIC_STATE.phase), HARMONIC_LIMITS.phase),
  }
}

export function harmonicValue(x: number, state: HarmonicState): number {
  const phase = (state.phase * Math.PI) / 180
  return (
    Math.sin(2 * Math.PI * state.fundamental * x) +
    state.amplitude * Math.sin(2 * Math.PI * state.harmonic * x + phase)
  )
}

export function harmonicSamples(state: HarmonicState, count = 241): HarmonicPoint[] {
  if (!Number.isInteger(count) || count < 2)
    throw new RangeError('Sample count must be an integer of at least 2')
  const normalized = normalizeHarmonicState(state)
  return Array.from({ length: count }, (_, index) => {
    const x = index / (count - 1)
    return { x, y: harmonicValue(x, normalized) }
  })
}

function queryKeys(namespace: string): Record<keyof HarmonicState, string> {
  return {
    fundamental: `${namespace}-f`,
    harmonic: `${namespace}-h`,
    amplitude: `${namespace}-a`,
    phase: `${namespace}-p`,
  }
}

export function harmonicHasState(search: string, namespace = 'hv'): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return Object.values(queryKeys(namespace)).some((key) => params.has(key))
}

export function harmonicStateFromSearch(search: string, namespace = 'hv'): HarmonicState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const raw: Partial<HarmonicState> = {}
  for (const [name, key] of Object.entries(queryKeys(namespace)) as [
    keyof HarmonicState,
    string,
  ][]) {
    const value = params.get(key)
    if (value !== null && value.trim() !== '') raw[name] = Number(value)
  }
  return normalizeHarmonicState(raw)
}

export function harmonicSearch(state: HarmonicState, base = '', namespace = 'hv'): string {
  const params = new URLSearchParams(base.startsWith('?') ? base.slice(1) : base)
  const normalized = normalizeHarmonicState(state)
  for (const [name, key] of Object.entries(queryKeys(namespace)) as [keyof HarmonicState, string][])
    params.set(key, String(normalized[name]))
  return params.toString()
}

export function harmonicCsv(state: HarmonicState): string {
  const normalized = normalizeHarmonicState(state)
  const rows = harmonicSamples(normalized).map(({ x, y }) => `${x.toFixed(6)},${y.toFixed(8)}`)
  return [
    `# fundamental=${normalized.fundamental}, harmonic=${normalized.harmonic}, amplitude=${normalized.amplitude}, phase_degrees=${normalized.phase}`,
    'x,signal',
    ...rows,
  ].join('\n')
}
