import type { AstroIntegration } from 'astro'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCareerDocument } from '../lib/career-documents'

/** Unreviewed career content is loaded only by an explicitly configured loopback dev server. */
export default function careerDocuments(): AstroIntegration {
  return {
    name: 'cade-career-documents',
    hooks: {
      'astro:config:setup': async ({ command, config, injectRoute, updateConfig }) => {
        const reviewDirectory = process.env.CAREER_REVIEW_DIR
        if (reviewDirectory && command !== 'dev' && command !== 'sync')
          throw new Error(
            'Career review content is development-only; production requires an approved export'
          )
        if (
          reviewDirectory &&
          command === 'dev' &&
          !['127.0.0.1', 'localhost', '::1'].includes(String(config.server.host))
        )
          throw new Error('Career review preview must bind to loopback')
        const directory = reviewDirectory
          ? resolve(reviewDirectory)
          : fileURLToPath(new URL('../data/career/', import.meta.url))
        if (!reviewDirectory && !existsSync(directory)) return
        const mode = reviewDirectory ? 'review' : 'public'
        for (const kind of ['resume', 'cv'] as const)
          await readCareerDocument(directory, kind, mode)
        updateConfig({
          vite: {
            define: {
              'import.meta.env.CAREER_DOCUMENT_DIR': JSON.stringify(directory),
              'import.meta.env.CAREER_DOCUMENT_MODE': JSON.stringify(mode),
            },
          },
        })
        for (const kind of ['resume', 'cv']) {
          injectRoute({
            pattern: `/${kind}`,
            entrypoint: fileURLToPath(new URL('../components/career/Page.astro', import.meta.url)),
            prerender: true,
          })
          if (mode === 'review')
            injectRoute({
              pattern: `/${kind}-CadeBrown.pdf`,
              entrypoint: fileURLToPath(new URL('../components/career/pdf.ts', import.meta.url)),
              prerender: true,
            })
        }
      },
      'astro:server:setup': ({ server }) => {
        if (!process.env.CAREER_REVIEW_DIR) return
        server.middlewares.use((req, res, next) => {
          const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
          if (/^\/(resume|cv)(\/|(?:-CadeBrown)?\.pdf)?$/.test(pathname)) {
            res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
            res.setHeader('Cache-Control', 'no-store')
          }
          next()
        })
      },
    },
  }
}
