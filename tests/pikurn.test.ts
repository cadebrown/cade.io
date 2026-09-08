import { describe, expect, it } from 'vitest'
import {
  enumerate,
  outcomes,
  solve,
  transition,
  type Objective,
  type State,
} from '../content/posts/game-pikurn/pikurn'

const original: State = { g: 2, r: 1, b: 0, n: 3 }

function terminalStats(state: State, objective: Objective, bankroll = 100) {
  const leaves = enumerate(state, (next) => solve(next, objective).fraction, bankroll)
  return {
    leaves,
    probability: leaves.reduce((sum, leaf) => sum + leaf.probability, 0),
    expected: leaves.reduce((sum, leaf) => sum + leaf.probability * leaf.wealth, 0),
    guaranteed: Math.min(...leaves.map((leaf) => leaf.wealth)),
  }
}

// Independent finite-action dynamic program: explicitly try wagers on a uniform grid.
// Unlike the production solver, this does not derive slopes or line intersections.
function gridValue(initial: State, objective: Objective, divisions = 400): number {
  const memo = new Map<string, number>()
  function visit({ g, r, b, n }: State): number {
    if (n === 0 || g + r + b === 0) return 1
    const key = `${g}/${r}/${b}/${n}`
    if (memo.has(key)) return memo.get(key)!
    const green = g ? visit({ g: g - 1, r, b, n: n - 1 }) : 0
    const red = r ? visit({ g, r: r - 1, b, n: n - 1 }) : 0
    let best = -Infinity
    for (let wager = 0; wager <= divisions; wager++) {
      const f = wager / divisions
      const payoffs: number[] = []
      if (g) payoffs.push((1 + f) * green)
      if (r) payoffs.push((1 - f) * red)
      if (b) payoffs.push(1)
      const candidate =
        objective === 'guaranteed'
          ? Math.min(...payoffs)
          : (g * (1 + f) * green + r * (1 - f) * red + b) / (g + r + b)
      best = Math.max(best, candidate)
    }
    memo.set(key, best)
    return best
  }
  return visit(initial)
}

function binomial(n: number, k: number): number {
  let value = 1
  for (let j = 1; j <= k; j++) value = (value * (n - j + 1)) / j
  return value
}

describe('Pikurn rules and boundary cases', () => {
  it('draws without replacement and returns the blue stake immediately', () => {
    const state = { g: 2, r: 1, b: 1, n: 4 }
    expect(outcomes(state)).toEqual([
      { outcome: 'G', probability: 1 / 2, next: { g: 1, r: 1, b: 1, n: 3 } },
      { outcome: 'R', probability: 1 / 4, next: { g: 2, r: 0, b: 1, n: 3 } },
      { outcome: 'B', probability: 1 / 4, next: null },
    ])
    expect(transition(state, 'B')).toBeNull()
    const blue = enumerate(state, () => 1).find((leaf) => leaf.path.join('') === 'B')!
    expect(blue).toEqual({ path: ['B'], probability: 1 / 4, wealth: 100 })
  })

  it.each([
    { g: 0, r: 0, b: 0, n: 100 },
    { ...original, n: 0 },
  ])('keeps wealth in terminal state %j', (state) => {
    for (const objective of ['expected', 'guaranteed'] as const) {
      expect(solve(state, objective)).toEqual({ value: 1, fraction: 0 })
    }
    expect(outcomes(state)).toEqual([])
    expect(
      enumerate(
        state,
        () => {
          throw new Error('Terminal states never ask for wagers')
        },
        37
      )
    ).toEqual([{ path: [], probability: 1, wealth: 37 }])
    expect(() => transition(state, 'G')).toThrow()
  })

  it('clamps the draw horizon to the bag size', () => {
    expect(solve({ ...original, n: 99 })).toEqual(solve(original))
    expect(enumerate({ ...original, n: 99 }, () => 0)).toEqual(enumerate(original, () => 0))
  })

  it('respects short horizons and one-color bags', () => {
    expect(solve({ ...original, n: 1 })).toEqual({ value: 4 / 3, fraction: 1 })
    expect(solve({ ...original, n: 1 }, 'guaranteed')).toEqual({ value: 1, fraction: 0 })
    for (const objective of ['expected', 'guaranteed'] as const) {
      expect(solve({ g: 3, r: 0, b: 0, n: 3 }, objective)).toEqual({ value: 8, fraction: 1 })
      expect(solve({ g: 0, r: 3, b: 0, n: 3 }, objective)).toEqual({ value: 1, fraction: 0 })
      expect(solve({ g: 0, r: 0, b: 3, n: 3 }, objective)).toEqual({ value: 1, fraction: 0 })
    }
    expect(() => transition({ g: 1, r: 0, b: 0, n: 1 }, 'R')).toThrow()
  })

  it('rejects invalid states, wagers, and bankrolls', () => {
    for (const key of ['g', 'r', 'b', 'n'] as const) {
      for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => solve({ ...original, [key]: value })).toThrow(RangeError)
      }
    }
    expect(() => solve({ g: Number.MAX_SAFE_INTEGER, r: 1, b: 0, n: 0 })).toThrow(RangeError)
    for (const fraction of [-1, 1.01, NaN, Infinity]) {
      expect(() => enumerate(original, () => fraction)).toThrow(RangeError)
    }
    for (const bankroll of [-1, NaN, Infinity]) {
      expect(() => enumerate(original, () => 0, bankroll)).toThrow(RangeError)
    }
  })

  it.each(['expected', 'guaranteed'] as const)(
    'rejects numerical overflow for the %s objective',
    (objective) => {
      expect(solve({ g: 1023, r: 0, b: 0, n: 1023 }, objective)).toEqual({
        value: 2 ** 1023,
        fraction: 1,
      })
      expect(() => solve({ g: 1024, r: 0, b: 0, n: 1024 }, objective)).toThrow(
        new RangeError('Normalized wealth exceeded the finite IEEE-754 number range')
      )
    }
  )

  it('rejects overflowing path wealth while accepting a finite bankroll of the same size', () => {
    const state = { g: 1, r: 0, b: 0, n: 1 }
    expect(enumerate(state, () => 0, Number.MAX_VALUE)).toEqual([
      { path: ['G'], probability: 1, wealth: Number.MAX_VALUE },
    ])
    expect(() => enumerate(state, () => 1, Number.MAX_VALUE)).toThrow(
      new RangeError('Path wealth exceeded the finite IEEE-754 number range')
    )
  })
})

describe('Pikurn adaptive optima', () => {
  it('waits first for $700/3 expectation, then uses the observed composition', () => {
    expect(solve(original).fraction).toBe(0)
    expect(solve(original).value).toBeCloseTo(7 / 3, 13)
    expect(solve({ g: 1, r: 1, b: 0, n: 2 }).fraction).toBe(0)
    const stats = terminalStats(original, 'expected')
    expect(
      Object.fromEntries(stats.leaves.map((leaf) => [leaf.path.join(''), leaf.wealth]))
    ).toEqual({ GGR: 100, GRG: 200, RGG: 400 })
    expect(stats.expected).toBeCloseTo(700 / 3, 12)
  })

  it('guarantees $200 by wagering half, then one third after green', () => {
    const first = solve(original, 'guaranteed')
    expect(first.fraction).toBeCloseTo(1 / 2, 14)
    expect(first.value).toBeCloseTo(2, 14)
    expect(solve({ g: 1, r: 1, b: 0, n: 2 }, 'guaranteed').fraction).toBeCloseTo(1 / 3, 14)
    for (const leaf of terminalStats(original, 'guaranteed').leaves)
      expect(leaf.wealth).toBeCloseTo(200, 12)
  })

  it('chooses zero on an exact expectation tie and on a blue-capped guarantee', () => {
    expect(solve({ g: 1, r: 1, b: 0, n: 1 })).toEqual({ value: 1, fraction: 0 })
    for (let g = 0; g <= 4; g++) {
      for (let r = 0; r <= 3; r++) {
        expect(solve({ g, r, b: 1, n: g + r + 1 }, 'guaranteed')).toEqual({ value: 1, fraction: 0 })
      }
    }
  })

  it('matches an independent exhaustive action grid on small bags and horizons', () => {
    for (let g = 0; g <= 3; g++) {
      for (let r = 0; r <= 3; r++) {
        for (let b = 0; b <= 1; b++) {
          for (let n = 0; n <= Math.min(4, g + r + b); n++) {
            const state = { g, r, b, n }
            for (const objective of ['expected', 'guaranteed'] as const) {
              const exact = solve(state, objective).value
              const grid = gridValue(state, objective)
              expect(exact, JSON.stringify({ state, objective })).toBeGreaterThanOrEqual(
                grid - 1e-10
              )
              if (objective === 'expected') expect(exact).toBeCloseTo(grid, 12)
              else expect(exact - grid).toBeLessThanOrEqual((n * 2 ** n) / 400 + 1e-10)
            }
          }
        }
      }
    }
  })

  it('matches the full-bag expected-value formula and waits for every red to leave', () => {
    for (let g = 0; g <= 6; g++) {
      for (let r = 0; r <= 6; r++) {
        const n = g + r
        const numerator = Array.from({ length: g + 1 }, (_, k) => binomial(n, k)).reduce(
          (a, b) => a + b,
          0
        )
        const decision = solve({ g, r, b: 0, n }, 'expected')
        expect(decision.value).toBeCloseTo(numerator / binomial(n, g), 11)
        expect(decision.fraction).toBe(r === 0 && g > 0 ? 1 : 0)
      }
    }
  })

  it('matches the guaranteed-value and wager formulas at every feasible horizon', () => {
    for (let g = 0; g <= 6; g++) {
      for (let r = 0; r <= 6; r++) {
        for (let n = 0; n <= g + r; n++) {
          const denominator = Array.from({ length: Math.min(r, n) + 1 }, (_, k) =>
            binomial(n, k)
          ).reduce((a, b) => a + b, 0)
          const decision = solve({ g, r, b: 0, n }, 'guaranteed')
          expect(decision.value).toBeCloseTo(2 ** n / denominator, 11)
          expect(decision.fraction).toBeCloseTo(n === 0 ? 0 : binomial(n - 1, r) / denominator, 13)
        }
      }
    }
  })

  it('changes the optimal expectation policy when blue can terminate the game', () => {
    for (const [state, value] of [
      [{ g: 3, r: 1, b: 1, n: 5 }, 19 / 10],
      [{ g: 2, r: 1, b: 2, n: 5 }, 19 / 15],
    ] as const) {
      const decision = solve(state, 'expected')
      expect(decision.value).toBeCloseTo(value, 13)
      expect(decision.fraction).toBe(1)
      expect(terminalStats(state, 'expected', 1).expected).toBeCloseTo(value, 13)
    }
  })

  it('chooses no wager when a truncated game makes all first wagers equally valuable', () => {
    const state = { g: 2, r: 1, b: 0, n: 2 }
    expect(solve(state, 'expected').value).toBeCloseTo(4 / 3, 13)
    expect(solve(state, 'expected').fraction).toBe(0)
    for (const first of [0, 0.25, 0.5, 0.75, 1]) {
      const leaves = enumerate(state, (next) => (next.n === 2 ? first : solve(next).fraction), 1)
      const value = leaves.reduce((sum, leaf) => sum + leaf.probability * leaf.wealth, 0)
      expect(value).toBeCloseTo(4 / 3, 13)
    }
  })

  it('enumerates probability mass one and realizes the Bellman values at every scale', () => {
    for (const state of [original, { g: 2, r: 2, b: 1, n: 3 }, { g: 3, r: 2, b: 0, n: 4 }]) {
      for (const objective of ['expected', 'guaranteed'] as const) {
        for (const bankroll of [0, 1, 37, 1000]) {
          const stats = terminalStats(state, objective, bankroll)
          expect(stats.probability).toBeCloseTo(1, 13)
          expect(stats[objective]).toBeCloseTo(bankroll * solve(state, objective).value, 10)
          expect(stats.leaves.every((leaf) => leaf.wealth >= 0)).toBe(true)
        }
      }
    }
  })
})
