import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

for (const kind of ['resume', 'cv']) {
  test(`${kind} preserves content, downloads, navigation and responsive themes`, async ({
    page,
    request,
  }, info) => {
    const snapshot = JSON.parse(
      await readFile(join(process.env.CAREER_REVIEW_DIR!, kind, 'document.json'), 'utf8')
    )
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const response = await page.goto(`/${kind}`)
    expect(response?.headers()['x-robots-tag']).toContain('noindex')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://cade.io/${kind}`
    )
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page.locator('.career-identity h1')).toHaveText('Cade Brown')
    const content = await page.locator('.career-identity, .career-body').allTextContents()
    const text = content.join(' ').replace(/\s+/g, ' ')
    let cursor = 0
    for (const block of snapshot.blocks) {
      if (!block.text) continue
      const value = block.text.replace(/\s+/g, ' ')
      const offset = text.indexOf(value, cursor)
      expect(offset, `${kind}: ${block.type} ${value}`).toBeGreaterThanOrEqual(cursor)
      cursor = offset + value.length
    }
    for (const theme of ['blackboard', 'whiteboard']) {
      await page.getByRole('button', { name: `set theme: '${theme}'`, exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      const a11y = await new AxeBuilder({ page })
        .include('.career-document')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      expect(a11y.violations).toEqual([])
      await page.evaluate(() => scrollTo(0, 0))
      await mkdir('artifacts/career/screenshots', { recursive: true })
      await page.screenshot({
        path: `artifacts/career/screenshots/${kind}-${info.project.name}-${theme}.png`,
        fullPage: true,
      })
      await page.screenshot({
        path: `artifacts/career/screenshots/${kind}-${info.project.name}-${theme}-viewport.png`,
      })
    }
    await page
      .getByRole('navigation', { name: 'Document sections' })
      .getByRole('link', {
        name: kind === 'resume' ? 'Selected Experience' : 'Experience',
        exact: true,
      })
      .click()
    await expect(page).toHaveURL(kind === 'resume' ? /#selected-experience-/ : /#experience-/)
    const viewPdf = page.getByRole('link', { name: 'View PDF', exact: true })
    await expect(viewPdf).toHaveAttribute('href', `/${kind}.pdf`)
    expect(await viewPdf.getAttribute('download')).toBeNull()
    const download = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Download PDF', exact: true }).click()
    expect((await download).suggestedFilename()).toBe(`cade-brown-${kind}.pdf`)
    const pdf = await request.get(`/${kind}.pdf`)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    expect(pdf.headers()['content-disposition']).toBe(`inline; filename="cade-brown-${kind}.pdf"`)
    expect(pdf.headers()['x-robots-tag']).toContain('noindex')
    expect(
      createHash('sha256')
        .update(await pdf.body())
        .digest('hex')
    ).toBe(snapshot.pdfSha256)
    expect(errors).toEqual([])
    await page
      .getByRole('navigation', { name: 'Career documents' })
      .getByRole('link', { name: kind === 'resume' ? 'Curriculum vitae' : 'Résumé', exact: true })
      .click()
    await expect(page.locator('.career-document')).toHaveAttribute(
      'data-career-kind',
      kind === 'resume' ? 'cv' : 'resume'
    )
  })
}

test('core career content and PDF links work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  for (const kind of ['resume', 'cv']) {
    await page.goto(`http://127.0.0.1:4326/${kind}`)
    await expect(page.locator('.career-identity h1')).toHaveText('Cade Brown')
    await expect(page.locator('.career-body')).toContainText('Senior CUDA Math Libraries Engineer')
    const viewPdf = page.getByRole('link', { name: 'View PDF', exact: true })
    await expect(viewPdf).toHaveAttribute('href', `/${kind}.pdf`)
    expect(await viewPdf.getAttribute('download')).toBeNull()
    await expect(page.getByRole('link', { name: 'Download PDF', exact: true })).toHaveAttribute(
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
