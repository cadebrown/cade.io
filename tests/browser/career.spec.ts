import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type Snapshot = {
  pdfSha256: string
  blocks: { text?: string }[]
}

const kinds = ['resume', 'cv'] as const

async function snapshot(kind: (typeof kinds)[number]): Promise<Snapshot> {
  return JSON.parse(await readFile(join('src/data/career', kind, 'document.json'), 'utf8'))
}

for (const kind of kinds) {
  test(`public ${kind} preserves its approved snapshot and PDF`, async ({ page, request }) => {
    const career = await snapshot(kind)
    const response = await page.goto(`/${kind}`)
    expect(response?.status()).toBe(200)
    expect(response?.headers()['x-robots-tag']).toBeUndefined()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://cade.io/${kind}`
    )
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await expect(page.getByText('Private review', { exact: false })).toHaveCount(0)
    await expect(page.locator('.career-identity h1')).toHaveText('Cade Brown')

    const visibleText = (await page.locator('.career-identity, .career-body').allTextContents())
      .join(' ')
      .replace(/\s+/g, ' ')
    let cursor = 0
    for (const block of career.blocks) {
      if (!block.text) continue
      const text = block.text.replace(/\s+/g, ' ')
      const position = visibleText.indexOf(text, cursor)
      expect(position, `${kind} block after ${cursor}: ${text}`).toBeGreaterThanOrEqual(cursor)
      cursor = position + text.length
    }

    for (const theme of ['blackboard', 'whiteboard']) {
      await page.getByRole('button', { name: `set theme: '${theme}'`, exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)
      ).toBe(true)
      const a11y = await new AxeBuilder({ page })
        .include('.career-document')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      expect(a11y.violations).toEqual([])
    }

    const view = page.getByRole('link', { name: 'View PDF', exact: true })
    await expect(view).toHaveAttribute('href', `/${kind}.pdf`)
    expect(await view.getAttribute('download')).toBeNull()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download PDF', exact: true }).click(),
    ])
    expect(download.suggestedFilename()).toBe(`cade-brown-${kind}.pdf`)
    const pdf = await request.get(`/${kind}.pdf`)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    expect(pdf.headers()['x-robots-tag']).toBeUndefined()
    expect(
      createHash('sha256')
        .update(await pdf.body())
        .digest('hex')
    ).toBe(career.pdfSha256)
  })
}

test('public career PDFs have one canonical address and historic aliases redirect directly', async ({
  request,
}) => {
  for (const kind of kinds) {
    const canonical = `/${kind}.pdf`
    for (const alias of [`/cade-brown-${kind}.pdf`, `/bones/${kind}-CadeBrown.pdf`]) {
      const redirect = await request.get(alias, { maxRedirects: 0 })
      expect(redirect.status(), alias).toBe(301)
      expect(new URL(redirect.headers().location!, 'http://127.0.0.1:4322').pathname).toBe(
        canonical
      )
    }
    expect((await request.get(canonical, { maxRedirects: 0 })).status(), canonical).toBe(200)
  }
})

test('public career pages and download links remain usable without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  for (const kind of kinds) {
    await page.goto(`http://127.0.0.1:4322/${kind}`)
    await expect(page.locator('.career-identity h1')).toHaveText('Cade Brown')
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'View PDF', exact: true })).toHaveAttribute(
      'href',
      `/${kind}.pdf`
    )
    await expect(page.getByRole('link', { name: 'Download PDF', exact: true })).toHaveAttribute(
      'download',
      `cade-brown-${kind}.pdf`
    )
  }
  await context.close()
})
