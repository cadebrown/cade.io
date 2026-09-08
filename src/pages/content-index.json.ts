import type { APIRoute } from 'astro'
import { getPublishedPosts, postUrl } from '../lib/content'
import { SITE_CANON, SITE_TITLE } from '../site'
import { discoverPostFiles } from '../lib/post-files'

export const GET: APIRoute = async () => {
  const posts = await getPublishedPosts()
  const records = await Promise.all(
    posts.map(async ({ id, data }) => {
      const files = await discoverPostFiles(id, data.files)
      return {
        id,
        title: data.title,
        description: data.blurb,
        url: new URL(postUrl(id), SITE_CANON).href,
        published: data.dated.toISOString(),
        updated: (data.updated ?? data.dated).toISOString(),
        tags: data.tags,
        source: files.find((file) => /^index\.mdx?$/.test(file.relativePath))?.url,
        files: `${postUrl(id)}#post-files-heading`,
        repository: data.repository,
      }
    })
  )
  return Response.json({
    version: 1,
    title: SITE_TITLE,
    url: SITE_CANON,
    search: '/search',
    feed: '/rss.xml',
    posts: records,
  })
}
