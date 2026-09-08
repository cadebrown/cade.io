import type { APIRoute } from 'astro'
import { getPublishedPosts } from '../lib/content'
import {
  archiveName,
  discoverPostFiles,
  postUrl,
  serializePostDownloadHeaders,
  type PostDownloadHeader,
} from '../lib/post-files'

// Injected explicitly because Astro excludes underscore-prefixed filesystem routes.
export const prerender = true
export const GET: APIRoute = async () => {
  const downloads: PostDownloadHeader[] = []
  for (const post of await getPublishedPosts({ includeDrafts: import.meta.env.DEV })) {
    downloads.push(...(await discoverPostFiles(post.id, post.data.files)))
    const name = archiveName(post.id)
    downloads.push({ name, url: `${postUrl(post.id)}/${name}`, mime: 'application/zip' })
  }
  return new Response(serializePostDownloadHeaders(downloads), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
