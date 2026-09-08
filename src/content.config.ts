// Content entry points are deliberately separate from downloadable supporting files.

import { glob } from 'astro/loaders'
import { defineCollection, reference } from 'astro:content'
import { z } from 'astro/zod'

// define the `posts` collection, which are personal blog posts
const posts = defineCollection({
  // we keep the source files in the `content/posts` directory, within the root
  // this is not the same as the `src/content/posts` directory which Astro uses by default
  loader: glob({
    base: 'content/posts',
    pattern: '*/index.{md,mdx}',
    generateId: ({ entry }) => entry.split('/')[0]!,
  }),
  // type check the frontmatter using a schema
  schema: ({ image }) =>
    z.object({
      // if given, don't publish yet (i.e. keep it a draft)
      draft: z.boolean().default(false),
      // the date which the blog post is published, in ISO format (i.e. 'YYYY-MM-DD')
      dated: z.coerce.date(),
      // the title of the blog post, as a string
      title: z.string(),
      // the blurb of the blog post (a short description), as a string
      blurb: z.string(),
      // the cover image (preview/thumbnail), resolved by Astro's image pipeline
      // NOTE: https://docs.astro.build/en/guides/images/#images-in-content-collections
      image: image(),
      // default to the site's owner as the author
      authors: z.array(reference('authors')).default([{ collection: 'authors', id: 'cade-brown' }]),
      files: z
        .record(
          z.string(),
          z.object({
            label: z.string().optional(),
            description: z.string().optional(),
            exclude: z.boolean().optional(),
          })
        )
        .default({}),
      tags: z.array(z.string()).default([]),
      updated: z.coerce.date().optional(),
      repository: z.url().optional(),
    }),
})

const authors = defineCollection({
  loader: glob({ base: 'content/authors', pattern: '*.json' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      blurb: z.string(),
      image: image(),
      socials: z.object({
        email: z.string().optional(),
        website: z.string().optional(),
        github: z.string().optional(),
        linkedin: z.string().optional(),
        facebook: z.string().optional(),
        twitter: z.string().optional(),
        instagram: z.string().optional(),
        youtube: z.string().optional(),
        twitch: z.string().optional(),
      }),
    }),
})

export const collections = { posts, authors }
