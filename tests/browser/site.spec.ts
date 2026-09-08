import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const draftURL = `http://127.0.0.1:${process.env.ASTRO_DRAFT_PORT ?? '4323'}`

test('slashless articles coexist with original files and semantic downloads', async ({
  page,
  request,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/posts/magma-paper')
  await expect(page).toHaveURL(/\/posts\/magma-paper$/)
  await expect(
    page.getByRole('heading', { name: 'Dense Linear Algebra on AMD GPUs', exact: true })
  ).toBeVisible()
  await page
    .getByText('files', { exact: false })
    .filter({ hasText: /^\d+ files$/ })
    .click()
  const pdfName = 'dense-linear-algebra-amd-gpus-hpec-2020.pdf'
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator(`a[download="${pdfName}"]`).click(),
  ])
  expect(download.suggestedFilename()).toBe(pdfName)
  const downloaded = await readFile((await download.path())!)
  const original = await readFile(`content/posts/magma-paper/${pdfName}`)
  expect(createHash('sha256').update(downloaded).digest('hex')).toBe(
    createHash('sha256').update(original).digest('hex')
  )
  const file = await request.get(`/posts/magma-paper/${pdfName}`)
  expect(file.headers()['content-type']).toContain('application/pdf')
  const source = await request.get('/posts/magma-paper/magma-paper.mdx')
  expect(source.headers()['content-type']).toContain('text/plain')
  expect(source.headers()['content-disposition']).toContain('filename="magma-paper.mdx"')
  const archive = await request.get('/posts/magma-paper/magma-paper-files.zip')
  expect(archive.headers()['content-type']).toContain('application/zip')
  expect(archive.headers()['content-disposition']).toContain('filename="magma-paper-files.zip"')
  await page.screenshot({ path: info.outputPath('article.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('theme switching survives document navigation; author pages contain articles', async ({
  page,
}, info) => {
  await page.goto('/posts')
  await page.evaluate(() => {
    ;(window as Window & { navigationMarker?: boolean }).navigationMarker = true
  })
  await page.getByRole('button', { name: "set theme: 'whiteboard'", exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'whiteboard')
  await page
    .getByRole('link', { name: 'Dense Linear Algebra on AMD GPUs', exact: true })
    .first()
    .click()
  await expect(page).toHaveURL(/\/posts\/magma-paper$/)
  expect(
    await page.evaluate(() => (window as Window & { navigationMarker?: boolean }).navigationMarker)
  ).toBeUndefined()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'whiteboard')
  await page.getByRole('button', { name: "set theme: 'blackboard'", exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'blackboard')
  await page.getByRole('link', { name: 'Cade Brown', exact: true }).first().click()
  await expect(page).toHaveURL(/\/authors\/cade-brown$/)
  await expect(
    page.getByRole('link', { name: 'Dense Linear Algebra on AMD GPUs', exact: true }).first()
  ).toBeVisible()
  await page.screenshot({ path: info.outputPath('authors.png') })
})

test('native math, code and gallery render in both themes without page overflow', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const theme of ['blackboard', 'whiteboard']) {
    for (const route of ['/posts/diy-gamma-zeta', '/posts/posters-diffusion', '/test']) {
      await page.goto(route)
      await page.getByRole('button', { name: `set theme: '${theme}'`, exact: true }).click()
      await page.evaluate(() => window.scrollTo(0, 0))
      if (route.includes('gamma')) {
        await expect(page.locator('.katex').first()).toBeVisible()
        expect(await page.locator('.expressive-code').count()).toBeGreaterThan(0)
      }
      if (route.includes('posters')) {
        expect(await page.locator('.gallery-list img').count()).toBeGreaterThan(20)
        expect(await page.locator('.gallery-list a[download]').count()).toBeGreaterThan(20)
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2
      )
      expect(overflow, `${route} must not overflow in ${theme}`).toBe(false)
      await page.screenshot({ path: info.outputPath(`${route.split('/').at(-1)}-${theme}.png`) })
    }
  }
  expect(errors).toEqual([])
})

test('legacy redirects point directly to final URLs; drafts stay absent', async ({ request }) => {
  const lines = (await readFile('dist/_redirects', 'utf8')).trim().split('\n')
  for (const line of lines) {
    const [from, to] = line.split(' ')
    const response = await request.get(from!, { maxRedirects: 0 })
    expect(response.status(), from).toBe(301)
    expect(new URL(response.headers().location!, 'http://127.0.0.1:4322').pathname, from).toBe(to)
    const final = await request.get(to!, { maxRedirects: 0 })
    expect(final.status(), to).toBe(200)
  }
  for (const slug of [
    'game-pikurn',
    'hwsw-setup',
    'langjam-kardinality',
    'machine-kolmogorov',
    'my-writing-environment',
    'rust-poker-0',
    'wow-css',
  ]) {
    expect((await request.get(`/posts/${slug}`)).status()).toBe(404)
    expect((await request.get(`/posts/${slug}/${slug}.mdx`)).status()).toBe(404)
  }
})

test('Pikurn solves adaptive games across objectives, horizons and blue stops', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${draftURL}/posts/game-pikurn`)
  const lab = page.locator('pikurn-explorer')
  await expect(lab.locator('[data-average]')).toHaveText('$233.33')
  await expect(lab.locator('[data-worst]')).toHaveText('$100.00')
  await expect(lab.locator('[data-wager]')).toHaveText('Wager $0.00')
  await page.getByLabel('Strategy objective', { exact: true }).selectOption('guaranteed')
  await expect(lab.locator('[data-average]')).toHaveText('$200.00')
  await expect(lab.locator('[data-worst]')).toHaveText('$200.00')
  await expect(lab.locator('[data-best]')).toHaveText('$200.00')
  await page.getByRole('button', { name: /Draw green/ }).click()
  await expect(lab.locator('[data-wager]')).toHaveText('Wager $50.00')
  await page.getByRole('button', { name: /Draw red/ }).click()
  await expect(lab.locator('[data-wager]')).toHaveText('Wager $100.00')
  await page.getByRole('button', { name: /Draw green/ }).click()
  await expect(lab.locator('[data-wager]')).toHaveText('Finish: $200.00')
  await expect(lab.locator('[data-draw]:enabled')).toHaveCount(0)
  await page.getByRole('button', { name: 'Reset this game' }).click()
  await page.getByRole('button', { name: "set theme: 'whiteboard'", exact: true }).click()
  await lab.screenshot({ path: info.outputPath('pikurn-guaranteed.png') })
  await page.getByLabel('Strategy objective', { exact: true }).selectOption('expected')
  await page.getByLabel('Maximum draws', { exact: true }).fill('1')
  await page.getByLabel('Maximum draws', { exact: true }).press('Tab')
  await expect(lab.locator('[data-average]')).toHaveText('$133.33')
  await expect(lab.locator('[data-wager]')).toHaveText('Wager $100.00')
  await page.getByLabel('Green balls', { exact: true }).fill('3')
  await page.getByLabel('Green balls', { exact: true }).press('Tab')
  await page.getByLabel('Blue balls', { exact: true }).fill('1')
  await page.getByLabel('Blue balls', { exact: true }).press('Tab')
  await page.getByLabel('Maximum draws', { exact: true }).fill('5')
  await page.getByLabel('Maximum draws', { exact: true }).press('Tab')
  await expect(lab.locator('[data-average]')).toHaveText('$190.00')
  await expect(lab.locator('[data-wager]')).toHaveText('Wager $100.00')
  await page.getByRole('button', { name: /Draw blue/ }).click()
  await expect(lab.locator('[data-wager]')).toHaveText('Finish: $100.00')
  await expect(lab.locator('[data-status]')).toContainText('blue returns the wager')
  await expect(page.locator('.katex-error')).toHaveCount(0)
  await expect(page.locator('svg[id^="mermaid"]').first()).toBeVisible()
  const geometry = page.locator('.pikurn-geometry')
  await expect(geometry.getByRole('img')).toHaveCount(2)
  await expect(geometry.getByRole('img').first()).toBeVisible()
  await expect(geometry.getByRole('img').last()).toBeVisible()
  await page.getByText('Deriving the frontier', { exact: true }).click()
  await expect(page.locator('.pikurn-proof[open]')).toContainText('the upper bound is attained')
  await geometry.screenshot({ path: info.outputPath('pikurn-decision-geometry.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
    true
  )
  expect(errors).toEqual([])
})

test('Pikurn wager lab shows the exact frontier and downloadable source', async ({
  page,
  request,
}, info) => {
  await page.goto(`${draftURL}/posts/game-pikurn`)
  const lab = page.locator('pikurn-wagers')
  await expect(lab.locator('[data-summary]')).toContainText('Expected final bankroll: $233.33')
  await lab.getByRole('button', { name: 'First-bet-only hedge', exact: true }).click()
  await expect(lab.locator('[data-summary]')).toContainText('Guaranteed final bankroll: $160.00')
  await lab.getByRole('button', { name: 'Guarantee $200', exact: true }).click()
  await expect(lab.locator('[data-summary]')).toHaveText(
    'Expected final bankroll: $200.00. Guaranteed final bankroll: $200.00.'
  )
  await expect(lab.locator('[data-bars] text').filter({ hasText: '$200.00' })).toHaveCount(3)
  await page.getByRole('button', { name: "set theme: 'whiteboard'", exact: true }).click()
  await lab.screenshot({ path: info.outputPath('pikurn-frontier-light.png') })
  await page.getByRole('button', { name: "set theme: 'blackboard'", exact: true }).click()
  await lab.screenshot({ path: info.outputPath('pikurn-frontier-dark.png') })
  await lab.getByRole('button', { name: 'Maximum average', exact: true }).click()
  const first = lab.getByRole('slider', { name: 'First wager in dollars' })
  await first.focus()
  await first.press('Home')
  await first.press('ArrowRight')
  await expect(first).toHaveValue('1')
  await expect(lab.locator('[data-summary]')).toContainText('Expected final bankroll: $233.00')
  const original = await readFile('content/posts/game-pikurn/pikurn.ts', 'utf8')
  const response = await request.get(`${draftURL}/posts/game-pikurn/pikurn.ts`)
  expect(response.status()).toBe(200)
  expect(await response.text()).toBe(original)
  await page.getByText('Read the complete solver and command-line program', { exact: true }).click()
  const code = page
    .locator('details')
    .filter({ hasText: 'Read the complete solver and command-line program' })
    .locator('pre')
  await expect(code).toBeVisible()
  const sourceLines = await code.locator('.ec-line .code').allTextContents()
  expect(sourceLines.map((line) => (line === '\n' ? '' : line)).join('\n')).toBe(original.trimEnd())
  await expect(code).toHaveAttribute('data-language', 'ts')
  await expect(code.locator('code')).toHaveCSS('border-top-width', '0px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
    true
  )
  await page.getByRole('link', { name: '/posts', exact: true }).click()
  await page
    .getByRole('link', { name: 'Pikurn: A Betting Game with a Twist', exact: true })
    .first()
    .click()
  await expect(page.locator('pikurn-explorer [data-average]')).toHaveText('$233.33')
})

test('heading links support keyboard use and light-theme prose links are readable', async ({
  page,
}) => {
  await page.goto('/posts/diy-gamma-zeta')
  await page.getByRole('button', { name: "set theme: 'whiteboard'", exact: true }).click()
  const permalink = page.locator('article h2 .autolink-headings-link').first()
  await expect(permalink).toHaveAttribute('aria-label', /.+/)
  await permalink.focus()
  await expect(permalink).toBeFocused()
  await expect(permalink).toBeVisible()
  const href = await permalink.getAttribute('href')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`${href}$`))
  const colors = await page
    .locator('article p a[href^="http"]')
    .first()
    .evaluate((element) => ({
      link: getComputedStyle(element).color,
      background: getComputedStyle(document.documentElement).getPropertyValue('--wow-back').trim(),
    }))
  const luminance = (color: string) => {
    const channels = color.startsWith('#')
      ? (color.length === 4
          ? [...color.slice(1)].map((c) => c + c)
          : color.slice(1).match(/../g)!
        ).map((c) => parseInt(c, 16))
      : color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
    return channels
      .map((value) => {
        const c = value / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index]!, 0)
  }
  const a = luminance(colors.link),
    b = luminance(colors.background)
  expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5)
})

test('theme controls work when browser storage is unavailable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem'])
      Object.defineProperty(Storage.prototype, method, {
        value() {
          throw new DOMException('Storage unavailable', 'SecurityError')
        },
      })
  })
  await page.goto('/posts')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'blackboard')
  const light = page.getByRole('button', { name: "set theme: 'whiteboard'", exact: true })
  await light.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'whiteboard')
  await expect(light).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('post listings retain readable text at larger font sizes', async ({ page }, info) => {
  for (const route of ['/posts', '/authors/cade-brown', '/authors']) {
    await page.goto(route)
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px'
    })
    const boxes = await page
      .locator('.slab, .slab-blurb, .card, .card-blurb')
      .evaluateAll((elements) =>
        elements.map((element) => ({
          mask: getComputedStyle(element).maskImage,
          clipped:
            element.scrollHeight > element.clientHeight + 2 &&
            ['hidden', 'clip'].includes(getComputedStyle(element).overflowY),
        }))
      )
    expect(boxes.length).toBeGreaterThan(0)
    for (const box of boxes) {
      expect(box.mask).toBe('none')
      expect(box.clipped).toBe(false)
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)
    ).toBe(true)
    await page.screenshot({ path: info.outputPath(`${route.split('/').at(-1)}-large-text.png`) })
  }
})

test('fenced and imported code share highlighting, titles, themes, and copying', async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/test')
  const fence = page
    .locator('.expressive-code')
    .filter({ has: page.getByText('expected-value.ts', { exact: true }) })
  const imported = page
    .locator('.expressive-code')
    .filter({ has: page.getByText('urls.ts', { exact: true }) })
  for (const block of [fence, imported]) {
    await expect(block.locator('pre')).toHaveAttribute('data-language', 'ts')
    await expect(block.locator('.code span[style]').first()).toBeVisible()
  }
  for (const theme of ['whiteboard', 'blackboard']) {
    await page.getByRole('button', { name: `set theme: '${theme}'`, exact: true }).click()
    expect(await fence.locator('pre').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      await imported.locator('pre').evaluate((el) => getComputedStyle(el).backgroundColor)
    )
    await fence.screenshot({ path: info.outputPath(`code-${theme}.png`) })
  }
  await imported.getByRole('button', { name: 'Copy to clipboard' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    (await readFile('src/lib/urls.ts', 'utf8')).trimEnd()
  )
})
