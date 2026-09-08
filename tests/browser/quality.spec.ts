import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const routes = ['/', '/posts/game-pikurn', '/test']
const themes = ['blackboard', 'whiteboard'] as const

test('home preserves its original structure, navigation, palette, and typography', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('main > figure')).toHaveCount(2)
  await expect(page.locator('main h2')).toHaveCount(2)
  await expect(page.locator('main')).toHaveCSS('max-width', 'none')
  await expect(page.locator('header a')).toHaveText(['', 'cade.io', '/posts', '/links'])
  await expect(page.locator('header [aria-label="Color theme"]')).toHaveCount(0)
  await expect(page.locator('footer [aria-label="Color theme"]')).toHaveCount(1)
  for (const [theme, background, link] of [
    ['blackboard', '#333', '#5af'],
    ['whiteboard', '#fff', '#075ca8'],
  ]) {
    await page.getByRole('button', { name: `set theme: '${theme}'`, exact: true }).click()
    await expect(page.locator('html')).toHaveCSS('--wow-back', background!)
    await expect(page.locator('html')).toHaveCSS('--wow-link', link!)
    await expect(page.locator('body')).toHaveCSS('font-family', 'monospace, monospace')
  }
})

test('upgraded widgets pass accessibility checks; complete route findings are retained', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const widgets: Record<string, string[]> = {
    '/': ['main > figure'],
    '/posts/game-pikurn': [
      '.static-diagram',
      'pikurn-explorer',
      'pikurn-wagers',
      '.pikurn-geometry',
      '.katex-display',
    ],
    '/test': [
      '.widget-previews',
      '.layout-examples',
      '.visualization-examples',
      '.image-examples',
      '.static-diagram',
      '.social-preview-examples',
      '.katex-display',
    ],
  }
  for (const route of routes) {
    for (const theme of themes) {
      await page.goto(route)
      await page.getByRole('button', { name: `set theme: '${theme}'`, exact: true }).click()
      const complete = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      await test.info().attach(`accessibility-${route.replaceAll('/', '-') || 'home'}-${theme}`, {
        body: JSON.stringify(complete, null, 2),
        contentType: 'application/json',
      })
      // The user requested restoration of the surrounding site, including its
      // existing link/footer colors. Preserve all findings; gate the changed widgets.
      const audit = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa'])
      for (const selector of widgets[route]!) audit.include(selector)
      const results = await audit.analyze()
      expect(
        results.violations.filter((violation) =>
          ['serious', 'critical'].includes(violation.impact ?? '')
        ),
        `${route} (${theme})`
      ).toEqual([])
    }
  }
})

test('initial primary-route requests remain self-hosted and avoid runtime diagram or Apex libraries', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  for (const route of routes) {
    const requested: string[] = []
    const errorCount = errors.length
    page.on('request', (request) => requested.push(request.url()))
    await page.goto(route, { waitUntil: 'networkidle' })
    const initial = [...new Set(requested)]
    expect(
      initial.filter((url) => new URL(url).origin !== new URL(page.url()).origin),
      route
    ).toEqual([])
    expect(
      initial.filter((url) => /(?:mermaid|apexcharts)/i.test(url)),
      route
    ).toEqual([])
    expect(errors.slice(errorCount), `${route} browser errors`).toEqual([])
    page.removeAllListeners('request')
  }
})

test('home page media preserves its intrinsic ratio across responsive widths', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/')
    const images = page.locator('main img')
    const count = await images.count()
    for (let index = 0; index < count; index++) {
      const image = images.nth(index)
      await image.scrollIntoViewIfNeeded()
      await image.evaluate(async (element) => {
        await (element as HTMLImageElement).decode()
      })
    }
    const ratios = await images.evaluateAll((images) =>
      images.map((image) => {
        const rendered = image as HTMLImageElement
        const style = getComputedStyle(rendered)
        const box = rendered.getBoundingClientRect()
        const contentWidth =
          box.width -
          parseFloat(style.borderLeftWidth) -
          parseFloat(style.borderRightWidth) -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight)
        const contentHeight =
          box.height -
          parseFloat(style.borderTopWidth) -
          parseFloat(style.borderBottomWidth) -
          parseFloat(style.paddingTop) -
          parseFloat(style.paddingBottom)
        return {
          alt: rendered.alt,
          naturalWidth: rendered.naturalWidth,
          naturalHeight: rendered.naturalHeight,
          contentWidth,
          contentHeight,
        }
      })
    )
    expect(ratios.length).toBeGreaterThan(1)
    for (const image of ratios) {
      expect(image.naturalWidth, `${image.alt} at ${width}px`).toBeGreaterThan(0)
      expect(image.naturalHeight, `${image.alt} at ${width}px`).toBeGreaterThan(0)
      const expectedHeight = (image.contentWidth * image.naturalHeight) / image.naturalWidth
      expect(
        Math.abs(image.contentHeight - expectedHeight),
        `${image.alt} at ${width}px`
      ).toBeLessThanOrEqual(1)
    }
  }
})

test('Pikurn diagrams and test visualizations remain meaningful without JavaScript', async ({
  browser,
}) => {
  const baseURL = 'http://127.0.0.1:4322'
  for (const theme of themes) {
    const context = await browser.newContext({ javaScriptEnabled: false })
    await context.route(/\/((posts\/game-pikurn)|test)$/, async (route) => {
      const response = await route.fetch()
      const body = (await response.text()).replace(
        /<html([^>]*)data-theme=(['"]).*?\2([^>]*)>/,
        `<html$1data-theme="${theme}"$3>`
      )
      await route.fulfill({ response, body })
    })
    const page = await context.newPage()
    await page.goto(new URL('/posts/game-pikurn', baseURL).toString())
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.locator('figure svg[role="img"]')).not.toHaveCount(0)
    await expect(page.getByText(/Maximum (average|guarantee)/)).not.toHaveCount(0)
    await page.goto(new URL('/test', baseURL).toString())
    await expect(
      page.locator('section.visualization-examples figure.static-plot svg:visible')
    ).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Build-time Observable Plot data table' })
    ).toBeVisible()
    await expect(page.locator('figure.geometry-sample svg')).toBeVisible()
    await context.close()
  }
})

test('test-page Svelte explorer hydrates when visible and updates its stateful SVG without layout movement', async ({
  page,
}) => {
  await page.goto('/test')
  const explorer = page.locator('section.harmonic-explorer')
  await explorer.scrollIntoViewIfNeeded()
  const fieldset = explorer.locator('fieldset')
  await expect(fieldset).toBeEnabled()
  const svg = explorer.locator('#harmonic-explorer-svg')
  const before = await svg.boundingBox()
  await explorer.getByRole('slider', { name: /^Fundamental/ }).fill('3')
  await expect(page).toHaveURL(/hv-f=3/)
  await expect(explorer.getByRole('status')).not.toBeEmpty()
  const after = await svg.boundingBox()
  expect(before).not.toBeNull()
  expect(after).not.toBeNull()
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    explorer.getByRole('button', { name: 'Download SVG', exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.svg$/)
})

test('Mandelbrot explorer keeps a sized static fallback until its worker-backed controls are ready', async ({
  page,
}) => {
  await page.goto('/test')
  const explorer = page.locator('section.mandelbrot-explorer')
  const fallback = explorer.locator('.image-frame img[src="/examples/mandelbrot.png"]')
  await expect(fallback).toHaveAttribute('width', '720')
  await expect(fallback).toHaveAttribute('height', '480')
  await explorer.scrollIntoViewIfNeeded()
  const controls = explorer.locator('fieldset')
  await expect(controls).toBeEnabled()
  const canvas = explorer.locator('canvas')
  await expect(canvas).toHaveAttribute('width', '720')
  await expect(canvas).toHaveAttribute('height', '480')
  await explorer.getByRole('button', { name: 'Seahorse valley', exact: true }).click()
  await expect(explorer.locator('.image-frame')).toHaveClass(/ready/)
  await expect(canvas).toHaveCSS('opacity', '1')
  await expect(
    explorer.getByRole('button', { name: 'Download current PNG', exact: true })
  ).toBeEnabled()
})

test('search keeps its query in the URL and returns only published content', async ({ page }) => {
  await page.goto('/search')
  const form = page.getByRole('search')
  const query = form.getByLabel('Search articles', { exact: true })
  await query.fill('Pikurn')
  await form.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page).toHaveURL(/\?q=Pikurn$/)
  const results = page.locator('ol[data-search-results]')
  await expect(results).toContainText('Pikurn')
  await expect(results).not.toContainText(/HWSW Setup/i)
  await expect(page.locator('p[data-search-status]')).toContainText(/result/i)
})

test('Chromium prefetches internal navigation links without marking downloads for prefetch', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'WebKit cache semantics do not guarantee an observable prefetch request.'
  )
  await page.goto('/')
  for (const destination of ['/posts', '/links']) {
    await expect(page.locator(`a[href="${destination}"]`).first()).toHaveAttribute(
      'data-astro-prefetch',
      ''
    )
  }
  const prefetch = page.waitForRequest((request) => new URL(request.url()).pathname === '/posts')
  await page.locator('a[href="/posts"]').first().hover()
  await prefetch
  await page.goto('/posts/magma-paper')
  expect(await page.locator('a[download][data-astro-prefetch]').count()).toBe(0)
})

test('mocked optional site tools expose read-only page and published-search operations', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const siteToolsWindow = window as unknown as Window & { registeredSiteTools: unknown[] }
    siteToolsWindow.registeredSiteTools = []
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool: unknown, options: unknown) {
          siteToolsWindow.registeredSiteTools.push({ tool, options })
          return Promise.resolve()
        },
      },
    })
  })
  await page.goto('/posts/game-pikurn')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const siteToolsWindow = window as unknown as Window & {
          registeredSiteTools?: unknown[]
        }
        return siteToolsWindow.registeredSiteTools?.length ?? 0
      })
    )
    .toBe(2)
  const observed = await page.evaluate(async () => {
    type Registered = {
      tool: {
        name: string
        annotations: { readOnlyHint: boolean }
        execute(input: Record<string, unknown>): unknown
      }
      options: { signal: AbortSignal }
    }
    const siteToolsWindow = window as unknown as Window & { registeredSiteTools: Registered[] }
    const registrations = siteToolsWindow.registeredSiteTools
    const read = registrations.find(({ tool }) => tool.name === 'read_page')!
    const search = registrations.find(({ tool }) => tool.name === 'search_articles')!
    const pageResult = await read.tool.execute({})
    const searchResult = await search.tool.execute({ query: 'Pikurn' })
    const invalidResult = await search.tool.execute({ query: 'x'.repeat(201) })
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }))
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    return {
      names: registrations.map(({ tool }) => tool.name),
      readOnly: registrations.every(({ tool }) => tool.annotations.readOnlyHint),
      pageResult,
      searchResult,
      invalidResult,
      expiredRegistrationsAborted: registrations
        .slice(0, 4)
        .every(({ options }) => options.signal.aborted),
      freshRegistrationActive: registrations
        .slice(4)
        .every(({ options }) => !options.signal.aborted),
    }
  })
  expect(observed.readOnly).toBe(true)
  expect(observed.pageResult).toMatchObject({
    title: expect.stringMatching(/Pikurn/),
    links: expect.any(Array),
  })
  expect(observed.searchResult).toMatchObject({
    results: expect.arrayContaining([
      expect.objectContaining({ title: expect.stringMatching(/Pikurn/) }),
    ]),
  })
  expect(observed.invalidResult).toEqual({
    error: 'query must be a string of at most 200 characters',
  })
  expect(observed.names).toEqual([
    'read_page',
    'search_articles',
    'read_page',
    'search_articles',
    'read_page',
    'search_articles',
  ])
  expect(observed.expiredRegistrationsAborted).toBe(true)
  expect(observed.freshRegistrationActive).toBe(true)
})
