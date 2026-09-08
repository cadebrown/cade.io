import { expect, test, type Page } from '@playwright/test'

const widths = [320, 390, 768, 1029, 1031, 1100, 1440]

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
}

test('chart labels stay readable across container breakpoints in both themes', async ({ page }) => {
  test.setTimeout(90_000)
  for (const route of ['/test', '/posts/game-pikurn']) {
    await page.goto(route)
    for (const theme of ['blackboard', 'whiteboard']) {
      await page.getByRole('button', { name: `set theme: '${theme}'`, exact: true }).click()
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 })
        await noPageOverflow(page)
        const charts = await page
          .locator('.static-plot svg:visible, .pikurn-geometry svg, pikurn-wagers svg')
          .evaluateAll((svgs) =>
            svgs.map((element) => {
              const svg = element as SVGSVGElement
              const labels = [...svg.querySelectorAll('text')].map(
                (label) =>
                  parseFloat(getComputedStyle(label).fontSize) * Math.abs(label.getScreenCTM()!.a)
              )
              const box = svg.getBoundingClientRect()
              return {
                labels,
                width: box.width,
                height: box.height,
                ratio: svg.viewBox.baseVal.width / svg.viewBox.baseVal.height,
              }
            })
          )
        expect(charts.length).toBeGreaterThan(0)
        for (const chart of charts) {
          expect(Math.min(...chart.labels), `${route} ${theme} ${width}px`).toBeGreaterThanOrEqual(
            13
          )
          expect(Math.abs(chart.width / chart.height - chart.ratio)).toBeLessThan(0.02)
        }
      }
    }
  }
})

test('wide diagrams and tables scroll by keyboard inside their own containers', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/test#layout-examples')
  const diagram = page.locator('.layout-examples .static-diagram')
  const table = page.getByRole('region', { name: 'Wide strategy comparison', exact: true })
  for (const region of [diagram, table]) {
    await region.scrollIntoViewIfNeeded()
    expect(await region.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true)
    await region.focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => region.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0)
  }
  await expect(table.locator('table')).toHaveCSS('display', 'table')
  await expect(table.locator('table')).toHaveCSS('overflow-x', 'visible')
  expect((await table.locator('tbody td').first().boundingBox())!.width).toBeGreaterThan(200)
  await noPageOverflow(page)
})

test('small-screen Pikurn charts retain a keyboard-accessible full drawing', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/posts/game-pikurn')
  for (const selector of ['.pikurn-geometry .chart-scroll', 'pikurn-wagers .chart-scroll']) {
    const region = page.locator(selector).first()
    await region.scrollIntoViewIfNeeded()
    expect(await region.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true)
    await region.focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => region.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0)
  }
  await expect(page.locator('.wager-scroll-hint')).toBeVisible()
  await expect(page.locator('.geometry-scroll-hint')).toBeVisible()
  await noPageOverflow(page)
})

test('compact tables center, wide tables fill, and long-table headers stay visible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/test#layout-examples')
  for (const label of ['Compact runout results', 'Wide strategy comparison']) {
    const region = page.getByRole('region', { name: label, exact: true })
    const dimensions = await region.evaluate((e) => {
      const box = e.getBoundingClientRect(),
        parent = e.parentElement!.getBoundingClientRect()
      return {
        width: box.width,
        parentWidth: parent.width,
        centering: Math.abs((box.left + box.right) / 2 - (parent.left + parent.right) / 2),
      }
    })
    expect(dimensions.centering).toBeLessThanOrEqual(1)
    if (label.startsWith('Compact'))
      expect(dimensions.width).toBeLessThan(dimensions.parentWidth * 0.85)
    else expect(dimensions.width).toBeCloseTo(dimensions.parentWidth, 0)
  }
  await page.locator('.long-results summary').click()
  const longTable = page.getByRole('region', { name: 'Long synthetic results', exact: true })
  await longTable.scrollIntoViewIfNeeded()
  await longTable.evaluate((e) => {
    e.scrollTop = 200
  })
  const position = await longTable.evaluate((e) => {
    const top = e.getBoundingClientRect().top
    return { scroll: e.scrollTop, header: e.querySelector('th')!.getBoundingClientRect().top - top }
  })
  expect(position.scroll).toBe(200)
  expect(Math.abs(position.header)).toBeLessThanOrEqual(2)
})

test('paired plotting areas align on desktop and stack on narrow screens', async ({ page }) => {
  await page.goto('/posts/game-pikurn')
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const selector of ['.pikurn-geometry', '.wager-figures']) {
      const positions = await page.locator(`${selector} svg`).evaluateAll((svgs) =>
        svgs.map((svg) => {
          const r = svg.getBoundingClientRect()
          return { x: r.x, y: r.y, bottom: r.bottom }
        })
      )
      expect(positions).toHaveLength(2)
      if (width === 1440) {
        expect(Math.abs(positions[0]!.y - positions[1]!.y)).toBeLessThanOrEqual(1)
        expect(positions[1]!.x).toBeGreaterThan(positions[0]!.x)
      } else {
        expect(Math.abs(positions[0]!.x - positions[1]!.x)).toBeLessThanOrEqual(1)
        expect(positions[1]!.y).toBeGreaterThan(positions[0]!.bottom)
      }
    }
  }
})

test('static layout variants retain the same data and reserve space without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4322/test#layout-examples')
  const chart = page.locator('#layout-plot')
  await expect(chart.locator('svg:visible')).toHaveCount(1)
  for (const variant of ['wide', 'narrow'])
    await expect(chart.locator(`.plot-frame-${variant} circle`)).toHaveCount(6)
  await expect(chart.locator('tbody tr')).toHaveCount(6)
  expect((await chart.locator('svg:visible').boundingBox())!.height).toBeGreaterThan(250)
  await expect(page.locator('.layout-examples .static-diagram svg:visible')).toHaveCount(1)
  const ids = await page
    .locator('[id]')
    .evaluateAll((elements) => elements.map((element) => element.id))
  expect(new Set(ids).size).toBe(ids.length)
  await noPageOverflow(page)
  await context.close()
})
