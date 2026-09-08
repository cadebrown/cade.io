import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import staticDiagrams, { renderMermaidFenceSource } from '../src/integrations/static-diagrams'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  )
})

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'cade-static-diagrams-'))
  temporaryDirectories.push(directory)
  return directory
}

describe('static Mermaid diagrams', () => {
  it('renders deterministic accessible light and dark SVGs without reader-side Mermaid code', async () => {
    const directory = await temporaryDirectory()
    const renderer = {
      render: vi.fn(
        async (id: string) =>
          `<svg id="${id}" viewBox="0 0 1 1"><defs><marker id="arrow" /></defs><path marker-end="url(#arrow)" /></svg>`
      ),
      close: vi.fn(),
    }
    const input = 'Before\n\n```mermaid\nflowchart TD\nA --> B\n```\n\nAfter'
    const options = { root: directory, cacheDir: join(directory, 'cache'), renderer }
    const output = await renderMermaidFenceSource(input, join(directory, 'post.mdx'), options)

    expect(output).toContain("import StaticDiagram from '@components/StaticDiagram.astro'")
    expect(output).toContain('<StaticDiagram lightSvg={')
    expect(output).toContain('aria-labelledby=\\"mermaid-')
    expect(output).toContain('<title id=\\"mermaid-')
    expect(output).toContain('marker-end=\\"url(#mermaid-')
    expect(output).not.toContain('```mermaid')
    expect(renderer.render).toHaveBeenCalledTimes(2)
    expect(await readdir(options.cacheDir)).toHaveLength(2)

    await renderMermaidFenceSource(input, join(directory, 'post.mdx'), options)
    expect(renderer.render).toHaveBeenCalledTimes(2)
  })

  it('gives repeated fences distinct SVG root IDs', async () => {
    const directory = await temporaryDirectory()
    const renderer = {
      render: vi.fn(async (id: string) => `<svg id="${id}"></svg>`),
      close: vi.fn(),
    }
    const output = await renderMermaidFenceSource(
      '```mermaid\nflowchart TD\nA-->B\n```\n\n```mermaid\nflowchart TD\nA-->B\n```',
      join(directory, 'post.mdx'),
      { root: directory, cacheDir: join(directory, 'cache'), renderer }
    )
    const ids = [...output.matchAll(/<svg id=\\"([^\\]+)\\"/g)].map((match) => match[1])
    expect(new Set(ids).size).toBe(4)
  })

  it('treats accessible metadata as text rather than active SVG markup', async () => {
    const directory = await temporaryDirectory()
    const renderer = {
      render: vi.fn(async () => '<svg viewBox="0 0 10 10"></svg>'),
      close: vi.fn(),
    }
    const output = await renderMermaidFenceSource(
      '```mermaid\nflowchart TD\naccTitle: A & B < C\naccDescr: </desc><script>unsafe()</script>\nA-->B\n```',
      join(directory, 'post.mdx'),
      { root: directory, cacheDir: join(directory, 'cache'), renderer }
    )
    expect(output).toContain('A &amp; B &lt; C')
    expect(output).toContain('&lt;script&gt;unsafe()&lt;/script&gt;')
    expect(output).not.toContain('<script>')
  })

  it('does not transform Mermaid syntax shown inside an enclosing code example', async () => {
    const directory = await temporaryDirectory()
    const renderer = { render: vi.fn(), close: vi.fn() }
    const input = '````mdx\n```mermaid\nflowchart TD\nA-->B\n```\n````\n'
    await expect(
      renderMermaidFenceSource(input, join(directory, 'post.mdx'), {
        root: directory,
        cacheDir: join(directory, 'cache'),
        renderer,
      })
    ).resolves.toBe(input)
    expect(renderer.render).not.toHaveBeenCalled()
  })

  it('uses local Chromium to render a real SVG without browser network access', async () => {
    const directory = await temporaryDirectory()
    const integration = staticDiagrams()
    let vitePlugin: { transform?: (source: string, id: string) => Promise<unknown> } | undefined
    await integration.hooks['astro:config:setup']?.({
      config: { root: pathToFileURL(`${directory}/`) },
      updateConfig: (change: { vite?: { plugins?: unknown[] } }) => {
        vitePlugin = change.vite?.plugins?.[0] as typeof vitePlugin
        return {} as never
      },
    } as never)
    const result = await vitePlugin?.transform?.(
      '```mermaid\nflowchart TD\nA --> B\n```',
      join(directory, 'post.mdx')
    )
    await integration.hooks['astro:build:done']?.({} as never)

    expect(result).toMatchObject({ code: expect.stringContaining('<StaticDiagram') })
  })
})
