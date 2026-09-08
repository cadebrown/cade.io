# Widget improvement scope

## Concrete image previews

The next widget pass is reviewable at `/test#widget-previews`:

- `ZoomFigure` reuses the existing inline figure and adds an optional native
  dialog. The enlarged image loads on first open. Ordinary links remain usable
  without JavaScript; Escape/Close restore focus and reading position. Browser
  checks caught native dialog autofocus scrolling the document; fixed viewport
  positioning and explicit reading-position restoration cover both open/close.
- `ImageCompare` shows registered before/after renders with a native range and
  pointer-controlled divider. Both images remain complete without JavaScript;
  a fixed frame and control row preserve geometry during delayed enhancement.
- `Gallery layout='rows'` provides proportional, uncropped mixed-image rows.
  The existing `grid` default and surrounding page design remain unchanged.
- The lab includes same-source current/proposed previews, short copyable usage
  examples, and reproducible numerical comparison fixtures. Desktop/mobile,
  light/dark captures are in `artifacts/widget-previews/`.
- `npm run test:visual` adds exact homepage screenshot comparisons against
  baselines captured before this pass. All four desktop/mobile/theme comparisons
  passed with zero changed pixels. Initial baselines are macOS-specific; the
  optional gate is separate from Linux CI until its baselines are reviewed.
- Final `ASTRO_DRAFT_PORT=4345 npm run validate` passed: 149 unit tests and 66
  browser checks, with the existing Chromium-only prefetch skip in WebKit.
- `npm run benchmark:build -- --label widget-previews-final` completed in a
  disposable source copy with private diagram, Astro image, and Vite caches.
  Cold: 19.300 s; warm: 3.656 s. Both produced 831 files / 117,270,956 bytes.
  This single local pair measures build cost, not deployment or field speed.
  JSON/HTML/logs are under `artifacts/build-benchmarks/widget-previews-final/`.
- Final resource-budget/Lighthouse audit passed under
  `artifacts/quality/widget-previews/`. Local performance scores: home 99,
  Pikurn 97, lab 97; complete-route accessibility remains 92 / 94 / 94.
  These are local lab samples; widget checks pass without changing original
  whole-site contrast choices.

No commit, push, deployment, homepage/global theme change, or unrelated draft
modification was performed in this pass.

## Prior foundation and restoration

The September 8, 2026 quality work is limited to individual widgets and their
supporting behavior. Preserve the established homepage and article composition,
blackboard/whiteboard themes, system-monospace typography, header, footer, theme
controls, and social styling.

The retained work includes responsive image behavior; static Mermaid and
mathematical snapshots; Svelte, Plot, and worker-backed `/test` examples;
standalone search; read-only discovery endpoints; social-card demos on `/test`;
and the associated tests and performance tooling. It does not authorize a global
font experiment, design-direction preview, automatic table of contents, featured
homepage content, or automatic Open Graph replacement.

Validation results from the earlier broader proposal are superseded.

## Verified restoration

- Both global stylesheets, footer, theme controls, social styling, base/home
  layouts, and article route match the original tracked sources exactly.
- Homepage content and structure match the original; its only remaining edits
  are image loading priority and responsive `sizes`. Header and listing changes
  are invisible prefetch attributes. Math assets load only on applicable pages.
- `ASTRO_DRAFT_PORT=4345 npm run validate` passed: formatting, type checks,
  build, 149 unit tests, 51 browser tests, and one intentional Chromium-only
  prefetch skip in WebKit. The homepage structure now has a regression check.
- Accessibility tests gate upgraded widgets and retain unfiltered full-route
  findings. Original prose-link styling and the GitHub footer color have known
  findings; they were preserved rather than redesigned to improve a score.
- `node scripts/quality-audit.mjs --label original-design-widgets` passed.
  Performance: home 98, Pikurn 98, lab 100. Full-page accessibility: 92, 94, 94.
  Initial measured CLS is zero on all three; initial script bytes remain
  6,116 / 21,702 / 8,639. These are local lab results, not deployment metrics.
- Current screenshots and reports: `artifacts/quality/original-design-widgets/`.
  The existing browser preview at port 4340 was refreshed to the restored home.
- Dependency audit found zero production vulnerabilities; `git diff --check`
  passed. No commit, push, deployment, or unrelated draft modification occurred.

## Centered widget layouts and narrow-screen scrolling

Implemented the approved layout pass without changing the homepage, palette,
global typography, or article reading widths. Markdown tables now receive a
compact centered wrapper; authored HTML tables can use `Table.astro` in compact,
wide, or explicitly bounded-height form. Only the wrapper scrolls, and numeric
column alignment is preserved. Wide tables keep natural column widths on phones.

Static diagrams reserve their native viewBox dimensions and scroll locally on
narrow screens. Static Plot renders wide/narrow SVG variants at build time, with
readable labels and fewer narrow-screen ticks. Pikurn chart pairs use named
container queries, align their plotting areas, cap growth, and expose a local
keyboard scroller with a small-screen hint when needed. No client JS was added.

`/test#layout-examples` contains before/current table examples and live compact,
wide, bounded, diagram, responsive plot, and paired-chart fixtures. The authoring
and visualization guides document the layout contracts.

Validation: `ASTRO_DRAFT_PORT=4345 npm run validate` passed formatting, types,
build, 150 unit tests, and 84 browser tests; one Chromium-specific prefetch check
is intentionally skipped in WebKit. The new browser suite checks both themes at
320–1440px, keyboard scrolling, readable SVG labels, chart alignment, table
centering/fill, sticky headers, and static output without JS. Four homepage pixel
comparisons passed with zero changed pixels. Final component captures are in
`artifacts/layout-fixes/`; the passing final local performance/resource audit is
`artifacts/quality/layout-fixes-final/report.html`. These are local checks, not a
deployment. No commit, push, or publication was performed.

## Release preparation and additional bug fixes

The final audit fixed Pikurn bankroll labels extending beyond the SVG at extreme
wagers, stale Mandelbrot exports while a newer worker request was pending, and
canvas accessibility descriptions that did not follow the rendered view. Delayed,
stale, failed, and recovered worker responses now have browser coverage.

Video previews say "Load video", retain a normal watch link without JavaScript,
and move keyboard focus into the player after activation. A failed search clears
results belonging to the prior query. Fresh setup instructions now install the
Chromium browser needed for uncached Mermaid rendering. Benchmark documentation
and cache maintenance instructions match the implemented tooling.

Wrangler's Miniflare dependency pinned Sharp 0.35.2. A scoped override now shares
the root's patched Sharp 0.35.4; the regenerated lock removes only the duplicate
older Sharp and its native packages. Miniflare's local Images binding passed PNG
and AVIF decode/resize/encode checks, producing 50×50 PNGs. Full `npm audit`,
including development tooling, reports zero vulnerabilities.

Final validation passed formatting, Astro/Svelte checks, build, 150 unit tests,
and 99 browser checks; one Chromium-only prefetch check is intentionally skipped
in WebKit. A disposable source snapshot excluding the unrelated draft also passed
a fresh `npm ci`, type checks, a build with empty caches, and all 150 unit tests.
The generated-site inventory found no broken internal links, fragments, redirect
problems, or original-file mismatches. Four homepage pixel comparisons passed
with zero changed pixels in both themes and desktop/mobile viewports.

The final local performance/resource audit passed all configured budgets:
home 99, Pikurn 97, lab 100; initial CLS was zero on all three. Full-page
accessibility remains 92 / 94 / 94 with the requested original colors preserved.
Reports and new chart captures are under `artifacts/release-ready/` and
`artifacts/quality/release-ready-final/`. These are local checks, not deployment
verification. The reviewed commit scope excludes
`content/posts/machine-intelligence-godelian-or-bacterial/`. No commit, push, or
publication was performed during preparation.
