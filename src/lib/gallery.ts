import type { ImageMetadata } from 'astro'
import { resolvePostLink } from './post-files'

export interface GalleryImage {
  src: ImageMetadata
  alt: string
  caption?: string
  original: string
}

interface GalleryOptions {
  post: string
  label: string
  descriptions?: Record<string, { alt?: string; caption?: string }>
}

/** Keep Vite's literal glob in the post; share ordering and original-file URL rules here. */
export function galleryImages(
  images: Record<string, ImageMetadata>,
  { post, label, descriptions = {} }: GalleryOptions
): GalleryImage[] {
  const entries = Object.entries(images).sort(([a], [b]) =>
    a.localeCompare(b, 'en', { numeric: true })
  )
  const files = new Set(entries.map(([file]) => file.replace(/^\.\//, '')))
  for (const file of Object.keys(descriptions)) {
    if (!files.has(file)) throw new Error(`Gallery description references missing image: ${file}`)
  }
  return entries.map(([file, src], index) => {
    if (!file.startsWith('./'))
      throw new Error(`Gallery images must use post-relative paths: ${file}`)
    const description = descriptions[file.slice(2)]
    return {
      src,
      alt: description?.alt ?? `${label}, variation ${index + 1}`,
      caption: description?.caption,
      original: resolvePostLink(post, file),
    }
  })
}
