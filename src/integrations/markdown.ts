import katex from 'katex'
import { relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { postRoot, resolvePostLink } from '../lib/post-files.ts'
import {
  htmlToHast,
  type HastNode,
  type MdastNode,
  type HastPluginDefinition,
  type MdastPluginDefinition,
  type PluginFactoryContext,
  type MdxJsxFlowElement,
  type MdxJsxTextElement,
  type MdastVisitorContext,
} from 'satteri'
import { katexConfig } from '../katex.ts'

type FenceMetadata = { value: string; lang?: string | null; meta?: string | null }

/** Satteri 0.10 rawHtml reparsing drops HAST data; keep fence metadata per document. */
export function preserveCodeMetadata(): MdastPluginDefinition {
  return {
    name: 'cade-preserve-code-metadata',
    code(node, ctx) {
      const fences = (ctx.data.cadeCodeFences ??= []) as FenceMetadata[]
      fences.push({ value: node.value, lang: node.lang, meta: node.meta })
    },
  }
}

/** Match surviving code blocks to their source, preserving repeated fences in order. */
export function restoreCodeMetadata(): HastPluginDefinition {
  return {
    name: 'cade-restore-code-metadata',
    element: {
      filter: ['pre'],
      visit(node, ctx) {
        const code = node.children[0]
        if (code?.type !== 'element' || code.tagName !== 'code') return
        const fences = (ctx.data.cadeCodeFences ?? []) as FenceMetadata[]
        const value = ctx.textContent(code).replace(/\n$/, '')
        const classes = code.properties.className
        const language = (Array.isArray(classes) ? classes : String(classes ?? '').split(' '))
          .find((name) => String(name).startsWith('language-'))
          ?.toString()
          .slice(9)
        const index = fences.findIndex(
          (fence) => fence.value === value && (fence.lang || undefined) === language
        )
        if (index < 0) return
        const [fence] = fences.splice(index, 1)
        ctx.replaceNode(code, {
          ...code,
          data: { ...code.data, lang: fence!.lang, meta: fence!.meta },
        })
      },
    },
  }
}

/** Mark math before highlighting; preserve the distinction between inline and block math. */
export function mathNodes(): MdastPluginDefinition {
  return {
    name: 'cade-math-nodes',
    inlineMath(node, ctx) {
      ctx.setProperty(node, 'data', { hName: 'span', hProperties: { 'data-math': 'inline' } })
    },
    math(node, ctx) {
      ctx.setProperty(node, 'data', { hName: 'div', hProperties: { 'data-math': 'display' } })
    },
  }
}

/** Keep native tables inside one keyboard-accessible, centered overflow container. */
export function tableAccessibility(): HastPluginDefinition {
  return {
    name: 'cade-table-accessibility',
    element: {
      filter: ['table'],
      visit(node, ctx) {
        let ancestor: Readonly<HastNode> | undefined = ctx.parent(node)
        while (ancestor) {
          if (ancestor.type === 'element') {
            const classes = String(ancestor.properties.className ?? '').split(/[ ,]+/)
            if (
              classes.some((name) => ['table-frame', 'table-scroll', 'table-wrap'].includes(name))
            )
              return
          }
          if (ancestor.type === 'mdxJsxFlowElement' && ancestor.name === 'Table') return
          ancestor = ctx.parent(ancestor)
        }
        const header = node.children.find(
          (child) => child.type === 'element' && child.tagName === 'thead'
        )
        const caption = node.children.find(
          (child) => child.type === 'element' && child.tagName === 'caption'
        )
        const label = caption
          ? ctx.textContent(caption)
          : header && 'children' in header
            ? header.children
                .flatMap((row) =>
                  'children' in row
                    ? row.children
                        .filter((cell) => cell.type === 'element')
                        .map((cell) => ctx.textContent(cell).trim())
                    : []
                )
                .join(', ')
            : 'Data table'
        const properties = { ...node.properties }
        delete properties.tabIndex
        ctx.replaceNode(node, {
          type: 'element',
          tagName: 'div',
          properties: { className: ['table-frame'], 'data-width': 'compact' },
          children: [
            {
              type: 'element',
              tagName: 'div',
              properties: {
                className: ['table-scroll'],
                tabIndex: 0,
                role: 'region',
                ariaLabel: label.trim() || 'Data table',
                ariaDescription: 'Scroll horizontally when the table is wider than this area.',
              },
              children: [{ ...node, properties }],
            },
          ],
        })
      },
    },
  }
}

/** Each document gets its own macro table; global TeX definitions stay within that document. */
export function mathRendering(): HastPluginDefinition {
  const options: katex.KatexOptions = {
    ...katexConfig,
    output: 'htmlAndMathml',
    strict: 'warn',
    macros: { ...katexConfig.macros },
  }
  return {
    name: 'cade-math-rendering',
    element: {
      filter: ['span', 'div'],
      visit(node, ctx) {
        const mode = node.properties['data-math'] ?? node.properties.dataMath
        if (mode !== 'inline' && mode !== 'display') return
        const html = katex.renderToString(ctx.textContent(node), {
          ...options,
          displayMode: mode === 'display',
        })
        const tree = htmlToHast(html, { fragment: true })
        // Satteri's HTML parser prefixes the default MathML namespace with a colon.
        // Normalize that attribute before MDX turns the tree into JSX.
        function normalizeMathMarkup(child: HastNode): void {
          if (
            child.type === 'element' &&
            Array.isArray(child.properties.className) &&
            child.properties.className.includes('katex-display')
          ) {
            // Wide equations scroll horizontally; keyboard readers need the same access.
            child.properties.tabIndex = 0
          }
          if (child.type === 'element' && ':xmlns' in child.properties) {
            child.properties.xmlns = String(child.properties[':xmlns'])
            delete child.properties[':xmlns']
          }
          if (
            child.type === 'element' &&
            child.tagName === 'path' &&
            typeof child.properties.d === 'string'
          ) {
            // KaTeX 0.18.7 tall floor delimiters contain a duplicate SVG moveto.
            // https://github.com/KaTeX/KaTeX/blob/main/src/svgGeometry.ts (lfloor/rfloor)
            child.properties.d = child.properties.d.replaceAll(
              'MM319 602 V0 H403 V602 v',
              'M319 602 V0 H403 V602 v'
            )
          }
          if ('children' in child) child.children.forEach(normalizeMathMarkup)
        }
        normalizeMathMarkup(tree)
        if (tree.type !== 'root') throw new Error('Expected a KaTeX HTML fragment')
        ctx.replaceNode(node, tree.children)
      },
    },
  }
}

/** Caption standalone Markdown images without wrapping images embedded in prose. */
export function imageFigures(): HastPluginDefinition {
  return {
    name: 'cade-image-figures',
    element: {
      filter: ['p'],
      visit(node, ctx) {
        const children = node.children.filter(
          (child) => child.type !== 'text' || child.value.trim()
        )
        if (
          !children.length ||
          !children.every((child) => child.type === 'element' && child.tagName === 'img')
        )
          return
        ctx.replaceNode(
          node,
          children.map((child) => {
            if (child.type !== 'element' || !child.properties.alt) return child
            return {
              type: 'element' as const,
              tagName: 'figure',
              properties: {},
              children: [
                child,
                {
                  type: 'element' as const,
                  tagName: 'figcaption',
                  properties: {},
                  children: [{ type: 'text' as const, value: String(child.properties.alt) }],
                },
              ],
            }
          })
        )
      },
    },
  }
}

/** Astro supplies the heading IDs; this only adds the site's permalink affordance. */
export function headingLinks(): HastPluginDefinition {
  return {
    name: 'cade-heading-links',
    element: {
      filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      visit(node, ctx) {
        const id = node.properties.id
        if (typeof id !== 'string') return
        const headingText = (child: HastNode): string => {
          if (child.type === 'text') return child.value
          if (child.type === 'element' && child.tagName === 'img')
            return String(child.properties.alt ?? '')
          return 'children' in child ? child.children.map(headingText).join('') : ''
        }
        const label = headingText(node).trim() || id
        ctx.appendChild(node, {
          type: 'element',
          tagName: 'a',
          properties: {
            href: `#${id}`,
            className: ['autolink-headings', 'autolink-headings-link'],
            ariaLabel: `Link to section: ${label}`,
          },
          children: [
            {
              type: 'element',
              tagName: 'svg',
              properties: {
                className: ['autolink-headings', 'autolink-headings-icon'],
                ariaHidden: 'true',
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: '2',
              },
              children: [
                {
                  type: 'element',
                  tagName: 'path',
                  properties: {
                    d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
                  },
                  children: [],
                },
              ],
            },
          ],
        })
      },
    },
  }
}

/** Source-relative links must resolve under the article, even on slashless URLs. */
export function postLinks({ fileURL }: PluginFactoryContext): MdastPluginDefinition | undefined {
  if (!fileURL) return
  const local = relative(postRoot, fileURLToPath(fileURL)).split(sep).join('/')
  if (!/^[^/]+\/index\.mdx?$/.test(local)) return
  const id = local.split('/')[0]!
  const definitions = new Map<string, { url: string; title?: string | null }>()
  function jsxLinks(
    node: Readonly<MdxJsxFlowElement | MdxJsxTextElement>,
    ctx: MdastVisitorContext
  ) {
    ctx.replaceNode(node, {
      ...node,
      attributes: node.attributes.map((attribute) => {
        if (
          attribute.type !== 'mdxJsxAttribute' ||
          (attribute.name !== 'href' && attribute.name !== 'src') ||
          typeof attribute.value !== 'string'
        )
          return attribute
        return { ...attribute, value: resolvePostLink(id, attribute.value) }
      }),
    })
  }
  return {
    name: 'cade-post-links',
    before(root, ctx) {
      const images: Extract<MdastNode, { type: 'imageReference' }>[] = []
      function collect(node: Readonly<MdastNode>): void {
        // Identifiers are normalized by the parser; CommonMark keeps the first definition.
        if (node.type === 'definition' && !definitions.has(node.identifier))
          definitions.set(node.identifier, node)
        if (node.type === 'imageReference') images.push(node)
        if ('children' in node) node.children.forEach(collect)
      }
      collect(root)
      // Resolve images before visiting link references, including images nested in links.
      // Astro's following image-collection pass can then import these local sources.
      for (const image of images) {
        const definition = definitions.get(image.identifier)
        if (definition)
          ctx.replaceNode(image, {
            type: 'image',
            url: definition.url,
            title: definition.title,
            alt: image.alt,
            position: image.position,
            data: image.data,
          })
      }
    },
    linkReference(node, ctx) {
      const definition = definitions.get(node.identifier)
      if (definition)
        ctx.replaceNode(node, {
          type: 'link',
          url: resolvePostLink(id, definition.url),
          title: definition.title,
          children: node.children,
          position: node.position,
          data: node.data,
        })
    },
    link(node, ctx) {
      ctx.setProperty(node, 'url', resolvePostLink(id, node.url))
    },
    mdxJsxFlowElement: jsxLinks,
    mdxJsxTextElement: jsxLinks,
  }
}
