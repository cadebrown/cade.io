import type { ImageMetadata } from 'astro'

/** Social metadata needs an absolute image URL, including a fallback for text-only pages. */
export function imageUrl(image: ImageMetadata | string | undefined, site: URL): URL {
  const source = typeof image === 'string' ? image : image?.src
  return new URL(source ?? '/favicon-96x96.png', site)
}
