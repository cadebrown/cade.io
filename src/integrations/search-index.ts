import type { AstroIntegration } from 'astro'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import * as pagefind from 'pagefind'

/** Index only the public records emitted by the canonical publication query. */
export default function searchIndex(): AstroIntegration {
  return {
    name: 'cade-search-index',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir)
        try {
          const { index, errors } = await pagefind.createIndex({
            rootSelector: 'main',
            excludeSelectors: [
              '.post-files',
              '.expressive-code',
              'svg',
              '.katex-mathml',
              '[data-pagefind-ignore]',
            ],
          })
          if (!index || errors.length)
            throw new Error(errors.join('\n') || 'Pagefind did not create an index')
          const records = JSON.parse(await readFile(resolve(root, 'content-index.json'), 'utf8'))
            .posts as { url: string }[]
          for (const record of records) {
            const pathname = new URL(record.url).pathname
            const content = await readFile(resolve(root, `${pathname.slice(1)}.html`), 'utf8')
            const result = await index.addHTMLFile({ url: pathname, content })
            if (result.errors.length) throw new Error(result.errors.join('\n'))
          }
          const result = await index.writeFiles({ outputPath: resolve(root, 'pagefind') })
          if (result.errors.length) throw new Error(result.errors.join('\n'))
          logger.info(`Indexed ${records.length} published articles`)
        } finally {
          await pagefind.close()
        }
      },
      'astro:server:setup': ({ server }) => {
        // Dev uses the last production index; drafts never enter that index.
        server.middlewares.use('/pagefind', async (request, response, next) => {
          const pathname = request.url?.split('?')[0] ?? ''
          if (!/^\/[a-zA-Z0-9_./-]+$/.test(pathname) || pathname.includes('..')) return next()
          try {
            const bytes = await readFile(resolve('dist/pagefind', pathname.slice(1)))
            const extension = pathname.split('.').at(-1)
            response.setHeader(
              'Content-Type',
              extension === 'js'
                ? 'text/javascript'
                : extension === 'wasm'
                  ? 'application/wasm'
                  : 'application/octet-stream'
            )
            response.end(bytes)
          } catch {
            response.statusCode = 503
            response.end('Search needs a production build. Run npm run build.')
          }
        })
      },
    },
  }
}
