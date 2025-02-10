// src/content/config.ts - defines Astro content collections (such as blog posts)

import { glob } from 'astro/loaders'
import { defineCollection, reference, z } from 'astro:content'

// define the `posts` collection, which are personal blog posts
const posts = defineCollection({
	// we keep the source files in the `content/posts` directory, within the root
	// this is not the same as the `src/content/posts` directory which Astro uses by default
	loader: glob({ base: 'src/content/posts', pattern: '**/*.{md,mdx}', }),
	// type check the frontmatter using a schema
	schema: ({ image }) => z.object({
		// if given, don't publish yet (i.e. keep it a draft)
		draft: z.boolean().default(false),
		// the date which the blog post is published, in ISO format (i.e. 'YYYY-MM-DD')
		dated: z.coerce.date(),
		// the title of the blog post, as a string
		title: z.string(),
		// the blurb of the blog post (a short description), as a string
		blurb: z.string(),
		// the cover image (preview/thumbnail), which should be an Astro image source
		// NOTE: https://docs.astro.build/en/guides/images/#images-in-content-collections
		// TODO: default here?
		image: z.string(),
		// image: image(),
		// default to the site's owner as the name
		names: z.array(reference('names')).default(['cade-brown']),
		// the keywords of the blog post, used for categorization
		// words: z.array(z.string()).default([]),
		// the names of the names of the blog post
		// names: z.array(z.string()).default([]),
	}),
})

const names = defineCollection({
	loader: glob({ base: 'src/content/names', pattern: '**/*.json' }),
	schema: ({ image }) => z.object({
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

export const collections = { posts, names }
