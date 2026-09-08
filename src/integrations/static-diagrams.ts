import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'
import type { Plugin } from 'vite'

const require = createRequire(import.meta.url)
const mermaidVersion = require('mermaid/package.json').version as string
const rendererVersion = `mermaid-${mermaidVersion}-playwright-2`

const themeConfigs = {
  light: { theme: 'default' },
  dark: { theme: 'dark', themeVariables: { edgeLabelBackground: '#333333' } },
} as const

type Theme = keyof typeof themeConfigs
type MermaidRenderer = {
  render(id: string, source: string, config: (typeof themeConfigs)[Theme]): Promise<string>
  close(): Promise<void>
}

type RenderOptions = {
  root: string
  cacheDir: string
  renderer: MermaidRenderer
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function prefixSvgIds(svg: string, prefix: string): string {
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!)
  for (const id of ids) {
    if (id === prefix) continue
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    svg = svg.replaceAll(`id="${id}"`, `id="${prefix}--${id}"`)
    svg = svg.replace(new RegExp(`url\\(#${escaped}\\)`, 'g'), `url(#${prefix}--${id})`)
    svg = svg.replace(new RegExp(`(["'])#${escaped}\\1`, 'g'), `$1#${prefix}--${id}$1`)
    svg = svg.replace(
      new RegExp(`((?:aria-labelledby|aria-describedby|aria-owns)="[^"]*)\\b${escaped}\\b`, 'g'),
      `$1${prefix}--${id}`
    )
    svg = svg.replace(new RegExp(`#${escaped}(?=[\\s,.:\\[>{])`, 'g'), `#${prefix}--${id}`)
  }
  return svg
}

function accessibleMetadata(source: string): { title: string; description?: string } {
  const title = source.match(/^\s*accTitle:\s*(.+)\s*$/m)?.[1]
  const description = source.match(/^\s*accDescr:\s*(.+)\s*$/m)?.[1]
  const type = source.match(/^\s*([\w-]+)/m)?.[1]?.toLowerCase()
  const fallback =
    type === 'flowchart' || type === 'graph'
      ? 'Flowchart'
      : type === 'sequencediagram'
        ? 'Sequence diagram'
        : type === 'classdiagram'
          ? 'Class diagram'
          : 'Diagram'
  return { title: title ?? fallback, description }
}

function addAccessibleMetadata(
  svg: string,
  id: string,
  { title, description }: ReturnType<typeof accessibleMetadata>
): string {
  const titleId = `${id}--title`
  const descriptionId = `${id}--description`
  const labelledBy = description ? `${titleId} ${descriptionId}` : titleId
  const escapeText = (value: string) =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const content = [
    `<title id="${titleId}">${escapeText(title)}</title>`,
    description ? `<desc id="${descriptionId}">${escapeText(description)}</desc>` : '',
  ].join('')
  return svg.replace(
    /<svg\b([^>]*)>/,
    (_match, attributes: string) =>
      `<svg${attributes.replace(/\saria-labelledby="[^"]*"/, '')} aria-labelledby="${labelledBy}">${content}`
  )
}

async function cacheSvg(
  source: string,
  id: string,
  theme: Theme,
  { cacheDir, renderer }: RenderOptions
): Promise<string> {
  const config = themeConfigs[theme]
  const key = digest(JSON.stringify({ source, id, rendererVersion, config }))
  const cachePath = resolve(cacheDir, `${key}.svg`)
  try {
    return await readFile(cachePath, 'utf8')
  } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
  }

  const rawSvg = await renderer.render(id, source, config)
  const svg = addAccessibleMetadata(prefixSvgIds(rawSvg, id), id, accessibleMetadata(source))
  await mkdir(dirname(cachePath), { recursive: true })
  const temporaryPath = `${cachePath}.${process.pid}.tmp`
  await writeFile(temporaryPath, svg)
  await rename(temporaryPath, cachePath)
  return svg
}

type Fence = { marker: string; start: number; end: number; source: string }

function mermaidFences(markdown: string): Fence[] {
  const lines = markdown.match(/^.*(?:\r?\n|$)/gm) ?? []
  const fences: Fence[] = []
  let offset = 0
  let open: { marker: string; start: number; sourceStart: number; mermaid: boolean } | undefined

  for (const line of lines) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)/)
    if (open) {
      const closes =
        match &&
        match[1]![0] === open.marker[0] &&
        match[1]!.length >= open.marker.length &&
        /^[ \t]*\r?\n?$/.test(match[2]!)
      if (closes) {
        if (open.mermaid)
          fences.push({
            marker: open.marker,
            start: open.start,
            end: offset + line.length,
            source: markdown.slice(open.sourceStart, offset).replace(/\r\n/g, '\n'),
          })
        open = undefined
      }
    } else if (match) {
      open = {
        marker: match[1]!,
        start: offset,
        sourceStart: offset + line.length,
        mermaid: /^mermaid(?:[ \t].*)?\r?\n?$/.test(match[2]!),
      }
    }
    offset += line.length
  }
  return fences
}

/** Transform top-level Mermaid fences into two cached, build-time SVG variants. */
export async function renderMermaidFenceSource(
  markdown: string,
  filename: string,
  options: RenderOptions
): Promise<string> {
  const fileKey = relative(options.root, filename).split('\\').join('/')
  const fences = mermaidFences(markdown)
  let cursor = 0
  let output = ''

  for (const [occurrence, fence] of fences.entries()) {
    output += markdown.slice(cursor, fence.start)
    cursor = fence.end
    const diagramBaseId = `mermaid-${digest(`${fileKey}:${occurrence}`).slice(0, 16)}`
    try {
      const [light, dark] = await Promise.all([
        cacheSvg(fence.source, `${diagramBaseId}-light`, 'light', options),
        cacheSvg(fence.source, `${diagramBaseId}-dark`, 'dark', options),
      ])
      output += `<StaticDiagram lightSvg={${JSON.stringify(light)}} darkSvg={${JSON.stringify(dark)}} />`
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Could not render Mermaid fence ${occurrence + 1} in ${fileKey}: ${detail}`, {
        cause: error,
      })
    }
  }
  if (!fences.length) return markdown
  const rendered = output + markdown.slice(cursor)
  const componentImport = "import StaticDiagram from '@components/StaticDiagram.astro'\n"
  const frontmatter = rendered.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
  return frontmatter
    ? `${frontmatter[0]}${componentImport}${rendered.slice(frontmatter[0].length)}`
    : `${componentImport}${rendered}`
}

class PlaywrightMermaidRenderer implements MermaidRenderer {
  private browser: import('playwright').Browser | undefined
  private page: import('playwright').Page | undefined
  private queue = Promise.resolve()

  async render(id: string, source: string, config: (typeof themeConfigs)[Theme]): Promise<string> {
    const job = this.queue.then(async () => {
      const page = await this.getPage()
      return page.evaluate(
        async ({ diagramId, diagramSource, diagramConfig }) => {
          const mermaid = (window as unknown as { mermaid: typeof import('mermaid').default })
            .mermaid
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            ...diagramConfig,
          })
          return (await mermaid.render(diagramId, diagramSource)).svg
        },
        { diagramId: id, diagramSource: source, diagramConfig: config }
      )
    })
    this.queue = job.then(
      () => undefined,
      () => undefined
    )
    return job
  }

  async close(): Promise<void> {
    await this.browser?.close()
    this.page = undefined
    this.browser = undefined
  }

  private async getPage(): Promise<import('playwright').Page> {
    if (this.page) return this.page
    // Build hooks outlive Vite's config module runner; load this Node-only tool directly.
    const { chromium } = require('playwright') as typeof import('playwright')
    this.browser = await chromium.launch({ headless: true })
    this.page = await this.browser.newPage()
    await this.page.route('**/*', (route) => route.abort())
    await this.page.setContent('<!doctype html><html><body></body></html>')
    await this.page.addScriptTag({ path: require.resolve('mermaid/dist/mermaid.min.js') })
    return this.page
  }
}

/** Astro integration: add this before MDX so transformed SVG is parsed as trusted authored HTML. */
export default function staticDiagrams(): AstroIntegration {
  const renderer = new PlaywrightMermaidRenderer()
  return {
    name: 'cade-static-diagrams',
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        const root = fileURLToPath(config.root)
        const vitePlugin: Plugin = {
          name: 'cade-static-diagrams',
          enforce: 'pre',
          async transform(source, id) {
            const filename = id.split('?', 1)[0]!
            if (!/\.mdx?$/.test(filename) || !source.includes('mermaid')) return null
            let code: string
            try {
              code = await renderMermaidFenceSource(source, filename, {
                root,
                cacheDir: resolve(root, '.astro/static-diagrams'),
                renderer,
              })
            } catch (error) {
              await renderer.close()
              throw error
            }
            return code === source ? null : { code, map: null }
          },
        }
        updateConfig({ vite: { plugins: [vitePlugin] } })
      },
      'astro:server:done': () => renderer.close(),
      'astro:build:done': () => renderer.close(),
    },
  }
}
