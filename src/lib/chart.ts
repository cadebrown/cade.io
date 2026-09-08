import type ApexCharts from 'apexcharts'
import type { ApexOptions } from 'apexcharts'
import { chartTheme, currentTheme } from './theme'

class SiteChart extends HTMLElement {
  private chart?: ApexCharts
  private revision = 0
  private observer?: MutationObserver
  private options?: ApexOptions

  configure(options: ApexOptions): void {
    this.dispose()
    this.options = options
    if (this.isConnected) void this.render()
  }

  connectedCallback() {
    void this.render()
  }

  private async render() {
    if (!this.options) return
    const revision = ++this.revision
    const options = this.options
    const { default: ApexCharts } = await import('apexcharts')
    const active = () => this.isConnected && revision === this.revision
    if (!active()) return
    const currentMode = () => chartTheme(currentTheme())
    const themed = (mode: 'light' | 'dark'): ApexOptions => ({
      ...options,
      chart: { ...options.chart, background: 'transparent', fontFamily: 'inherit' },
      theme: { ...options.theme, mode },
      tooltip: { ...options.tooltip, theme: mode },
    })
    let rendering = false
    let renderedMode: 'light' | 'dark' | undefined
    const renderTheme = async () => {
      if (rendering) return
      rendering = true
      try {
        while (active() && renderedMode !== currentMode()) {
          const mode = currentMode()
          // ApexCharts 7 retains the tooltip's old config during updateOptions.
          // Recreate through its public lifecycle so all theme consumers agree.
          this.chart?.destroy()
          const chart = new ApexCharts(this, themed(mode))
          this.chart = chart
          await chart.render()
          renderedMode = mode
        }
      } catch (error) {
        if (active()) throw error
      } finally {
        rendering = false
      }
    }
    this.observer = new MutationObserver(() => void renderTheme())
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    await renderTheme()
  }

  disconnectedCallback() {
    this.dispose()
  }

  private dispose() {
    this.revision++
    this.observer?.disconnect()
    this.observer = undefined
    this.chart?.destroy()
    this.chart = undefined
  }
}

/** Called by the post's client script, keeping callbacks as native functions. */
export function configureChart(id: string, options: ApexOptions): void {
  if (!customElements.get('site-chart')) customElements.define('site-chart', SiteChart)
  const element = document.getElementById(id)
  if (!(element instanceof SiteChart)) throw new Error(`Missing chart element: ${id}`)
  element.configure(options)
}
