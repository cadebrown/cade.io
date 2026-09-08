import { expect, test } from '@playwright/test'

test('Pikurn bankroll labels stay inside the complete SVG at extreme wagers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/posts/game-pikurn')
  const lab = page.locator('pikurn-wagers')
  await lab.scrollIntoViewIfNeeded()
  const first = lab.locator('[data-x]')
  const second = lab.locator('[data-y]')
  await expect(first).toBeEnabled()
  for (const [x, y] of [
    [0, 0],
    [50, 50],
    [100, 0],
    [100, 200],
  ]) {
    await first.fill(String(x))
    await second.fill(String(y))
    const labels = await lab.locator('svg[data-bars]').evaluate((element) => {
      const svg = element as SVGSVGElement
      return [...svg.querySelectorAll('text')]
        .filter((label) => label.textContent?.startsWith('$'))
        .map((label) => {
          const box = label.getBBox()
          return {
            label: label.textContent,
            left: box.x,
            right: box.x + box.width,
            limit: svg.viewBox.baseVal.width,
          }
        })
    })
    expect(labels).toHaveLength(3)
    for (const label of labels) {
      expect(label.left, `${x}, ${y}: ${label.label}`).toBeGreaterThanOrEqual(0)
      expect(label.right, `${x}, ${y}: ${label.label}`).toBeLessThanOrEqual(label.limit)
    }
  }
})

test('video embeds load only on activation and receive keyboard focus', async ({ page }) => {
  const requested: string[] = []
  await page.route('https://www.youtube.com/**', async (route) => {
    requested.push(route.request().url())
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Video test fixture</title><button>Play</button>',
    })
  })
  await page.goto('/posts/rendering-fractals')
  const container = page.locator('.youtube')
  await expect(container.locator('iframe')).toHaveCount(0)
  expect(requested).toEqual([])
  const link = container.getByRole('link', { name: /^Load video:/ })
  await link.focus()
  await link.press('Enter')
  const frame = container.locator('iframe')
  await expect(frame).toHaveAttribute('src', 'https://www.youtube.com/embed/ynSdQAhDoWQ')
  await expect(frame).toBeFocused()
  await expect.poll(() => requested.length).toBe(1)
})

test('video links remain usable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4322/posts/rendering-fractals')
  await expect(
    page.locator('.youtube').getByRole('link', { name: /^Load video:/ })
  ).toHaveAttribute('href', 'https://www.youtube.com/watch?v=ynSdQAhDoWQ')
  await expect(page.locator('.youtube iframe')).toHaveCount(0)
  await context.close()
})

test('a failed search clears results belonging to the previous query', async ({ page }) => {
  await page.route('**/pagefind/pagefind.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export async function init() {}
      export async function search(query) {
        if (query !== 'working') throw new Error('Search fixture failed');
        return {results: [{data: async () => ({url: '/posts/game-pikurn', meta: {title: 'Pikurn'}, excerpt: 'An urn game.'})}]};
      }`,
    })
  )
  await page.goto('/search?q=working')
  const results = page.locator('[data-search-results]')
  await expect(results).toContainText('Pikurn')
  await page.getByRole('searchbox').fill('failing')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.locator('[data-search-status]')).toContainText('Search is unavailable')
  await expect(results).toBeEmpty()
})
