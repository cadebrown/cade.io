// Smoke test: verifies a built site has all the structure we expect.
// Assumes `npm run build` has been run; CI runs build before tests.

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const dist = resolve(import.meta.dirname, '..', 'dist')

function read(rel: string) {
	return readFileSync(resolve(dist, rel), 'utf8')
}

describe('built site structure', () => {
	it('has dist/ directory (run npm run build first)', () => {
		expect(existsSync(dist)).toBe(true)
	})

	it('renders the homepage', () => {
		expect(existsSync(resolve(dist, 'index.html'))).toBe(true)
	})

	it('renders a 404 page', () => {
		expect(existsSync(resolve(dist, '404.html'))).toBe(true)
	})

	it('renders the post listing', () => {
		expect(existsSync(resolve(dist, 'posts', 'index.html'))).toBe(true)
	})

	it('renders individual posts at the expected paths', () => {
		expect(existsSync(resolve(dist, 'posts', 'rendering-fractals', 'index.html'))).toBe(true)
		expect(existsSync(resolve(dist, 'posts', 'diy-gamma-zeta', 'index.html'))).toBe(true)
	})

	it('emits an RSS feed with content', () => {
		const rss = read('rss.xml')
		expect(rss).toContain('<rss')
		expect(rss).toContain('<title>Near Computronium</title>')
		expect(rss).toContain('<pubDate>') // pubDate was a fix
		expect(rss).toContain('<description>') // description was a fix
	})

	it('RSS feed excludes draft posts', () => {
		const rss = read('rss.xml')
		// game-pikurn is marked draft and should not appear
		expect(rss).not.toContain('Pikurn')
	})

	it('emits a sitemap', () => {
		expect(existsSync(resolve(dist, 'sitemap-index.xml'))).toBe(true)
	})
})

describe('SEO metadata', () => {
	const homepage = () => read('index.html')
	const post = () => read('posts/diy-gamma-zeta/index.html')

	it('homepage has og:image (falls back to favicon)', () => {
		expect(homepage()).toMatch(/og:image"\s+content="[^"]+"/)
	})

	it('post has absolute og:image URL', () => {
		expect(post()).toMatch(/og:image"\s+content="https:\/\/cade\.io\/[^"]+"/)
	})

	it('post has canonical URL', () => {
		expect(post()).toMatch(/rel="canonical"\s+href="https:\/\/cade\.io\/posts\/diy-gamma-zeta"/)
	})

	it('post has JSON-LD BlogPosting structured data', () => {
		const html = post()
		expect(html).toContain('application/ld+json')
		expect(html).toContain('"@type":"BlogPosting"')
		expect(html).toContain('"headline":"DIY: Gamma and Zeta Functions"')
	})

	it('post has reading time displayed', () => {
		expect(post()).toMatch(/\d+\s*min read/)
	})

	it('homepage does NOT load apexcharts (only loaded on chart-using pages)', () => {
		const html = homepage()
		// The dynamic import means apexcharts.esm.* is in the bundle but not directly linked from homepage.
		// Verify no <script src=...apexcharts...> tag in the homepage HTML.
		expect(html).not.toMatch(/<script[^>]+src="[^"]*apexcharts[^"]*"/)
	})
})

describe('image optimization', () => {
	it('emits content-hashed image variants in /_astro/', () => {
		const astroDir = resolve(dist, '_astro')
		expect(existsSync(astroDir)).toBe(true)
		const files = readdirSync(astroDir)
		const webps = files.filter((f) => f.endsWith('.webp'))
		expect(webps.length).toBeGreaterThan(20) // many post images
	})
})
