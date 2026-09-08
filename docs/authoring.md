# Authoring articles and downloadable material

A post folder is the authoring unit and the downloadable package. Start flat;
introduce a subfolder only when the material benefits from one.

## Start here

The repository uses Astro 7 and MDX with the native Satteri processor. Exact
installed versions are recorded in `package-lock.json`; shared code rendering
is configured in [`ec.config.mjs`](../ec.config.mjs).

- [Agent instructions](../AGENTS.md): conventions for assistants working here.
- [Live examples](../src/pages/test.mdx): open `/test` on your development server.
- [Pikurn](../content/posts/game-pikurn/index.mdx): math, diagrams, interactive
  components, and a complete source listing imported from a runnable file.
- [Magma paper](../content/posts/magma-paper/index.mdx): colocated paper downloads.

Keep examples and these instructions current when a component API changes.

## Create a post

Create `content/posts/your-stable-slug/index.mdx` and place its cover image beside
it. Slugs use lowercase words/numbers separated by hyphens. A minimal article is:

```mdx
---
draft: true
dated: '2026-09-08'
title: 'A descriptive article title'
blurb: 'One sentence explaining what the reader will find.'
image: ./descriptive-cover.webp
---

Write the article here.

![Describe what the figure shows.](./descriptive-figure.svg)

[Download the results](./experiment-results-v1.csv)
```

The loader reads only `*/index.md` and `*/index.mdx`, so supporting README files
and notes are not accidentally treated as articles. Use one entry file per post.

`npm run dev` includes drafts at `/posts/your-stable-slug`. Remove `draft: true` or
set it to `false` when ready for production. Production page, listing, author,
RSS, and post-file generation share the publication rule. Keeping the repository
open does not turn a draft into a published website article.

## Frontmatter

| Field | Meaning |
| --- | --- |
| `title`, `blurb` | Required article title and short description |
| `dated` | Required publication date; quote ISO dates in YAML |
| `image` | Required local cover image, resolved by Astro |
| `draft` | Optional; defaults to `false` |
| `authors` | Optional author ID list; defaults to `['cade-brown']` |
| `files` | Optional per-file labels, descriptions, and download exclusions |
| `tags` | Optional string list, stored for future categorization |
| `updated` | Optional update date, stored as content metadata |
| `repository` | Optional project URL, stored as content metadata |

The last three fields are available in the schema; adding them does not
currently create tag routes or a new metadata panel. Author records live in
`content/authors/<id>.json`, with their portraits alongside them. Authors in
frontmatter are plain IDs; Astro resolves them to collection references.

## Filenames and original downloads

Choose filenames that make sense after saving them to another computer:

```text
content/posts/magma-paper/
  index.mdx
  magma-paper.webp
  dense-linear-algebra-amd-gpus-hpec-2020.pdf
```

The resulting addresses are:

| Resource | Address / saved filename |
| --- | --- |
| Article | `/posts/magma-paper` |
| Original cover | `/posts/magma-paper/magma-paper.webp` |
| Paper | `/posts/magma-paper/dense-linear-algebra-amd-gpus-hpec-2020.pdf` |
| Article source | `/posts/magma-paper/magma-paper.mdx` |
| Complete package | `/posts/magma-paper/magma-paper-files.zip` |

The original source filename determines the download filename; there is no separate
rename manifest. The entry file receives the article slug in place of `index`.
Files retain their original bytes, and ZIP entries use the download names. A nested `examples/benchmark.py`, if useful, remains at
`/posts/<slug>/examples/benchmark.py` and keeps that path inside the ZIP.

The page's **Files & source** section is generated from the same inventory as the
static file endpoints. It provides file sizes, explicit download actions, a ZIP,
and a link to the article's GitHub folder. PDF and image URLs can also be opened
inline; the file-list download action saves the descriptive filename. Source and
ZIP HTTP download headers are generated for the production host.

HTML supporting files have one deliberate URL exception: `demo.html` is served
at `/posts/<slug>/demo.html.txt` as plain text, and `demo.htm` uses `demo.htm.txt`.
The saved file and ZIP entry remain `demo.html` or `demo.htm`, with unchanged
bytes. This avoids Cloudflare treating a supporting HTML file as a page and
normalizing its URL into a collision with the article or another resource.
`index.html` is therefore a valid supporting source file at `index.html.txt`.
The relative link `[Source](./demo.html)` receives the safe URL automatically.
These endpoints share downloadable HTML source; a live hosted demo belongs in
an explicit page route.

Use lowercase kebab-case for new filenames. The publisher accepts ASCII letters,
digits, underscores, dots, and hyphens in path segments. It rejects ambiguous or
unsafe paths, symlinks, percent-encoded filenames, case-folded output collisions,
and collisions with generated source/archive/page names. Do not add a file named `<slug>-files.zip`; the generated article source
also claims `<slug>.mdx` (or `<slug>.md`). A supporting `demo.html` and a separate
`demo.html.txt` would claim the same output URL and fail the build.

## Optional labels and exclusions

Ordinary files need no metadata. Add entries only when they improve the list or
exclude an exceptional file from the download package:

```yaml
files:
  experiment-results-v1.csv:
    label: 'Experiment results — version 1'
    description: 'Raw measurements before aggregation.'
  working-notes.txt:
    exclude: true
```

Metadata keys are source-relative filenames, including subfolders where used.
A missing key target fails the build rather than silently ignoring a typo.
Excluding a directory excludes its subtree. Avoid redundant metadata for files
inside an excluded directory.

Hidden files/directories, `.DS_Store`, `node_modules`, `__pycache__`, `Thumbs.db`,
`desktop.ini`, and editor backup names ending in `~` are automatically omitted.
`exclude` controls this download inventory; it does not remove a file from Git or
prevent an explicit import from contributing to a rendered bundle.

## Images, figures, and galleries

Use relative Markdown image references for ordinary figures. Astro imports and
optimizes those images; their original files also appear in the download list.
Standalone images receive figure captions from their alt text.

For separate alt text, caption, and an original link, use `Figure`:

```mdx
import Figure from '@components/Figure.astro'
import benchmarkFigure from './amd-gpu-benchmarks.svg'

<Figure
  src={benchmarkFigure}
  alt='Time to solution falls as the matrix size increases.'
  caption='Measured solver timings for the configurations described above.'
  original='/posts/magma-paper/amd-gpu-benchmarks.svg'
/>
```

For an individual gallery entry, supply descriptive alt text and an original URL:

```mdx
import Gallery from '@components/Gallery.astro'
import landscape from './mountain-landscape.webp'

<Gallery images={[
  {
    src: landscape,
    alt: 'Layered blue mountain silhouettes beneath a pale sky.',
    caption: 'A landscape study.',
    original: '/posts/landscape-studies/mountain-landscape.webp',
  },
]} />
```

For a collection, keep the literal glob in the article and let the gallery helper
sort filenames numerically and derive original URLs:

```mdx
import { galleryImages } from '../../../src/lib/gallery'

export const images = galleryImages(
  import.meta.glob('./landscape-*.webp', { eager: true, import: 'default' }),
  {
    post: 'landscape-studies',
    label: 'Landscape study',
    descriptions: {
      'landscape-1.webp': { alt: 'Blue mountain silhouettes.', caption: 'First study.' },
    },
  },
)

<Gallery images={images} />
```

The optimized display URL may be hashed under `/_astro/`. Link people to the clean
original address when sharing a downloadable file. Use imported image metadata
for optimization; passing a plain URL string to the site's `Image` component
renders a normal image element. `Image` and `Figure` preserve natural dimensions
and responsive aspect ratio by default. Supply `width`, `height`, and an explicit
`fit` only when the design calls for an intentional crop; use `priority` only for
above-the-fold content. See the image examples on [`/test`](../src/pages/test.mdx).

Widget and performance work must retain the surrounding page design: do not
change site-wide typography, palette, homepage content, or layout arrangement
without an explicit request. The established blackboard/whiteboard themes and
system-monospace typography are the article default.

### Optional image interactions

The [widget previews](/test#widget-previews) show current and proposed behavior
using the same images. These components are opt-in; existing figures and the
default gallery are unchanged.

- `ZoomFigure` from `@components/ZoomFigure.astro` accepts imported `src`, required
  `alt`, optional `caption`, `sizes`, and an `original` URL. It uses `Figure` for
  the inline image. A native dialog fetches a larger optimized image on first
  open; Escape and Close return focus and preserve reading position. Without
  JavaScript, the image and enlargement link open the optimized file directly.
  Supply `original` for the descriptive full-resolution download address.
- `ImageCompare` from `@components/ImageCompare.astro` accepts imported `before`
  and `after` images, required `beforeAlt`/`afterAlt`, optional `beforeLabel`,
  `afterLabel`, `caption`, and `initialPercent` (default 50). Inputs must have the
  same aspect ratio. A native range or pointer drag reveals aligned layers;
  without JavaScript, two complete images share the same reserved frame. The
  frame and control-row geometry remain stable when the script loads late.
- `<Gallery images={images} layout='rows' />` gives imported images widths
  proportional to their aspect ratios. It wraps naturally, stacks on narrow
  screens, and needs no JavaScript. Rows require imported metadata; plain URL
  strings remain supported by the default `grid` layout.

The comparison fixtures are numerical Mandelbrot renders from the site's pure
model, generated by `node scripts/generate-image-examples.mjs`. The same region
and pixel grid use escape limits 40 and 320; the palette also depends on that
limit. They demonstrate a comparison control, not a proof of set membership.

These patterns use [Astro's image pipeline](https://docs.astro.build/en/guides/images/)
and the [native dialog element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

## Links, math, diagrams, and code

Relative Markdown links and literal MDX `href`/`src` values are resolved under the
article during compilation. Thus `[Paper](./paper.pdf#page=2)` works on a slashless
article URL. Markdown images remain local for Astro's image pipeline. Expressions
such as `href={someValue}` are authored code: provide an absolute site path or an
imported URL there. Cross-article links should use `/posts/<slug>` explicitly.

Use `$…$` for inline math, `$$…$$` for display math, ordinary Markdown footnotes,
and fenced code blocks for examples. The native processor supports definition
lists and directives; a directive still needs corresponding rendering semantics
to become a custom visual component. Top-level Mermaid fences render to cached
light/dark static SVG at build time, rather than loading Mermaid for readers. The
first cold build needs Playwright Chromium; unchanged diagrams reuse the local
`.astro/static-diagrams` cache.

### Code blocks

Use a fenced block with a language for a short example. Expressive Code supplies
highlighting, line numbers, wrapping, copy controls, and the site's two themes:

````mdx
```ts title="expected-value.ts"
const outcomes = [400, 200, 100]
const average = outcomes.reduce((sum, value) => sum + value, 0) / outcomes.length
```
````

For a complete program or an excerpt stored in a file, import the source and use
the integration's component. This renders through the same configuration as fences:

```mdx
import { Code } from 'astro-expressive-code/components'
import solverSource from './pikurn.ts?raw'

<Code code={solverSource} lang='ts' title='pikurn.ts' />
```

Do not copy a runnable file into a fence: the listing and download would drift.
Do not use `Code` from `astro:components` for site articles; that invokes Astro's
separate renderer and bypasses our Expressive Code configuration. No custom
`<pre>` markup or article-specific syntax styles are needed. A native
`<details><summary>…</summary>…</details>` can hold a long listing or proof.

The current Satteri raw-HTML pass (required by the Mermaid integration) discards
fence language/title metadata. The paired `preserveCodeMetadata` and
`restoreCodeMetadata` native plugins in
[`markdown.ts`](../src/integrations/markdown.ts) preserve it for Expressive Code.
The regression in [`markdown.test.ts`](../tests/markdown.test.ts) and the `/test`
browser check cover this boundary. Recheck upstream behavior when upgrading;
remove the pair together once native metadata survives without them.

Escape literal currency dollars in prose as `\$100`; unescaped pairs can become
inline math. Use KaTeX equations for notation, Mermaid for small relationship or
game-tree diagrams, and labeled SVG for plots with exact geometric meaning. For
static data graphics, use an Astro component that emits an accessible SVG, caption,
and table from one data source; [`docs/visualizations.md`](visualizations.md)
contains the contract and `/test` has a build-time Observable Plot example.

Runnable supporting code belongs beside its article. Link to the actual file,
and import it where the page needs its contents, instead of maintaining an
independent downloadable copy. The Pikurn article imports its solver from
`content/posts/game-pikurn/pikurn.ts` both for its interactive lab and its full
source listing (using a `?raw` import). Post-local components own the controls
and SVG/HTML visualizations. The solver runs independently with Node 24.2+.

For an independent interactive explorer, use a Svelte component with meaningful
SSR output and `client:visible`; keep the pure model and downloads beside the
article unless they are reused. Avoid an empty chart shell or a general chart
runtime without a measured need.

## Component reference

### Centered tables and readable charts

Markdown tables automatically receive a centered, compact container. The native
table keeps its semantics; only its wrapper scrolls on narrow screens. Use
Markdown's `---:` alignment for numeric columns and `:---` for descriptions.

For authored HTML tables, import `Table` and choose `width='compact'` (the default)
or `width='wide'`. Wide tables fill the article container; compact tables fit their
content. Use real `th` headers with `scope` and the `numeric` class for numeric cells:

```mdx
import Table from '@components/Table.astro'

<Table label='Experiment results' width='wide'>
  <table>
    <thead><tr><th scope='col'>Method</th><th scope='col' className='numeric'>Samples</th></tr></thead>
    <tbody><tr><th scope='row'>Baseline</th><td className='numeric'>240</td></tr></tbody>
  </table>
</Table>
```

Long results can opt into `maxHeight='20rem'`, which keeps the header visible
while scrolling. Ordinary article tables should stay in the page's vertical flow.
Do not add `overflow` or `display: block` to the table itself. Existing explicit
table wrappers are not wrapped again by the Markdown integration.

Mermaid diagrams retain their natural drawing dimensions, are centered when they
fit, and scroll horizontally when they do not. Their dimensions are reserved in
the initial HTML. Prefer a vertical diagram for a long process when that better
serves phone readers. Do not squeeze a dense diagram until its text becomes tiny.

`StaticPlot` emits narrow and wide SVGs from the same data, switching with a CSS
container query. Captions, data tables, and downloads remain single instances.
Pass a unique `identifier` for every plot on a page. Paired Pikurn charts use named
container queries, capped drawing sizes, and aligned caption areas.

See [`/test#layout-examples`](../src/pages/test.mdx) for the table comparison,
wide and bounded tables, a scrollable diagram, a responsive chart, and paired
figures. These layouts require no additional client JavaScript. Check them in
both themes and at widths on either side of their stacking breakpoints.

| Need | Supported component or syntax | Example / implementation |
| --- | --- | --- |
| Prose, lists, tables, math | Markdown and KaTeX | [Test page](../src/pages/test.mdx) |
| Short code example | Language-tagged fence | [Test page code snippets](../src/pages/test.mdx) |
| Existing source listing | Expressive Code `Code` + `?raw` | [Pikurn article](../content/posts/game-pikurn/index.mdx) |
| Ordinary image | Relative Markdown image | Automatic optimization and caption |
| Distinct alt text/caption/download | `Figure` | [Figure.astro](../src/components/Figure.astro) |
| Image collection | `Gallery` + `galleryImages` | [Gallery.astro](../src/components/Gallery.astro), [helper](../src/lib/gallery.ts) |
| Relationship diagram | `mermaid` fence, built to static SVG | [Pikurn game tree](../content/posts/game-pikurn/index.mdx) |
| Exact static plot | Accessible SVG in an Astro component | [DecisionGeometry.astro](../content/posts/game-pikurn/DecisionGeometry.astro) |
| Static data plot | Build-time Observable Plot plus a table/download | [Visualization examples](../src/components/visualizations/VisualizationExamples.astro) |
| Interactive mathematical model | Post-local component + typed model; Svelte `client:visible` when appropriate | [Visualization examples](../src/components/visualizations/VisualizationExamples.astro) |
| Downloads and ZIP | Automatic post-file inventory | [PostFiles.astro](../src/components/PostFiles.astro) |

Check component prop types before reusing them; the examples above are patterns,
not a separate API definition. For an interactive chart, keep calculation logic
separate from rendering, label units and assumptions, and validate the model.

## Official documentation

Verified while updating this guide on 2026-09-08. These are upstream references;
the local configuration and component APIs determine what this site enables.

- [Astro Markdown](https://docs.astro.build/en/guides/markdown-content/) and
  [MDX components](https://docs.astro.build/en/guides/integrations-guide/mdx/).
- [Astro images](https://docs.astro.build/en/guides/images/).
- [Svelte integration](https://docs.astro.build/en/guides/integrations-guide/svelte/).
- [Expressive Code's component and file imports](https://expressive-code.com/key-features/code-component/)
  and [shared configuration](https://expressive-code.com/reference/configuration/).
- [KaTeX supported notation](https://katex.org/docs/supported.html).
- [Mermaid flowchart syntax](https://mermaid.js.org/syntax/flowchart.html).
- [Observable Plot](https://observablehq.com/plot/).

## Shared assets and stable URLs

Material belonging to one article stays with that article. Shared portraits,
branding, music artwork, fonts, and site-wide PDFs live under `src/assets/`.
Add a shared original under `src/assets/`; it is discovered automatically at
`/assets/<relative-path>`. Components can import that same source.
`src/data/shared-assets.json` contains only `urls` overrides for exceptional public
addresses (currently the root CV and résumé) and `aliases` mapping old URLs to
canonical ones. There is
no manually synchronized second copy under `public/`.

Keep `public/` for files that browsers or hosting expect at fixed root addresses:
favicons, touch/app icons, the manifest, and `CNAME`. The editable favicon source
lives in `src/assets/favicon.dev.svg`; exported browser icons live in `public/`.

Once published, preserve slugs and filenames. If a move is necessary, add the old
URL to `src/data/legacy-urls.json` with the final canonical target, and update
internal links. The build generates host redirects, rejects missing targets and
redirect chains, and automatically adds legacy page slash/HTML variants. See
[the full URL overview](url-overview.md).

## Validate before publishing

Run `npm run validate` from the repository root. It checks types, builds production
output, runs unit/build checks, and exercises the site through Wrangler with
Playwright on desktop/mobile. `validate:ci` installs Chromium and WebKit first.
Build-output tests require the production build; `npm run preview` is useful for a
quick look but uses Astro's preview server. Run `npm run quality:audit` separately
after a build for the heavier local Lighthouse/resource/screenshot report; see
[quality checks](quality-checks.md). It does not validate a deployment or replace
the Wrangler coverage. The audit uses gzip by default; use `--compression none`
only for an explicitly raw comparison, and do not compare those scores directly.

Inspect the actual article, images, downloads, narrow layout, and both themes.
For supporting programs, run their own meaningful validation as well: serving a
source file or successfully building the website does not prove that program's
results. Building and validation do not publish a deployment.
