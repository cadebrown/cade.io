import { getCollection } from 'astro:content'

export { postUrl } from './post-files'

export function isPublished(post: { data: { draft?: boolean } }): boolean {
  return post.data.draft !== true
}

/** Feed and production callers omit options; draft preview is explicitly local. */
export async function getPublishedPosts({ includeDrafts = false } = {}) {
  return (await getCollection('posts', (post) => includeDrafts || isPublished(post))).sort(
    (a, b) => b.data.dated.valueOf() - a.data.dated.valueOf()
  )
}
