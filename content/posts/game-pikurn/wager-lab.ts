const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

class PikurnWagers extends HTMLElement {
  connectedCallback() {
    const first = this.querySelector<HTMLInputElement>('[data-x]')!
    const second = this.querySelector<HTMLInputElement>('[data-y]')!
    const update = () => {
      const x = Number(first.value)
      second.max = String(100 + x)
      const y = Number(second.value)
      const values = [4 * (100 - x), 2 * (100 + x - y), 100 + x + y]
      const mean = values.reduce((a, b) => a + b, 0) / 3
      const floor = Math.min(...values)
      this.querySelector('[data-first]')!.textContent = money(x)
      this.querySelector('[data-second]')!.textContent = money(y)
      this.querySelector('[data-budget]')!.textContent =
        `After a green, you have ${money(100 + x)} available for the second bet.`
      this.querySelector('[data-summary]')!.textContent =
        `Expected final bankroll: ${money(mean)}. Guaranteed final bankroll: ${money(floor)}.`
      this.querySelector('[data-comparison]')!.textContent =
        floor >= 100
          ? `For a floor of ${money(floor)}, the highest possible average is ${money((800 - floor) / 3)}. These are final bankrolls; subtract $100 for profit.`
          : 'This strategy can lose part of your starting $100. The maximum-average policy already guarantees that starting bankroll.'
      for (const button of this.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
        const preset = button.dataset.preset
        const active =
          preset === 'average'
            ? x === 0 && y === 0
            : preset === 'restricted'
              ? x === 60 && y === 0
              : x === 50 && y === 50
        button.setAttribute('aria-pressed', String(active))
      }
      const names = ['R G G', 'G R G', 'G G R']
      const scale = 300 / 400
      this.querySelector('[data-bars]')!.innerHTML =
        `<title>Three equally likely endings</title>${values
          .map((value, index) => {
            const top = 28 + index * 68
            return `<text x="0" y="${top + 18}">${names[index]}</text><rect x="74" y="${top}" width="${value * scale}" height="30" rx="3" fill="var(--wow-link)" opacity="${0.45 + index * 0.2}"/><text x="${Math.max(82, 80 + value * scale)}" y="${top + 51}">${money(value)}</text>`
          })
          .join('')}<text x="74" y="258">Terminal bankroll ($)</text>`
      const px = (v: number) => 55 + (v / 200) * 355
      const py = (v: number) => 215 - ((v - 100) / 150) * 185
      const axis = `<path d="M55 20V215H420" fill="none" stroke="currentColor" opacity=".6"/>`
      const grid = [100, 150, 200, 250]
        .map(
          (v) =>
            `<path d="M55 ${py(v)}H420" stroke="currentColor" opacity=".12"/><text x="45" y="${py(v) + 4}" text-anchor="end">${v}</text>`
        )
        .join('')
      const ticks = [0, 50, 100, 150, 200]
        .map((v) => `<text x="${px(v)}" y="236" text-anchor="middle">${v}</text>`)
        .join('')
      this.querySelector('[data-frontier]')!.innerHTML =
        `<title>Average versus guaranteed bankroll: your strategy and the efficient frontier</title>${grid}${axis}${ticks}<path d="M${px(100)} ${py(700 / 3)}L${px(200)} ${py(200)}" stroke="var(--wow-link)" stroke-width="4" fill="none"/><circle cx="${px(floor)}" cy="${py(mean)}" r="6" fill="var(--wow-text)" stroke="var(--wow-back-alt)" stroke-width="2"/><text x="55" y="13">Average ($)</text><text x="232" y="262" text-anchor="middle">Guaranteed bankroll ($)</text>`
    }
    first.addEventListener('input', update)
    second.addEventListener('input', update)
    this.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const preset = button.dataset.preset
        first.value = preset === 'average' ? '0' : preset === 'restricted' ? '60' : '50'
        second.value = preset === 'guarantee' ? '50' : '0'
        update()
      })
    })
    update()
  }
}
if (!customElements.get('pikurn-wagers')) customElements.define('pikurn-wagers', PikurnWagers)
