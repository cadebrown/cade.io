# Quality checks

## Visual comparisons

`npm run test:visual` compares the homepage against pixel baselines captured from
the restored design before the image-widget previews were added. It starts an
owned Wrangler server on port 4324 and checks desktop/mobile Chromium in both
themes. Build first; failures retain actual/expected/diff images and traces in
`artifacts/visual/`. This is a separate optional gate, not included silently in
`validate` or the Linux CI workflow.

Baselines live under `tests/visual/snapshots/`, partitioned by viewport and OS.
The initial baselines are for macOS. A different OS needs a reviewed baseline
because system-monospace font rendering is platform-specific. Missing baselines
fail; they are not skipped or accepted automatically. Use
`npm run test:visual -- --update-snapshots` only to propose a deliberate visual
change, inspect its diff, and retain the expected images after review. Existing
widget behavior tests remain part of `validate` on Chromium/mobile/WebKit.

See [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)
for platform consistency requirements. New `/test` widgets have review captures,
not implicitly accepted appearance baselines.

## Widget layout regressions

`tests/browser/layouts.spec.ts` is part of `npm run validate` on desktop/mobile
Chromium and WebKit. It checks 320–1440px widths, both themes, container
breakpoints, minimum rendered label sizes, preserved SVG aspect ratios,
keyboard scrolling, table centering/fill, sticky headers, and paired plot
alignment. It also checks static data and reserved plot geometry with JavaScript
disabled. The live reference is `/test#layout-examples`.

The fixture exercises compact and wide tables, long headers, a bounded long
table, scrollable diagrams, responsive Plot SVGs, and the article's paired charts.
Automated geometry assertions complement screenshot inspection; they do not
establish that every future author-supplied label or dataset will fit.

## Build cost

`npm run benchmark:build -- --label descriptive-name` produces a separate local
cold/warm build report without replacing the working preview or its caches.
See [build benchmarks](build-benchmarks.md) for isolation, repeat runs, and limits.

Build-time Mermaid and social-card renderers cache their final output under
`.astro/`. When changing their rendering logic, bump `rendererVersion` in
`src/integrations/static-diagrams.ts` or the renderer token in
`src/lib/social-cards.ts` so a warm build cannot reuse an older result. A cold
build benchmark checks the uncached path.

## Dependency maintenance

The scoped `miniflare.sharp` override in `package.json` shares the patched root
Sharp version with Wrangler's local image runtime. Miniflare currently pins
0.35.2, affected by [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c);
0.35.4 is patched. Revisit the override when updating Wrangler/Miniflare. The
release check exercised its local Images binding with PNG and AVIF inputs,
resizing both to 50×50 PNG, in addition to the site build and Wrangler browser
suite. Run a full `npm audit` to include development tooling.

## Page performance

`npm run quality:audit` audits an existing production `dist/` build. It launches
an owned loopback static server on a free port, Chromium, and Lighthouse; it does
not exercise Wrangler, Cloudflare Pages, or a deployment. The local server uses
gzip for compressible HTML, CSS, JavaScript, SVG, and JSON by default when the
browser advertises support. Use `--compression none` to make an explicitly raw
comparison. Use `npm run validate` for the repository's Cloudflare-local browser
coverage.

Browser accessibility checks gate the upgraded widgets in both themes. They also
attach complete, unfiltered route findings under `artifacts/browser/`. The
restored original prose links and footer colors have known accessibility findings;
retaining that requested design does not make those findings disappear. The full
page Lighthouse audit remains separate and continues to score the whole page.

```sh
npm run build
npm run quality:audit
node scripts/quality-audit.mjs --label after-layout-fix
node scripts/quality-audit.mjs --baseline before-next-change
node scripts/quality-audit.mjs --label raw-comparison --compression none
```

The ordinary run replaces `artifacts/quality/latest`. A label writes a preserved
run at `artifacts/quality/<label>`; `--baseline` writes to
`artifacts/quality/baselines/<label>`. The existing `artifacts/quality/before`
evidence is never changed by this tool.

Each report records the source revision and dirty state, Node and Chromium
versions, mobile Lighthouse category scores, route budgets, local navigation and
paint timings, cumulative layout shift, resource timing, screenshots, and
external image/font requests. `transferSize` is network transfer including
available headers, `encodedBodySize` is the encoded (usually compressed) body,
and `decodedBodySize` is the decoded body. JavaScript budgets use decoded-body
bytes; CSS and image budgets use transfer bytes, and the report labels both
units explicitly. The report records the selected server compression mode. These
are local lab measurements.
Resources are classified by their asset extension before falling back to the
browser's initiator: font requests often have the `css` initiator, and module
preloads may have the `link` initiator. Both must count toward their actual type.
The report deliberately does not claim field INP or other real-user metrics.

Every route also receives its full Lighthouse JSON and HTML report. The aggregate
report links them and summarizes FCP, LCP, Speed Index, Total Blocking Time, CLS,
Time to Interactive, and every performance audit below a perfect score. Pikurn
and `/test` additionally receive a viewport screenshot at the bottom of the page,
alongside their full-page mobile capture, so long-page visual regressions remain
inspectable.

The native section records navigation, paint, CLS, and resources immediately
after initial `networkidle`, before audit scrolling or screenshot capture. The
separate screenshot-interaction section records lazy-image decoding and resources
added while scrolling for visual capture. Its requests never affect initial
resource budgets. Historic reports made with the earlier uncompressed local server
remain preserved raw evidence, but their transfer figures and Lighthouse scores
are not directly comparable to gzip runs. Cloudflare commonly compresses suitable
assets; this local behavior does not measure a deployed response.

Budgets live in `quality.config.json`. A report exits nonzero when a deterministic
byte budget or configured Lighthouse score floor fails; change a budget only with
the reason for the product trade-off and updated evidence.

The Markdown renderer corrects the duplicate SVG `M` command in KaTeX 0.18.7's
tall floor delimiters. The defect is present in the installed package and the
[upstream geometry source](https://github.com/KaTeX/KaTeX/blob/main/src/svgGeometry.ts).
The correction targets only that path prefix, preserves MathML and TeX, and has
a tall-delimiter fixture plus a real-browser console-error check. Revisit it when
upgrading KaTeX.
