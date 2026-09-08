/** Pikurn: finite, adaptive betting without replacement. No runtime dependencies. */
export type State = Readonly<{ g: number; r: number; b: number; n: number }>
export type Objective = 'expected' | 'guaranteed'
export type Outcome = 'G' | 'R' | 'B'
export type Decision = Readonly<{ value: number; fraction: number }>
export type Policy = (state: State) => number
export type Branch = Readonly<{ outcome: Outcome; probability: number; next: State | null }>
export type TerminalPath = Readonly<{ path: Outcome[]; probability: number; wealth: number }>

/** Extra requested draws are harmless: the game also ends when the bag empties. */
function normalize(state: State): State {
  for (const key of ['g', 'r', 'b', 'n'] as const) {
    if (!Number.isSafeInteger(state[key]) || state[key] < 0) {
      throw new RangeError(`${key} must be a nonnegative safe integer`)
    }
  }
  const total = state.g + state.r + state.b
  if (!Number.isSafeInteger(total)) throw new RangeError('The bag total must be a safe integer')
  return { ...state, n: Math.min(state.n, total) }
}

function branches(state: State): Branch[] {
  if (state.n === 0) return []
  const total = state.g + state.r + state.b
  const result: Branch[] = []
  if (state.g) {
    result.push({
      outcome: 'G',
      probability: state.g / total,
      next: { ...state, g: state.g - 1, n: state.n - 1 },
    })
  }
  if (state.r) {
    result.push({
      outcome: 'R',
      probability: state.r / total,
      next: { ...state, r: state.r - 1, n: state.n - 1 },
    })
  }
  if (state.b) result.push({ outcome: 'B', probability: state.b / total, next: null })
  return result
}

/** Feasible draws only. Blue returns the stake and immediately terminates play. */
export function outcomes(state: State): Branch[] {
  return branches(normalize(state))
}

export function transition(state: State, outcome: Outcome): State | null {
  const branch = outcomes(state).find((candidate) => candidate.outcome === outcome)
  if (!branch) throw new RangeError(`Cannot draw ${outcome} from this state`)
  return branch.next
}

type Line = { intercept: number; slope: number }

function finite(value: number, quantity: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${quantity} exceeded the finite IEEE-754 number range`)
  }
  return value
}

/** Maximum of a lower envelope of affine functions occurs at an endpoint or crossing. */
function guarantee(lines: Line[]): Decision {
  const candidates = [0, 1]
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!
      const b = lines[j]!
      if (a.slope === b.slope) continue
      const difference = finite(b.intercept - a.intercept, 'Continuation difference')
      const slope = finite(a.slope - b.slope, 'Continuation slope difference')
      const f = finite(difference / slope, 'Candidate wager')
      if (f > 0 && f < 1) candidates.push(f)
    }
  }
  let best: Decision | undefined
  for (const fraction of candidates.sort((a, b) => a - b)) {
    const value = Math.min(
      ...lines.map((line) => finite(line.intercept + line.slope * fraction, 'Normalized wealth'))
    )
    // Floating-point near ties retain the smaller wager; errors scale with the value.
    const tolerance = 32 * Number.EPSILON * Math.max(1, value, best?.value ?? 0)
    if (!best || value - best.value > tolerance) best = { value, fraction }
  }
  return best!
}

/**
 * Optimal terminal wealth per starting dollar and first wager fraction.
 * Later decisions are adaptive: solve again after observing each draw.
 * Values use IEEE-754 arithmetic, not rational arithmetic or Monte Carlo.
 * Numerical overflow throws RangeError instead of returning a misleading policy.
 */
export function solve(input: State, objective: Objective = 'expected'): Decision {
  if (objective !== 'expected' && objective !== 'guaranteed') {
    throw new RangeError('Unknown objective')
  }
  const initial = normalize(input)
  const memo = new Map<string, Decision>()
  function visit(state: State): Decision {
    if (state.n === 0) return { value: 1, fraction: 0 }
    const key = `${state.g},${state.r},${state.b},${state.n}`
    const cached = memo.get(key)
    if (cached) return cached
    const choices = branches(state)
    const lines = choices.map(({ outcome, next }) => {
      const value = next ? visit(next).value : 1
      return { intercept: value, slope: outcome === 'G' ? value : outcome === 'R' ? -value : 0 }
    })
    let result: Decision
    if (objective === 'expected') {
      const intercept = finite(
        lines.reduce((sum, line, i) => sum + choices[i]!.probability * line.intercept, 0),
        'Expected continuation wealth'
      )
      const slope = finite(
        lines.reduce((sum, line, i) => sum + choices[i]!.probability * line.slope, 0),
        'Expected continuation slope'
      )
      const tolerance = 32 * Number.EPSILON * Math.max(1, intercept)
      const fraction = slope > tolerance ? 1 : 0
      result = { value: finite(intercept + slope * fraction, 'Normalized wealth'), fraction }
    } else result = guarantee(lines)
    memo.set(key, result)
    return result
  }
  return visit(initial)
}

/**
 * Enumerate every possible color sequence, retaining its true probability.
 * This is exponential in the horizon; use small bags for trees and histograms.
 * A policy is a deterministic wager fraction based on the observed remaining bag.
 * A path whose wealth overflows the finite number range throws RangeError.
 */
export function enumerate(input: State, policy: Policy, bankroll = 100): TerminalPath[] {
  const initial = normalize(input)
  if (!Number.isFinite(bankroll) || bankroll < 0)
    throw new RangeError('Bankroll must be finite and nonnegative')
  const result: TerminalPath[] = []
  function walk(state: State | null, path: Outcome[], probability: number, wealth: number): void {
    if (!state || state.n === 0) {
      result.push({ path, probability, wealth })
      return
    }
    const fraction = policy(state)
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
      throw new RangeError('Policy must return a finite wager fraction in [0, 1]')
    }
    for (const branch of branches(state)) {
      const multiplier =
        branch.outcome === 'G' ? 1 + fraction : branch.outcome === 'R' ? 1 - fraction : 1
      walk(
        branch.next,
        [...path, branch.outcome],
        probability * branch.probability,
        finite(wealth * multiplier, 'Path wealth')
      )
    }
  }
  walk(initial, [], 1, bankroll)
  return result
}

// Node 24.2+ runs TypeScript directly. Importing this module never runs the CLI.
// Usage: node pikurn.ts [green=2] [red=1] [blue=0] [draws=bag-size] [bankroll=100]
if (import.meta.main) {
  const args = process.argv.slice(2).map(Number)
  const g = args[0] ?? 2
  const r = args[1] ?? 1
  const b = args[2] ?? 0
  const state: State = { g, r, b, n: args[3] ?? g + r + b }
  const bankroll = args[4] ?? 100
  for (const objective of ['expected', 'guaranteed'] as const) {
    const decision = solve(state, objective)
    console.log(
      `${objective}: first wager ${(100 * decision.fraction).toFixed(2)}%; value $${(bankroll * decision.value).toFixed(2)}`
    )
    console.table(
      enumerate(state, (next) => solve(next, objective).fraction, bankroll).map((leaf) => ({
        path: leaf.path.join('') || '(no draws)',
        probability: leaf.probability,
        wealth: leaf.wealth,
      }))
    )
  }
}
