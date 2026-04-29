import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import service from '../src/image-service-cade'

// Minimal config object passed by Astro to image services.
const stubConfig = {
	service: { config: {} },
} as any

async function makeWebp({ width = 200, height = 100, color = { r: 50, g: 100, b: 200 } } = {}) {
	return await sharp({
		create: { width, height, channels: 3, background: color },
	}).webp({ quality: 85 }).toBuffer()
}

// Noisy image — quality differences are only visible on content with detail.
async function makeNoisyWebp({ width = 600, height = 400 } = {}) {
	const pixels = Buffer.alloc(width * height * 3)
	for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 2654435761) & 0xff // pseudo-random
	return await sharp(pixels, { raw: { width, height, channels: 3 } })
		.webp({ quality: 90 })
		.toBuffer()
}

describe('image-service-cade', () => {
	describe('passthrough', () => {
		it('returns the input buffer unchanged when format matches and no resize is requested', async () => {
			const input = await makeWebp()
			const out = await service.transform!(input, { src: '/foo.webp', format: 'webp' } as any, stubConfig)
			expect(out.format).toBe('webp')
			expect(out.data).toBe(input) // identity, not just equal — proves no copy
		})

		it('passes through PNG sources when target format is PNG', async () => {
			const input = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer()
			const out = await service.transform!(input, { src: '/icon.png', format: 'png' } as any, stubConfig)
			expect(out.format).toBe('png')
			expect(out.data).toBe(input)
		})

		it('does NOT passthrough when source format differs from target', async () => {
			const input = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer()
			const out = await service.transform!(input, { src: '/foo.png', format: 'webp' } as any, stubConfig)
			expect(out.format).toBe('webp')
			expect(out.data).not.toBe(input)
		})

		it('does NOT passthrough when a resize is requested (width)', async () => {
			const input = await makeWebp({ width: 400 })
			const out = await service.transform!(input, { src: '/foo.webp', format: 'webp', width: 200 } as any, stubConfig)
			expect(out.data).not.toBe(input)
		})

		it('does NOT passthrough when a resize is requested (height)', async () => {
			const input = await makeWebp({ height: 400 })
			const out = await service.transform!(input, { src: '/foo.webp', format: 'webp', height: 200 } as any, stubConfig)
			expect(out.data).not.toBe(input)
		})
	})

	describe('no-upscale guarantee', () => {
		it('refuses to upscale beyond source width', async () => {
			const input = await makeWebp({ width: 200, height: 100 })
			const out = await service.transform!(input, { src: '/foo.webp', format: 'webp', width: 1000 } as any, stubConfig)
			const meta = await sharp(out.data as Buffer).metadata()
			expect(meta.width).toBeLessThanOrEqual(200)
		})

		it('refuses to upscale beyond source height', async () => {
			const input = await makeWebp({ width: 200, height: 100 })
			const out = await service.transform!(input, { src: '/foo.webp', format: 'webp', height: 500 } as any, stubConfig)
			const meta = await sharp(out.data as Buffer).metadata()
			expect(meta.height).toBeLessThanOrEqual(100)
		})

		it('does downscale when requested smaller than source', async () => {
			const input = await makeWebp({ width: 800, height: 400 })
			const out = await service.transform!(input, { src: '/foo.webp', format: 'webp', width: 200 } as any, stubConfig)
			const meta = await sharp(out.data as Buffer).metadata()
			expect(meta.width).toBe(200)
		})
	})

	describe('quality handling', () => {
		it('uses default q90 when no quality is specified (smaller than q100)', async () => {
			const input = await makeNoisyWebp()
			const outDefault = await service.transform!(input, { src: '/a.webp', format: 'webp', width: 300 } as any, stubConfig)
			const outMax = await service.transform!(input, { src: '/a.webp', format: 'webp', width: 300, quality: 100 } as any, stubConfig)
			expect((outDefault.data as Buffer).length).toBeLessThan((outMax.data as Buffer).length)
		})

		it('respects numeric quality prop', async () => {
			const input = await makeNoisyWebp()
			const lowQ = await service.transform!(input, { src: '/a.webp', format: 'webp', width: 300, quality: 30 } as any, stubConfig)
			const highQ = await service.transform!(input, { src: '/a.webp', format: 'webp', width: 300, quality: 95 } as any, stubConfig)
			expect((lowQ.data as Buffer).length).toBeLessThan((highQ.data as Buffer).length)
		})

		it('respects string quality presets ("low" < "max")', async () => {
			const input = await makeNoisyWebp()
			const low = await service.transform!(input, { src: '/a.webp', format: 'webp', width: 300, quality: 'low' } as any, stubConfig)
			const max = await service.transform!(input, { src: '/a.webp', format: 'webp', width: 300, quality: 'max' } as any, stubConfig)
			expect((low.data as Buffer).length).toBeLessThan((max.data as Buffer).length)
		})
	})

	describe('format conversion', () => {
		it('converts WebP source to PNG when format=png', async () => {
			const input = await makeWebp()
			const out = await service.transform!(input, { src: '/foo.webp', format: 'png' } as any, stubConfig)
			expect(out.format).toBe('png')
			const meta = await sharp(out.data as Buffer).metadata()
			expect(meta.format).toBe('png')
		})
	})
})
