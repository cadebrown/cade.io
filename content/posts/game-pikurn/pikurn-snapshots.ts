import { enumerate, outcomes, solve, type Objective, type Outcome, type State } from './pikurn'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})
export const money = (value: number) => currency.format(Math.abs(value) < 0.005 ? 0 : value)
export const percent = (value: number) => `${(value * 100).toFixed(value > 0.099 ? 1 : 2)}%`
export const symbols: Record<Outcome, string> = { G: '●', R: '◆', B: '■' }
export const colors: Record<Outcome, string> = { G: 'green', R: 'red', B: 'blue' }

export function wagerSnapshot(x: number, y: number) {
  const values = [4 * (100 - x), 2 * (100 + x - y), 100 + x + y]
  const mean = values.reduce((a, b) => a + b, 0) / 3
  const floor = Math.min(...values)
  const names = ['R G G', 'G R G', 'G G R']
  const scale = 300 / 400
  const bars = `<title>Three equally likely endings</title>${values
    .map((value, index) => {
      const top = 28 + index * 68
      return `<text x="0" y="${top + 18}">${names[index]}</text><rect x="74" y="${top}" width="${value * scale}" height="30" rx="3" fill="var(--wow-link)" opacity="${0.45 + index * 0.2}"/><text x="${Math.max(150, 74 + value * scale)}" y="${top + 51}" text-anchor="end">${money(value)}</text>`
    })
    .join('')}<text x="74" y="258">Terminal bankroll ($)</text>`
  const px = (v: number) => 55 + (v / 200) * 355
  const py = (v: number) => 215 - ((v - 100) / 150) * 185
  const grid = [100, 150, 200, 250]
    .map(
      (v) =>
        `<path d="M55 ${py(v)}H420" stroke="currentColor" opacity=".12"/><text x="45" y="${py(v) + 4}" text-anchor="end">${v}</text>`
    )
    .join('')
  const ticks = [0, 50, 100, 150, 200]
    .map((v) => `<text x="${px(v)}" y="236" text-anchor="middle">${v}</text>`)
    .join('')
  const frontier = `<title>Average versus guaranteed bankroll: your strategy and the efficient frontier</title>${grid}<path d="M55 20V215H420" fill="none" stroke="currentColor" opacity=".6"/>${ticks}<path d="M${px(100)} ${py(700 / 3)}L${px(200)} ${py(200)}" stroke="var(--wow-link)" stroke-width="4" fill="none"/><circle cx="${px(floor)}" cy="${py(mean)}" r="6" fill="var(--wow-text)" stroke="var(--wow-back-alt)" stroke-width="2"/><text x="55" y="13">Average ($)</text><text x="232" y="262" text-anchor="middle">Guaranteed bankroll ($)</text>`
  return { values, mean, floor, bars, frontier }
}

export function explorerSnapshot(
  state: State = { g: 2, r: 1, b: 0, n: 3 },
  objective: Objective = 'expected'
) {
  const paths = enumerate(state, (next) => solve(next, objective).fraction, 100)
  const average = paths.reduce((sum, path) => sum + path.wealth * path.probability, 0)
  const wealth = paths.map((path) => path.wealth)
  const decision = solve(state, objective)
  const branches = outcomes(state)
  const urn = (['G', 'R', 'B'] as const)
    .flatMap((outcome) => Array(state[outcome.toLowerCase() as 'g' | 'r' | 'b']).fill(outcome))
    .map((outcome) => `<span class="pk-token pk-${outcome}" aria-hidden="true"></span>`)
    .join('')
  const pathsMarkup = paths
    .map(
      (path) =>
        `<tr><td>${path.path.map((outcome) => `${symbols[outcome]} ${outcome}`).join(' → ')}</td><td>${percent(path.probability)}</td><td>${money(path.wealth)}</td></tr>`
    )
    .join('')
  const buckets = new Map<number, number>()
  for (const path of paths)
    buckets.set(path.wealth, (buckets.get(path.wealth) ?? 0) + path.probability)
  const distributionMarkup = [...buckets]
    .sort(([a], [b]) => a - b)
    .map(
      ([value, probability]) =>
        `<div class="pk-bar-row"><span>${money(value)}</span><div class="pk-bar-track" aria-hidden="true"><div class="pk-bar" style="width:${probability * 100}%"></div></div><span class="pk-bar-probability">${percent(probability)}</span></div>`
    )
    .join('')
  const tree = (current: State, bankroll: number, depth: number): string =>
    `<ul>${outcomes(current)
      .map((branch) => {
        const fraction = solve(current, objective).fraction
        const nextBankroll =
          bankroll *
          (branch.outcome === 'G' ? 1 + fraction : branch.outcome === 'R' ? 1 - fraction : 1)
        const stop = !branch.next || branch.next.n === 0 || depth === 2
        const next = stop ? '' : tree(branch.next!, nextBankroll, depth + 1)
        return `<li><span class="pk-tree-node"><i class="pk-token pk-${branch.outcome}" aria-hidden="true"></i><span>${branch.outcome} · ${percent(branch.probability)} → ${money(nextBankroll)} · ${stop ? 'finish' : `next wager ${money(nextBankroll * solve(branch.next!, objective).fraction)}`}</span></span>${next}</li>`
      })
      .join('')}</ul>`
  const treeMarkup = `<p>Start $100 · wager ${money(100 * decision.fraction)}</p>${tree(state, 100, 0)}`
  return {
    paths,
    average,
    worst: Math.min(...wealth),
    best: Math.max(...wealth),
    wager: 100 * decision.fraction,
    branches,
    urn,
    pathsMarkup,
    distributionMarkup,
    treeMarkup,
  }
}
