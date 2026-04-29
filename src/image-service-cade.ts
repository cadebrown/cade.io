// image-service-cade.ts — custom Astro image service that avoids lossy re-encoding.
//
// Astro's default Sharp service decodes every image and re-encodes it at q80,
// even when the input is already a well-compressed WebP. For full-resolution
// outputs this causes generation loss (artifacts) and can make files larger.
//
// This service:
//   1. Passes through the input buffer unchanged when no resize is needed and
//      the source format already matches the target format. Pixel-perfect, smallest.
//   2. For resized variants (srcset), re-encodes at q90 by default — visually
//      indistinguishable from the source for typical content while keeping file
//      sizes reasonable. Per-image `quality` props still override this. Never upscales.
//
// When upgrading to Astro 6.1+, this can be replaced with a built-in
// passthroughImageService for full-size and per-image quality props for srcset.
//
// NOTE: this is wired via astro.config.ts -> image.service.entrypoint

import sharpService from 'astro/assets/services/sharp'
import type { LocalImageService } from 'astro'

const fitMap: Record<string, any> = {
	fill: 'fill',
	contain: 'inside',
	cover: 'cover',
	none: 'outside',
	'scale-down': 'inside',
	outside: 'outside',
	inside: 'inside',
}

const service: LocalImageService = {
	...sharpService,

	async transform(inputBuffer, transformOptions, config) {
		const t = transformOptions as any
		const srcExt = typeof t.src === 'string' ? t.src.split('.').pop()?.toLowerCase() : undefined

		// Passthrough: no resize requested, and the source format matches the target.
		// Returns the input buffer unmodified — zero quality loss, smallest file size.
		const noResize = !t.width && !t.height
		const sameFormat = t.format && srcExt === t.format
		if (noResize && sameFormat) {
			return { data: inputBuffer, format: t.format }
		}

		const sharp = (await import('sharp')).default
		sharp.cache(false)

		const result = sharp(inputBuffer, {
			failOnError: false,
			pages: -1,
			limitInputPixels: (config.service.config as any).limitInputPixels,
		})
		result.rotate()

		const kernel = (config.service.config as any).kernel

		// Always refuse to upscale — fake detail is wasted bytes and worse quality.
		if (t.width && t.height && t.fit) {
			result.resize({
				width: Math.round(t.width),
				height: Math.round(t.height),
				kernel,
				fit: fitMap[t.fit] ?? 'inside',
				position: t.position,
				withoutEnlargement: true,
			})
		} else if (t.height && !t.width) {
			result.resize({ height: Math.round(t.height), kernel, withoutEnlargement: true })
		} else if (t.width) {
			result.resize({ width: Math.round(t.width), kernel, withoutEnlargement: true })
		}

		if (t.background) {
			result.flatten({ background: t.background })
		}

		// Resolve the requested quality (Astro accepts presets or numbers).
		// Default to q90 — better than Astro's q80 default, much smaller than q95+.
		const qualityTable: Record<string, number> = { low: 25, mid: 50, high: 80, max: 100 }
		let quality: number = 90
		if (typeof t.quality === 'number') quality = t.quality
		else if (typeof t.quality === 'string' && t.quality in qualityTable) quality = qualityTable[t.quality]

		if (t.format) {
			result.toFormat(t.format, { quality })
		}

		const { data, info } = await result.toBuffer({ resolveWithObject: true })
		const needsCopy = 'buffer' in data && data.buffer instanceof SharedArrayBuffer
		return {
			data: needsCopy ? new Uint8Array(data) : data,
			format: info.format as any,
		}
	},
}

export default service
