import { expect, test } from '@playwright/test'

test('enlargement loads on demand, closes with Escape, and restores focus and scroll', async ({
  page,
}) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('/test#preview-enlarge')
  const viewer = page.locator('image-viewer')
  const enlarged = new URL((await viewer.getAttribute('data-enlarged-src'))!, page.url()).href
  expect(requests).not.toContain(enlarged)
  const trigger = viewer.getByRole('link', { name: 'Enlarge image', exact: true })
  await trigger.scrollIntoViewIfNeeded()
  const scroll = await page.evaluate(() => window.scrollY)
  await trigger.click()
  const dialog = viewer.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const bounds = (await dialog.boundingBox())!
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  await expect(dialog.locator('img')).toBeVisible()
  await expect
    .poll(() =>
      dialog
        .locator('img')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)
    )
    .toBe(true)
  expect(requests).toContain(enlarged)
  await expect(dialog.getByRole('button', { name: 'Close image' })).toBeFocused()
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scroll)).toBeLessThan(2)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scroll)).toBeLessThan(2)
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden')
  await trigger.click()
  await dialog.getByRole('button', { name: 'Close image' }).click()
  await expect(dialog).not.toBeVisible()
})

test('comparison supports keyboard endpoints, pointer reveal, and independent instances', async ({
  page,
}) => {
  await page.goto('/test#preview-compare')
  const compare = page.locator('image-compare').first()
  const slider = compare.getByRole('slider')
  await expect(slider).toBeEnabled()
  await slider.focus()
  await page.keyboard.press('Home')
  await expect(slider).toHaveValue('0')
  await expect(compare.locator('[data-output]')).toHaveText('0%')
  await page.keyboard.press('End')
  await expect(slider).toHaveValue('100')
  await page.keyboard.press('ArrowLeft')
  await expect(slider).toHaveValue('99')
  const stage = compare.locator('[data-stage]')
  const bounds = (await stage.boundingBox())!
  await stage.click({ position: { x: bounds.width / 4, y: bounds.height / 2 } })
  await expect(slider).toHaveValue('25')
  await page.evaluate(() => {
    const original = document.querySelector('image-compare')!
    const copy = original.cloneNode(true)
    original.parentElement!.append(copy)
  })
  const other = page.locator('image-compare').nth(1).getByRole('slider')
  await other.focus()
  await page.keyboard.press('End')
  await expect(other).toHaveValue('100')
  await expect(slider).toHaveValue('25')
})

test('gallery rows preserve every image ratio without mobile overflow', async ({ page }) => {
  await page.goto('/test#preview-gallery')
  const gallery = page.locator('[data-preview="gallery-rows"]')
  await gallery.scrollIntoViewIfNeeded()
  const measurements = await gallery.locator('img').evaluateAll(async (images) => {
    await Promise.all(images.map((img) => (img as HTMLImageElement).decode()))
    return images.map((image) => {
      const img = image as HTMLImageElement
      const rect = img.getBoundingClientRect()
      return {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        ratio: Number(img.getAttribute('width')) / Number(img.getAttribute('height')),
      }
    })
  })
  for (const img of measurements)
    expect(Math.abs(img.width / img.height - img.ratio)).toBeLessThan(0.015)
  if (page.viewportSize()!.width > 1000) {
    expect(
      Math.max(...measurements.map((image) => image.top)) -
        Math.min(...measurements.map((image) => image.top))
    ).toBeLessThan(2)
    expect(
      Math.max(...measurements.map((image) => image.height)) -
        Math.min(...measurements.map((image) => image.height))
    ).toBeLessThan(3)
  }
  const overflows = await gallery.evaluate(
    (element) => element.getBoundingClientRect().right > document.documentElement.clientWidth
  )
  expect(overflows).toBe(false)
})

test('image previews retain complete images and usable original links without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4322/test#preview-compare')
  const compare = page.locator('image-compare')
  const images = compare.locator('[data-fallback] img')
  await expect(images).toHaveCount(2)
  for (const image of await images.all()) {
    await expect(image).toBeVisible()
    await expect(image).toHaveCSS('object-fit', 'contain')
  }
  await expect(compare.locator('[data-range]')).toBeDisabled()
  await expect(compare.locator('[data-controls]')).toBeHidden()
  const original = page
    .locator('image-viewer')
    .getByRole('link', { name: 'Enlarge image', exact: true })
  expect(await original.getAttribute('href')).toMatch(/^\/_astro\//)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true)
  await context.close()
})

test('delayed enhancement preserves comparison geometry', async ({ page }) => {
  let release!: () => void
  const scripts = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\.(?:js|mjs)(?:\?.*)?$/, async (route) => {
    await scripts
    await route.continue()
  })
  await page.goto('/test#preview-compare', { waitUntil: 'commit' })
  const compare = page.locator('image-compare')
  await expect(compare).toBeVisible()
  const before = (await compare.boundingBox())!
  release()
  await expect(compare).toHaveAttribute('data-enhanced', 'true')
  const after = (await compare.boundingBox())!
  expect(Math.abs(before.width - after.width)).toBeLessThan(1)
  expect(Math.abs(before.height - after.height)).toBeLessThan(1)
})
