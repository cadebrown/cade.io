import { enumerate, outcomes, solve, type Objective, type Outcome, type State } from './pikurn'

const colors: Record<Outcome, string> = { G: 'green', R: 'red', B: 'blue' }
const symbols: Record<Outcome, string> = { G: '●', R: '◆', B: '■' }
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})
const money = (value: number) => currency.format(Math.abs(value) < 0.005 ? 0 : value)
const percent = (value: number) => `${(value * 100).toFixed(value > 0.099 ? 1 : 2)}%`
const total = (state: State) => state.g + state.r + state.b
const terminal = (state: State | null): boolean => !state || state.n <= 0 || total(state) === 0
const multiplier = (outcome: Outcome, fraction: number) =>
  outcome === 'G' ? 1 + fraction : outcome === 'R' ? 1 - fraction : 1

class PikurnExplorer extends HTMLElement {
  private initial: State = { g: 2, r: 1, b: 0, n: 3 }
  private state: State | null = { ...this.initial }
  private objective: Objective = 'expected'
  private wealth = 100
  private history: string[] = []
  private ready = false

  connectedCallback() {
    if (this.ready) return
    this.ready = true
    this.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select').forEach((input) =>
      input.addEventListener('change', () => this.configure(input.name))
    )
    this.querySelectorAll<HTMLButtonElement>('[data-draw]').forEach((button) =>
      button.addEventListener('click', () => this.draw(button.dataset.draw as Outcome))
    )
    this.querySelector<HTMLButtonElement>('[data-reset]')?.addEventListener('click', () =>
      this.reset()
    )
    this.element('[data-enhanced]').hidden = false
    this.element('[data-fallback]').hidden = true
    this.reset()
  }

  private element(selector: string): HTMLElement {
    const element = this.querySelector<HTMLElement>(selector)
    if (!element) throw new Error(`Pikurn lab missing ${selector}`)
    return element
  }

  private text(selector: string, value: string) {
    this.element(selector).textContent = value
  }

  private configure(changed: string) {
    const counts = ['g', 'r', 'b'] as const
    const next = { ...this.initial }
    const getInput = (name: string) =>
      this.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
    for (const name of counts)
      next[name] = Math.max(0, Math.min(4, Math.round(Number(getInput(name).value) || 0)))
    let adjustment = ''
    if (total(next) > 8) {
      const name = counts.includes(changed as (typeof counts)[number])
        ? (changed as (typeof counts)[number])
        : 'b'
      next[name] = Math.max(0, next[name] - (total(next) - 8))
      adjustment = 'That count was reduced to keep the bag within 8 balls. '
    }
    if (!total(next)) {
      next.g = 1
      adjustment = 'An empty bag has no draw; one green ball was restored. '
    }
    const drawInput = getInput('n')
    next.n = Math.max(1, Math.min(total(next), Math.round(Number(drawInput.value) || 1)))
    if (Number(drawInput.value) > total(next))
      adjustment += 'The draw limit was reduced to the number of balls. '
    for (const name of counts) getInput(name).value = String(next[name])
    drawInput.value = String(next.n)
    drawInput.max = String(total(next))
    this.objective = this.querySelector<HTMLSelectElement>('select[name="objective"]')!
      .value as Objective
    this.initial = next
    this.text(
      '[data-constraint]',
      `${adjustment}Up to 4 of each color, 8 balls total. Changing a control starts a new $100 game.`
    )
    this.reset()
  }

  private reset() {
    this.state = { ...this.initial }
    this.wealth = 100
    this.history = []
    this.renderAnalysis()
    this.renderGame('New game. Choose a possible draw to follow the recommended strategy.')
  }

  private draw(outcome: Outcome) {
    if (terminal(this.state) || !this.state) return
    const branch = outcomes(this.state).find((item) => item.outcome === outcome)
    if (!branch) return
    const fraction = solve(this.state, this.objective).fraction
    const wager = this.wealth * fraction
    this.wealth *= multiplier(outcome, fraction)
    this.state = branch.next
    const message = `${symbols[outcome]} ${colors[outcome]} (${percent(branch.probability)}): wagered ${money(wager)}, bankroll ${money(this.wealth)}${outcome === 'B' ? '; blue returns the wager and ends the game' : ''}.`
    this.history.push(message)
    this.renderGame(message)
  }

  private renderGame(status: string) {
    const ended = terminal(this.state)
    const current = this.state
    const fraction = current && !ended ? solve(current, this.objective).fraction : 0
    const urn = this.element('[data-urn]')
    urn.replaceChildren()
    if (current) {
      for (const outcome of ['G', 'R', 'B'] as const) {
        for (let i = 0; i < current[outcome.toLowerCase() as 'g' | 'r' | 'b']; i++) {
          const token = document.createElement('span')
          token.className = `pk-token pk-${outcome}`
          token.setAttribute('aria-hidden', 'true')
          urn.append(token)
        }
      }
    }
    if (!current || !total(current)) urn.textContent = '∅'
    urn.setAttribute(
      'aria-label',
      current
        ? `${current.g} green, ${current.r} red, ${current.b} blue balls remaining`
        : 'Game ended by a blue draw'
    )
    this.text(
      '[data-remaining]',
      current
        ? `${current.g} green · ${current.r} red · ${current.b} blue / ${ended ? 0 : current.n} draws left`
        : 'Blue ends this runout.'
    )
    this.text(
      '[data-wager]',
      ended ? `Finish: ${money(this.wealth)}` : `Wager ${money(this.wealth * fraction)}`
    )
    this.text(
      '[data-bankroll]',
      ended
        ? `${money(this.wealth - 100)} net profit on the original $100.`
        : `${percent(fraction)} of your ${money(this.wealth)} bankroll.`
    )
    for (const button of this.querySelectorAll<HTMLButtonElement>('[data-draw]')) {
      const outcome = button.dataset.draw as Outcome
      const branch =
        !ended && current ? outcomes(current).find((item) => item.outcome === outcome) : undefined
      button.disabled = !branch
      button.textContent = `${symbols[outcome]} Draw ${colors[outcome]}${branch ? ` · ${percent(branch.probability)}` : ''}`
    }
    this.text('[data-status]', status)
    const history = this.element('[data-history]')
    history.replaceChildren(
      ...this.history.map((entry) => {
        const li = document.createElement('li')
        li.textContent = entry
        return li
      })
    )
  }

  private renderAnalysis() {
    const paths = enumerate(this.initial, (state) => solve(state, this.objective).fraction, 100)
    const average = paths.reduce((sum, path) => sum + path.wealth * path.probability, 0)
    const worst = Math.min(...paths.map((path) => path.wealth))
    const best = Math.max(...paths.map((path) => path.wealth))
    this.text('[data-average]', money(average))
    this.text('[data-worst]', money(worst))
    this.text('[data-best]', money(best))
    this.text('[data-path-count]', `· ${paths.length} color sequences`)
    const tbody = this.element('[data-paths]')
    tbody.replaceChildren(
      ...paths.map((path) => {
        const tr = document.createElement('tr')
        const sequence =
          path.path.map((outcome) => `${symbols[outcome]} ${outcome}`).join(' → ') || 'No draws'
        for (const value of [sequence, percent(path.probability), money(path.wealth)]) {
          const td = document.createElement('td')
          td.textContent = value
          tr.append(td)
        }
        return tr
      })
    )
    const buckets = new Map<number, number>()
    for (const path of paths) {
      const value = Math.round(path.wealth * 100) / 100
      buckets.set(value, (buckets.get(value) ?? 0) + path.probability)
    }
    let groups = [...buckets]
      .sort(([a], [b]) => a - b)
      .map(([wealth, probability]) => ({ label: money(wealth), probability }))
    let note =
      'All runouts counted; probabilities shown as rounded percentages and bankrolls rounded to cents. Bars: 0–100%.'
    if (groups.length > 12) {
      const width = (best - worst) / 12
      const bins = Array.from({ length: 12 }, (_, i) => ({
        label: `${money(worst + i * width)}–${money(worst + (i + 1) * width)}`,
        probability: 0,
      }))
      for (const path of paths)
        bins[Math.min(11, Math.floor((path.wealth - worst) / width))]!.probability +=
          path.probability
      groups = bins.filter((bin) => bin.probability > 0)
      note =
        'All runouts grouped into 12 equal bankroll intervals (lower bound included; final upper bound included). Labels rounded; full runouts below. Bars: 0–100%.'
    }
    this.text('[data-distribution-note]', note)
    this.element('[data-distribution]').replaceChildren(
      ...groups.map((group) => {
        const row = document.createElement('div')
        row.className = 'pk-bar-row'
        const label = document.createElement('span')
        label.textContent = group.label
        const track = document.createElement('div')
        track.className = 'pk-bar-track'
        track.setAttribute('aria-hidden', 'true')
        const bar = document.createElement('div')
        bar.className = 'pk-bar'
        bar.style.width = `${group.probability * 100}%`
        track.append(bar)
        const probability = document.createElement('span')
        probability.className = 'pk-bar-probability'
        probability.textContent = percent(group.probability)
        row.append(label, track, probability)
        return row
      })
    )
    const tree = this.element('[data-tree]')
    const root = document.createElement('p')
    root.textContent = `Start $100 · wager ${money(solve(this.initial, this.objective).fraction * 100)}`
    tree.replaceChildren(root, this.treeBranches(this.initial, 100, 0))
  }

  private treeBranches(state: State, wealth: number, depth: number): HTMLUListElement {
    const list = document.createElement('ul')
    const fraction = solve(state, this.objective).fraction
    for (const branch of outcomes(state)) {
      const li = document.createElement('li')
      const nextWealth = wealth * multiplier(branch.outcome, fraction)
      const node = document.createElement('span')
      node.className = 'pk-tree-node'
      const token = document.createElement('i')
      token.className = `pk-token pk-${branch.outcome}`
      token.setAttribute('aria-hidden', 'true')
      const description = document.createElement('span')
      const finish = terminal(branch.next)
      const decision =
        branch.next && !finish
          ? `next wager ${money(nextWealth * solve(branch.next, this.objective).fraction)}`
          : 'finish'
      description.textContent = `${branch.outcome} · ${percent(branch.probability)} → ${money(nextWealth)} · ${decision}${depth === 2 && !finish ? ' · … further draws' : ''}`
      if (finish) description.className = 'pk-tree-result'
      node.append(token, description)
      li.append(node)
      if (!finish && branch.next && depth < 2)
        li.append(this.treeBranches(branch.next, nextWealth, depth + 1))
      list.append(li)
    }
    return list
  }
}

if (!customElements.get('pikurn-explorer')) customElements.define('pikurn-explorer', PikurnExplorer)
