import { expect, test } from '@playwright/test'

for (const theme of ['blackboard', 'whiteboard']) {
  test(`original home appearance: ${theme}`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: `set theme: '${theme}'`, exact: true }).click()
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(Array.from(document.images, (image) => image.decode()))
      window.scrollTo(0, 0)
    })
    await expect(page).toHaveScreenshot(`home-${theme}.png`, { fullPage: true })
  })
}
