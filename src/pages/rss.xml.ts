/// rss.xml.ts - generates the rss.xml file for the site
// NOTE: https://docs.astro.build/en/recipes/rss/

import type { APIContext } from 'astro'
import { getPublishedPosts, postUrl } from '../lib/content'

import rss from '@astrojs/rss'

import { SITE_TITLE, SITE_BLURB } from '@site'

export async function GET(context: APIContext) {
  const posts = await getPublishedPosts()
  return rss({
    title: SITE_TITLE,
    description: SITE_BLURB,
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.blurb,
      pubDate: post.data.dated,
      link: postUrl(post.id),
    })),
  })
}
