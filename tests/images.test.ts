import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

const dist = resolve(import.meta.dirname, '..', 'dist')
const read = (file: string) => readFileSync(resolve(dist, file), 'utf8')
const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]

// These assert published behavior, independent of Astro's image-service implementation.
describe('published gallery images', () => {
  const gallery = () =>
    read('posts/posters-diffusion.html').match(
      /<ol class="gallery-list\b[^\"]*"[\s\S]*?<\/ol>/
    )?.[0] ?? ''

  it('renders responsive images with dimensions and useful alternative text', () => {
    const images = gallery().match(/<img\b[^>]*>/g) ?? []
    expect(images.length).toBeGreaterThan(0)
    for (const tag of images) {
      expect(attribute(tag, 'alt')).toBeTruthy()
      expect(attribute(tag, 'alt')).not.toContain('undefined')
      expect(Number(attribute(tag, 'width'))).toBeGreaterThan(0)
      expect(Number(attribute(tag, 'height'))).toBeGreaterThan(0)
      expect(attribute(tag, 'sizes')).toContain('max-width')
      expect(attribute(tag, 'srcset')).toContain('w')
      expect(attribute(tag, 'loading')).toBe('lazy')
    }
  })

  it('prioritizes the article hero without making gallery images eager', () => {
    const images = read('posts/posters-diffusion.html').match(/<img\b[^>]*>/g) ?? []
    const priorityImages = images.filter((tag) => attribute(tag, 'fetchpriority') === 'high')
    expect(priorityImages).toHaveLength(1)
    expect(attribute(priorityImages[0], 'loading')).toBe('eager')
    expect(attribute(priorityImages[0], 'decoding')).toBe('sync')
  })

  it('writes the responsive variants with the advertised widths', async () => {
    const image = gallery().match(/<img\b[^>]*>/)?.[0] ?? ''
    const variants = (attribute(image, 'srcset') ?? '').split(',').filter(Boolean)
    expect(variants.length).toBeGreaterThan(1)
    for (const variant of variants) {
      const [url, descriptor] = variant.trim().split(/\s+/)
      const file = resolve(dist, url.replace(/^\//, ''))
      expect(existsSync(file)).toBe(true)
      const metadata = await sharp(file).metadata()
      expect(metadata.width).toBe(Number(descriptor.replace(/w$/, '')))
    }
  })

  it('links downloadable originals through semantic article URLs', () => {
    const links = gallery().match(/<a\b[^>]*\bdownload[^>]*>/g) ?? []
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      const url = attribute(link, 'href') ?? ''
      expect(url).toMatch(/^\/posts\/posters-diffusion\/[^/]+\.webp$/)
      expect(existsSync(resolve(dist, url.slice(1)))).toBe(true)
    }
  })
})
