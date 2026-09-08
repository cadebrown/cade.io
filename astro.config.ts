import sharedAssets from './src/integrations/shared-assets'
import { SITE_CANON } from './src/site'
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import mdx from '@astrojs/mdx'
import { satteri, satteriHeadingIdsPlugin } from '@astrojs/markdown-satteri'
import mermaid from 'astro-mermaid'
import expressiveCode from 'astro-expressive-code'
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections'
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers'
import { pluginColorChips } from 'expressive-code-color-chips'
import { vscodeThemes } from './src/themes'
import {
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
      mdastPlugins: [mathNodes, postLinks],
      // Use Astro's native slug generation before adding permalink links.
      hastPlugins: [mathRendering, imageFigures, satteriHeadingIdsPlugin, headingLinks],
    }),
  },
  integrations: [
    sitemap({ filter: (page) => new URL(page).pathname !== '/test' }),
    sharedAssets(),
    expressiveCode({
      themes: [...Object.values(vscodeThemes)],
      plugins: [pluginCollapsibleSections(), pluginLineNumbers(), pluginColorChips()],
      defaultProps: {
        collapseStyle: 'collapsible-auto',
        wrap: true,
        overridesByLang: { 'zsh,bash,sh,ps,bat': { preserveIndent: false } },
      },
      styleOverrides: { codePaddingInline: '1.0em', codePaddingBlock: '1.0em' },
    }),
    mermaid({ theme: 'forest', autoTheme: true }),
    mdx(),
  ],
})
