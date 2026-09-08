import type { AstroIntegration } from 'astro'
import { copyFile, mkdir, readFile, readdir, access, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverSharedAssets } from '../lib/shared-assets'
import { postUrl } from '../lib/post-files'
import legacy from '../data/legacy-urls.json'

const mime: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.mdx': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.py': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
}

/** Publish shared canonical sources and derive host redirects without source copies in public/. */
export default function sharedAssets(): AstroIntegration {
  let root = process.cwd()
  async function aliases(sharedAliases: Map<string, string>, published?: Set<string>) {
    const map = new Map(Object.entries(legacy))
    for (const [from, to] of sharedAliases) {
      if (map.has(from) && map.get(from) !== to) throw new Error(`Conflicting redirect: ${from}`)
      map.set(from, to)
    }
    for (const entry of await readdir(join(root, 'content/posts'), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const target = postUrl(entry.name)
      if (published && !published.has(target)) continue
      map.set(`${target}/`, target)
      map.set(`${target}.html`, target)
    }
    for (const [from, target] of [...map]) {
      if (!extname(from) && !from.endsWith('/')) {
        map.set(`${from}/`, target)
        map.set(`${from}.html`, target)
      }
    }
    return map
  }
  return {
    name: 'cade-shared-assets',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        injectRoute({
          pattern: '/_headers',
          entrypoint: fileURLToPath(new URL('../pages/_headers.ts', import.meta.url)),
          prerender: true,
        })
      },
      'astro:config:done': ({ config }) => {
        root = fileURLToPath(config.root)
      },
      'astro:server:setup': async ({ server }) => {
        const sharedRoot = join(root, 'src/assets')
        let inventory = await discoverSharedAssets(sharedRoot)
        let redirects = await aliases(inventory.aliases)
        let stale = false
        server.watcher.on('all', (_event, file) => {
          if (file.startsWith(`${sharedRoot}/`)) stale = true
        })
        server.middlewares.use(async (req, res, next) => {
          try {
            if (stale) {
              inventory = await discoverSharedAssets(sharedRoot)
              redirects = await aliases(inventory.aliases)
              stale = false
            }
            const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
            const destination = redirects.get(pathname)
            if (destination) {
              res.writeHead(301, { Location: destination })
              res.end()
              return
            }
            const asset = inventory.assets.find((asset) => asset.url === pathname)
            if (!asset) {
              next()
              return
            }
            res.setHeader('Content-Type', mime[extname(asset.url)] ?? 'application/octet-stream')
            res.end(await readFile(asset.sourcePath))
          } catch (error) {
            next(error)
          }
        })
      },
      'astro:build:done': async ({ dir, pages }) => {
        const output = fileURLToPath(dir)
        const inventory = await discoverSharedAssets(join(root, 'src/assets'))
        for (const asset of inventory.assets) {
          const destination = join(output, asset.url)
          try {
            await access(destination)
            throw new Error(`Shared asset output collision: ${asset.url}`)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          }
          await mkdir(dirname(destination), { recursive: true })
          await copyFile(asset.sourcePath, destination)
        }
        const published = new Set(
          pages.map((page) => `/${page.pathname}`.replace(/^\/+/, '/').replace(/\/$/, ''))
        )
        const redirects = await aliases(inventory.aliases, published)
        const rewrites = new Map<string, string>()
        // Older directory builds permanently redirected these URLs to a trailing slash.
        // Serve that cached destination instead of redirecting it back into a loop.
        for (const page of published) {
          if (!page || page === '/404') continue
          try {
            await access(join(output, `${page}.html`))
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
            throw error
          }
          redirects.delete(`${page}/`)
          rewrites.set(`${page}/`, page)
        }
        for (const [from, target] of redirects) {
          const exists = await Promise.all(
            [target, `${target}.html`, `${target}/index.html`].map(async (candidate) => {
              try {
                await access(join(output, candidate))
                return true
              } catch {
                return false
              }
            })
          )
          if (!exists.some(Boolean)) throw new Error(`Redirect ${from} targets missing ${target}`)
          if (redirects.has(target)) throw new Error(`Redirect chain: ${from} -> ${target}`)
        }
        await writeFile(
          join(output, '_redirects'),
          [
            ...[...redirects].map(([from, to]) => `${from} ${to} 301`),
            ...[...rewrites].map(([from, to]) => `${from} ${to} 200`),
          ]
            .sort()
            .join('\n') + '\n'
        )
      },
    },
  }
}
