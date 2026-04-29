/// rss.xml.ts - generates the rss.xml file for the site
// NOTE: https://docs.astro.build/en/recipes/rss/

import { getCollection } from 'astro:content'

import rss from '@astrojs/rss'

import { SITE_TITLE, SITE_BLURB } from '@site'

export async function GET(context: any) {
	const posts = await getCollection('posts', ({ data }) => !data.draft)
	return rss({
		title: SITE_TITLE,
		description: SITE_BLURB,
		site: context.site,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.blurb,
			pubDate: post.data.dated,
			link: `/posts/${post.id}/`,
		})),
	})
}
