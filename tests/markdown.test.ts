import { describe, expect, it } from 'vitest'
import { markdownToHtml, mdxToJs, type CompileOptions } from 'satteri'
import { satteriHeadingIdsPlugin, satteriCollectImagesPlugin } from '@astrojs/markdown-satteri'
import {
  preserveCodeMetadata,
  restoreCodeMetadata,
  mathNodes,
  mathRendering,
  tableAccessibility,
  imageFigures,
  headingLinks,
  postLinks,
} from '../src/integrations/markdown'

function options(): CompileOptions {
  return {
    fileURL: new URL('../content/posts/magma-paper/index.mdx', import.meta.url),
    features: {
      math: true,
      definitionList: true,
      gfm: { footnotes: { label: 'References', clobberPrefix: '' } },
    },
    mdastPlugins: [mathNodes, postLinks],
    hastPlugins: [
      mathRendering,
      tableAccessibility,
      imageFigures,
      satteriHeadingIdsPlugin,
      headingLinks,
    ],
  }
}

async function render(source: string) {
  return (await markdownToHtml(source, options())).html
}

describe('native Markdown publishing', () => {
  it('preserves fence language and title through raw HTML parsing', async () => {
    const seen: unknown[] = []
    const source = '```ts title="example.ts" {1}\nconst value = 1\n```'
    const html = await markdownToHtml(source, {
      features: { rawHtml: true },
      mdastPlugins: [preserveCodeMetadata],
      hastPlugins: [
        restoreCodeMetadata,
        {
          name: 'inspect-renderer-input',
          element: {
            filter: ['code'],
            visit(node) {
              seen.push(node.data)
            },
          },
        },
      ],
    })
    expect(seen).toEqual([{ lang: 'ts', meta: 'title="example.ts" {1}' }])
    expect(html.html).not.toContain('data-cade-code')
  })

  it('keeps inline math inside its paragraph and emits valid MathML', async () => {
    const html = await render('Before $x^2$ after.')
    expect(html.match(/<p>/g)).toHaveLength(1)
    expect(html).toMatch(/^<p>Before <span class="katex">/)
    expect(html).toContain(' after.</p>')
    expect(html).toContain('xmlns="http://www.w3.org/1998/Math/MathML"')
    expect(html).not.toContain(':xmlns')
  })

  it('renders display math without a code block or paragraph wrapper', async () => {
    const html = await render('$$\nx^2\n$$')
    expect(html).toMatch(/^<span class="katex-display" tabindex="0">/)
    expect(html).not.toMatch(/<(?:pre|code|p)>/)
  })

  it('makes Markdown tables keyboard-scrollable without replacing their table semantics', async () => {
    const html = await render('| Column |\n| --- |\n| Value |')
    expect(html).toContain('class="table-scroll" tabindex="0" role="region"')
    expect(html).toContain('aria-label="Column"')
    expect(html).toContain('<table>')
    expect(html).not.toContain('<table tabindex=')
    expect(html).toContain('<th>Column</th>')
    expect(html).toContain('<td>Value</td>')
  })

  it('preserves column alignment and uses a single wrapper for an already managed table', async () => {
    const html = await render('| Label | Value |\n| :--- | ---: |\n| Sample | 123 |')
    expect(html).toContain('style="text-align: right"')
    expect(html.match(/class="table-scroll"/g)).toHaveLength(1)
    const managed = await markdownToHtml(
      '<div class="table-scroll"><table><caption>Results</caption><tr><th scope="col">Value</th></tr><tr><td>123</td></tr></table></div>',
      {
        ...options(),
        features: { rawHtml: true },
      }
    )
    expect(managed.html.match(/class="table-scroll"/g)).toHaveLength(1)
    expect(managed.html).toContain('<caption>Results</caption>')
    expect(managed.html).toContain('scope="col"')
  })

  it('renders tall floor delimiters with valid SVG moveto commands', async () => {
    const html = await render(
      '$$\n\\left\\lfloor \\dfrac{\\dfrac{1}{2}}{\\dfrac{3}{4}} \\right\\rfloor\n$$'
    )
    expect(html).toContain('M319 602 V0 H403 V602 v')
    expect(html).not.toContain('MM319')
  })

  it('shares TeX macros within a document and isolates them between documents', async () => {
    const html = await render('$\\gdef\\localmacro{a}$ then $\\localmacro$')
    expect(html).toContain('>a</mi>')
    await expect(render('$\\localmacro$')).rejects.toThrow('Undefined control sequence')
  })

  it('rejects invalid math instead of silently publishing a rendering error', async () => {
    await expect(render('$\\[1, 1\\]$')).rejects.toThrow('Undefined control sequence')
  })

  it('resolves links against the article while preserving local image imports', async () => {
    const html = await render('[Paper](./paper.pdf#page=2)\n\n![Caption](./photo.webp)')
    expect(html).toContain('href="/posts/magma-paper/paper.pdf#page=2"')
    expect(html).toContain(
      '<figure><img src="./photo.webp" alt="Caption"><figcaption>Caption</figcaption></figure>'
    )
  })

  it('makes reference images discoverable to Astro without changing their local source', async () => {
    const localImagePaths = new Set<string>()
    const result = await markdownToHtml('![Caption][figure]\n\n[figure]: ./photo.webp "Original"', {
      ...options(),
      data: {
        astro: {
          frontmatter: {},
          headings: [],
          localImagePaths,
          remoteImagePaths: new Set<string>(),
        },
      },
      mdastPlugins: [postLinks, satteriCollectImagesPlugin()],
    })
    expect(result.html).toContain('src="./photo.webp"')
    expect(result.html).toContain('title="Original"')
    expect(localImagePaths.has('./photo.webp')).toBe(true)
  })

  it('resolves one reference definition differently for display images and download links', async () => {
    const html = await render('![Preview][ASSET]\n\n[Download][asset]\n\n[asset]: ./photo.webp')
    expect(html).toContain('src="./photo.webp"')
    expect(html).toContain('href="/posts/magma-paper/photo.webp"')
  })

  it('handles a reference image nested inside a reference link and keeps the first definition', async () => {
    const html = await render(
      '[![Preview][asset]][asset]\n\n[asset]: ./first.webp "First"\n[asset]: ./second.webp "Second"'
    )
    expect(html).toContain(
      '<a href="/posts/magma-paper/first.webp" title="First"><img src="./first.webp" alt="Preview" title="First"></a>'
    )
    expect(html).not.toContain('second.webp')
  })

  it('leaves inline images within prose', async () => {
    const html = await render('A small ![icon](./photo.webp) in prose.')
    expect(html).toMatch(/^<p>A small <img/)
    expect(html).not.toContain('<figure>')
  })

  it('rewrites MDX literal links without interpreting expression attributes', async () => {
    const { code } = await mdxToJs(
      '<a href="./paper.pdf">Paper</a>\n\n<img src="./photo.webp" />\n\n<a href={target}>Dynamic</a>',
      options()
    )
    expect(code).toContain('/posts/magma-paper/paper.pdf')
    expect(code).toContain('/posts/magma-paper/photo.webp')
    expect(code).toMatch(/href:\s*target/)
  })

  it('adds permalinks using Astro heading IDs, including repeated headings', async () => {
    const html = await render('## Title\n\n## Title')
    expect(html).toContain('id="title"')
    expect(html).toContain('href="#title"')
    expect(html).toContain('id="title-1"')
    expect(html).toContain('href="#title-1"')
    expect(html).toContain('aria-label="Link to section: Title"')
    expect(html).not.toContain('tabindex="-1"')
    expect(html).not.toMatch(/<a[^>]*aria-hidden/)
    const formatted = await render('## A **formatted** title')
    expect(formatted).toContain('aria-label="Link to section: A formatted title"')
  })

  it('renders native definition lists and named footnotes', async () => {
    const html = await render('Term\n: Definition\n\nClaim[^source].\n\n[^source]: Evidence')
    expect(html).toContain('<dt>Term</dt>')
    expect(html).toContain('<dd>Definition</dd>')
    expect(html).toContain('References')
    expect(html).toContain('href="#fn-source"')
  })
})
