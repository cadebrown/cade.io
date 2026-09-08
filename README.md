# cade.io — Near Computronium

The source for [cade.io](https://cade.io): Cade Brown's research, software,
artwork, and essays. The site uses Astro 7, MDX, and static Cloudflare Pages
hosting. Each article is a self-contained folder containing its text, images,
downloads, and supporting code.

## Develop

Use Node.js 24.20.0, pinned in `.node-version`, and the npm
version recorded in `packageManager`. Install the locked dependencies:

```sh
npm ci
npm run dev
```

Open [localhost:4321](http://localhost:4321). The development server includes
drafts; production builds exclude draft pages, post-file downloads, feed entries,
and listing entries.

## Repository layout

```text
content/
  posts/<slug>/
    index.mdx                    # article and frontmatter
    descriptive-figure.webp      # imported display image and original download
    descriptive-paper.pdf
    benchmark.py                 # supporting source; no required subfolders
  authors/
    cade-brown.json
    cade-brown.webp
src/
  assets/                        # shared photos, music artwork, icons, fonts, PDFs
  components/                    # images, galleries, charts, metadata, navigation
  layouts/
  pages/                         # page routes and prerendered download endpoints
  lib/                           # publication queries, file discovery, ZIP creation
  integrations/                  # native Markdown extensions, shared asset publishing
  data/                          # asset URL exceptions and legacy URL mappings
  styles/
public/                          # root-addressed browser/platform files
infra/                           # managed Cloudflare Pages infrastructure
scripts/                         # maintenance utilities
tests/                          # unit, build-output, and browser checks
docs/                           # authoring and migration reference
```

`dist/`, `.astro/`, `.wrangler/`, and `artifacts/` are generated output. Edit
canonical sources instead of these directories. `public/` is intentionally small:
favicons, the web manifest, touch/app icons, and `CNAME`.

## Articles and files

An article at `content/posts/magma-paper/index.mdx` becomes
`/posts/magma-paper`. Its colocated files are automatically published at
`/posts/magma-paper/<filename>`, preserving original bytes and meaningful download
names. HTML source uses a `.html.txt` or `.htm.txt` URL to avoid host page
normalization, but downloads and ZIP entries retain the original HTML filename.
The article source is named `magma-paper.mdx`; the complete download is
`magma-paper-files.zip`.

A generated **Files & source** section lists the originals, sizes, download links,
ZIP, and GitHub source folder. Add a file beside the article and it joins this
inventory automatically. Optional frontmatter supplies labels, descriptions,
and exclusions. Hidden files, common filesystem/tool junk, and explicitly excluded
files do not enter the download package.

Astro optimizes imported display images into `/_astro/` variants. Reader-facing
original links keep their descriptive `/posts/…` names. Shared material has one
source under `src/assets/`; automatic discovery publishes stable URLs, with explicit exceptions and
legacy aliases in shared-assets.json.

Start with [the agent instructions](AGENTS.md) and [live rendering examples](src/pages/test.mdx)
at `/test`. See [the authoring guide](docs/authoring.md) for complete examples and
[the URL overview](docs/url-overview.md) for every migrated and retained URL family,
all sixteen articles, and the full old public-file mapping.

## Rendering

- Astro's native Satteri Markdown processor handles Markdown, GFM, footnotes,
  definition lists, directives, and heading IDs. Small native plugins provide
  KaTeX rendering, figure captions, heading permalinks, and article-relative links.
- MDX supports imported Astro components. Native Astro image processing uses
  Sharp; local SVG icons are native imports.
- Expressive Code supplies code highlighting, line numbers, collapsible sections,
  and color chips. Mermaid supplies diagrams.
- Interactive charts use typed imported ApexCharts configuration and an explicit
  component lifecycle. Chart strings are not evaluated as JavaScript.
- Navigation uses ordinary document loads with progressive native view transitions
  and reduced-motion support. Validated theme controls work even when browser
  storage is unavailable.
- The blackboard and whiteboard themes retain the site's monospace design.
  Preserved Ubuntu font files remain available as shared assets; their presence
  does not imply the current theme loads them.

The old custom image service, remark/rehype pipeline, icon integration, and string
chart evaluator have been replaced. Site-specific rendering behavior lives in
`src/integrations/markdown.ts`, rather than a parallel legacy processor.

## Validation

```sh
# Install the browser used by the repository's browser checks, once per machine.
npx playwright install chromium

# Formatting, type checking, production build, unit/build tests, and browser tests.
npm run validate
```

| Command | Purpose |
| --- | --- |
| `npm run check` | Astro and TypeScript diagnostics |
| `npm run build` | Generate the production site in `dist/` |
| `npm test` | Unit tests plus assertions against an existing production build |
| `npm run test:browser` | Desktop/mobile checks against Wrangler's local Pages server |
| `npm run preview` | Quick Astro preview of the current build |
| `npm run format:check` | Check the configured source formatting scope |
| `npm run inventory:urls` | Inventory the current build under `artifacts/`; preserve the historical baseline |

Build before running the build-output or browser tests. Browser tests start their
own Wrangler server on port 4322 and Astro draft preview on port 4323 (override the
latter with `ASTRO_DRAFT_PORT` if occupied), and retain traces/screenshots under
`artifacts/`. This exercises Cloudflare's local serving behavior, including
slashless article pages beside nested downloads and generated host redirects;
an Astro preview alone does not establish those host behaviors. Local validation
is separate from verifying a deployment on `cade.io`.

## URLs and hosting

Pages use lowercase, extensionless, slashless paths. Article slugs remain stable
when titles change. `/posts` and `/posts/<slug>` remain canonical. `/testpage` redirects to `/test`. Existing `/authors`, `/links`,
RSS, sitemap, robots, and browser icon addresses retain their purposes.

`src/data/legacy-urls.json` and `src/data/shared-assets.json` are the sources for
legacy aliases. The shared asset integration generates `dist/_redirects`; the injected native
endpoint in `src/pages/_headers.ts` derives `dist/_headers` from the same post-file
inventory as downloads. Do not edit those outputs. The pre-migration evidence remains in
`docs/url-inventory.json`.

Cloudflare Pages infrastructure is managed in `infra/cloudflare/`; see
[the infrastructure guide](infra/README.md). `npm run deploy:pages` is the separate
manual upload command for an already validated `dist/`. Building or validating
the repository does not deploy it.
