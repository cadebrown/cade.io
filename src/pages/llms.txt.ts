import type { APIRoute } from 'astro'
import { getPublishedPosts, postUrl } from '../lib/content'
import { SITE_CANON, SITE_TITLE } from '../site'
import { discoverPostFiles } from '../lib/post-files'

export const GET: APIRoute = async () => {
  const posts = await getPublishedPosts()
  const entries = await Promise.all(
    posts.map(async ({ id, data }) => {
      const source = (await discoverPostFiles(id, data.files)).find((file) =>
        /^index\.mdx?$/.test(file.relativePath)
      )
      return (
        `- [${data.title}](${SITE_CANON}${postUrl(id)}): ${data.blurb}` +
        (source ? `\n  - [Source](${SITE_CANON}${source.url})` : '')
      )
    })
  )
  const text =
    `# ${SITE_TITLE}\n\nResearch, software, artwork, music, and essays by Cade Brown.\n\n` +
    `## Navigation\n\n- [Article index](${SITE_CANON}/posts)\n- [Search](${SITE_CANON}/search)\n- [Structured content index](${SITE_CANON}/content-index.json)\n- [RSS](${SITE_CANON}/rss.xml)\n\n` +
    `## Articles\n\n` +
    entries.join('\n') +
    '\n'
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
