import sharedAssets from './src/integrations/shared-assets'
import { SITE_CANON } from './src/site'
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import mdx from '@astrojs/mdx'
import { satteri, satteriHeadingIdsPlugin } from '@astrojs/markdown-satteri'
import mermaid from 'astro-mermaid'
import expressiveCode from 'astro-expressive-code'
import {
  preserveCodeMetadata,
  restoreCodeMetadata,
  mathNodes,
  mathRendering,
  imageFigures,
  headingLinks,
  postLinks,
} from './src/integrations/markdown'

export default defineConfig({
  site: SITE_CANON,
  trailingSlash: 'never',
  build: { format: 'file' },
  scopedStyleStrategy: 'where',
  compressHTML: true,
  server: { host: true },
  experimental: { contentIntellisense: true },
  markdown: {
    processor: satteri({
      features: {
        math: true,
        definitionList: true,
        directive: true,
        rawHtml: true,
        gfm: {
          footnotes: {
            label: 'References',
            clobberPrefix: '',
            backContent: (_reference, occurrence) => `↑${occurrence}`,
            backLabel: (reference, occurrence) =>
              `Back to reference ${reference}${occurrence > 1 ? ` (${occurrence})` : ''}`,
          },
        },
      },
      mdastPlugins: [mathNodes, postLinks, preserveCodeMetadata],
      // Use Astro's native slug generation before adding permalink links.
      hastPlugins: [
        restoreCodeMetadata,
        mathRendering,
        imageFigures,
        satteriHeadingIdsPlugin,
        headingLinks,
      ],
    }),
  },
  integrations: [
    sitemap({ filter: (page) => new URL(page).pathname !== '/test' }),
    sharedAssets(),
    expressiveCode(),
    mermaid({ theme: 'forest', autoTheme: true }),
    mdx(),
  ],
})
