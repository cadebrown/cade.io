import { money, wagerSnapshot } from './pikurn-snapshots'

class PikurnWagers extends HTMLElement {
  private observer?: IntersectionObserver
  private ready = false
  connectedCallback() {
    if (this.ready) return
    this.observer ??= new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.observer?.disconnect()
          this.activate()
        }
      },
      { rootMargin: '240px' }
    )
    this.observer.observe(this)
  }
  disconnectedCallback() {
    this.observer?.disconnect()
    this.observer = undefined
  }
  private activate() {
    if (this.ready) return
    this.ready = true
    const first = this.querySelector<HTMLInputElement>('[data-x]')!
    const second = this.querySelector<HTMLInputElement>('[data-y]')!
    first.disabled = second.disabled = false
    this.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(
      (button) => (button.disabled = false)
    )
    const update = () => {
      const x = Number(first.value)
      second.max = String(100 + x)
      const y = Number(second.value)
      const snapshot = wagerSnapshot(x, y)
      const { mean, floor } = snapshot
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
      this.querySelector('[data-bars]')!.innerHTML = snapshot.bars
      this.querySelector('[data-frontier]')!.innerHTML = snapshot.frontier
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
