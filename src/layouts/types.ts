import type { ImageMetadata } from 'astro'
import type { CollectionEntry } from 'astro:content'

export type AuthorReference =
  string | CollectionEntry<'authors'> | { collection: 'authors'; id: string }

export type PageData = {
  kind?: 'website' | 'article'
  title: string
  blurb: string
  dated?: Date
  authors?: AuthorReference[]
  image?: ImageMetadata | string
  reading?: { words: number; minutes: number }
}

/** MDX layouts receive frontmatter; Astro pages pass the same fields directly. */
export type LayoutProps = PageData | { frontmatter: PageData }
