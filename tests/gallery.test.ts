import { describe, expect, it } from 'vitest'
import type { ImageMetadata } from 'astro'
import { galleryImages } from '../src/lib/gallery'

const image: ImageMetadata = Object.freeze({
  src: '/_astro/image.webp',
  width: 320,
  height: 240,
  format: 'webp',
})
describe('gallery authoring', () => {
  it('sorts numerically while retaining metadata and stable original URLs', () => {
    const files = Object.freeze({
      './image-10.webp': image,
      './image-2.webp': image,
      './image-1.webp': image,
    })
    const entries = galleryImages(files, {
      post: 'example',
      label: 'Generated landscape',
      descriptions: { 'image-2.webp': { alt: 'Blue hills', caption: 'A study in blue.' } },
    })
    expect(entries.map(({ original }) => original)).toEqual([
      '/posts/example/image-1.webp',
      '/posts/example/image-2.webp',
      '/posts/example/image-10.webp',
    ])
    expect(entries[0]?.alt).toBe('Generated landscape, variation 1')
    expect(entries[1]).toMatchObject({ alt: 'Blue hills', caption: 'A study in blue.' })
    expect(entries.every(({ src }) => src === image)).toBe(true)
  })
  it.each(['../escape.webp', '/elsewhere/image.webp', './nested/../escape.webp'])(
    'rejects images outside the post: %s',
    (file) => {
      expect(() => galleryImages({ [file]: image }, { post: 'example', label: 'Image' })).toThrow()
    }
  )
  it('catches descriptions that no longer match a discovered image', () => {
    expect(() =>
      galleryImages(
        { './a.webp': image },
        { post: 'example', label: 'Image', descriptions: { 'typo.webp': { alt: 'Not found' } } }
      )
    ).toThrow('missing image')
  })
})
