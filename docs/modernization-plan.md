# Astro and content modernization — implementation record

The migration and simplification are implemented and validated as of 2026-09-08.
This record describes the resulting system and local verification. Production
deployment is a separate hosting concern.

## Resulting system

The repository uses Astro 7.3.1 with compatible maintained integrations, a locked
npm dependency graph, Node.js 24 configuration, and a single validation command.
Content is organized as self-contained article folders. Canonical article URLs
are `/posts/<slug>`; originals are directly beneath them, with descriptive saved
filenames. Existing published page and authored asset addresses are retained via
aliases or unchanged canonical URLs.

```text
content/
  posts/<slug>/
    index.mdx
    descriptive-image.webp
    descriptive-paper.pdf
    runnable-example.py
    editable-figure.svg
  authors/
    cade-brown.json
    cade-brown.webp
src/
  assets/               # shared source photos, music artwork, icons, fonts, PDFs
  components/
  layouts/
  pages/                # page routes and prerendered post-file endpoints
  lib/                  # publication queries, file discovery, archive generation
  integrations/         # native Markdown adapters and shared-asset publishing
  data/                 # asset URL exceptions and legacy aliases
  styles/
public/                 # root browser/platform icons, manifest, and CNAME
docs/
scripts/
tests/
infra/
```

No mandatory media/download/source subfolders were introduced. Collection loaders
read post entry files and flat author JSON records, preserving article slugs and
author IDs when their source directories moved.

## Implemented decisions

| Area | Result and reason |
| --- | --- |
| Astro/tooling | Astro 7.3.1, current compatible integrations, Node 24, matching Node types, explicit direct dependencies, and lockfile installs. TypeScript 6 remains the selected checker-compatible toolchain. |
| Markdown | Adopted Astro's native Satteri processor. Native GFM, footnotes, definitions, directives, and heading IDs replace the old remark/rehype chain. Small native adapters retain KaTeX, image captions, heading permalinks, and local article links. |
| Images | Removed the custom image service. Astro/Sharp handles imported display images with responsive sizing; original download bytes remain separate and unchanged. |
| SVG icons | Native local SVG imports replace the icon integration. Previously published icon files retain compatibility redirects. |
| Figures/galleries | Kept semantic components, numeric gallery ordering, alt/caption support, and clean original links. |
| Charts | Extracted typed chart configuration into a supporting source file and replaced string evaluation with an explicit component lifecycle. Advanced charts still use ApexCharts. |
| Code/diagrams | Kept Expressive Code and Mermaid for their actual rendering features; these are not obsolete merely because Astro was upgraded. |
| Fonts | Retained the monospace/system-font design. Preserved old font downloads as shared originals; removed dead font-face styling and the unused conversion script. |
| Files | Automatic authored-file discovery, semantic MDX source names, per-post ZIP downloads, collision/path checks, and optional labels/descriptions/exclusions. No filename-override metadata. |
| HTML source | `.html`/`.htm` supporting files use `.html.txt`/`.htm.txt` serving URLs to avoid host page normalization; download and ZIP names keep the original extension. |
| Publication | Centralized production filtering for articles, listings, author pages, RSS, and post-file endpoints. Drafts remain available locally. Astro 7 author references now populate author listings correctly. |
| Shared assets | Moved shared source ownership under `src/assets/`; automatic discovery generates stable outputs, with explicit URL exceptions and aliases. Kept `public/` for root platform files. |
| URLs | `/posts` is the sole article namespace; `/test` replaces `/testpage`; root résumé/CV PDFs have semantic names; shared families are grouped under `/assets`. Other established URL families are retained with documented reasons. |
| Historical failures | Colocated the genuine MAGMA PDFs and removed only the byte-identical duplicate image. The missing dataset archive remains explicitly unavailable; its dead local link was removed. |

The stock renderer still benefits from small site-specific adapters. Keeping those
bounded adapters is deliberate; there is no parallel legacy Markdown pipeline or
global image passthrough fallback.

## Article/download contract

A post at `content/posts/magma-paper/index.mdx` generates:

```text
/posts/magma-paper
/posts/magma-paper/magma-paper.webp
/posts/magma-paper/dense-linear-algebra-amd-gpus-hpec-2020.pdf
/posts/magma-paper/magma-paper.mdx
/posts/magma-paper/magma-paper-files.zip
```

The same inventory supplies static endpoints, the generated **Files & source**
section, and ZIP entries. Source filenames define semantic names. Hidden/tool junk
and explicit exclusions are omitted; nested authored paths remain nested. The
publisher rejects symlinks, traversal, ambiguous names, and case-folded or
generated-output collisions. HTML's transport suffix participates in these checks.

Astro produces extensionless page behavior from `build.format: 'file'`, allowing
an article and its child file directory to coexist. Imported images can use
hashed `/_astro/` variants for display while original URLs remain stable.

## Compatibility and evidence records

- [URL policy](url-policy.md): enforced URL, ownership, and publication rules.
- [Complete URL overview](url-overview.md): every changed/unchanged family, all
  sixteen articles, and the full 75-path public asset appendix.
- `docs/url-inventory.json`: immutable pre-migration evidence from the previous
  sitemap, source assets, and build. Never overwrite it with current output.
- `src/data/legacy-urls.json` and `src/data/shared-assets.json`: implementation
  sources for direct redirects and canonical shared assets.
- [Authoring guide](authoring.md): adding posts, files, images, galleries, and
  supporting code under the new conventions.

`npm run inventory:urls` reads the current local build and sources and writes
`artifacts/current-url-inventory.json`. It reports routes, source hashes, emitted
originals, redirects, old-address coverage, and unresolved same-origin HTML paths
and fragments. It makes no network requests and leaves the historical baseline
unchanged. The report explicitly distinguishes observed build state from source
candidates that may be drafts, exclusions, or newer than the build.

## Validation results

A clean `npm ci` and `npm run validate` passed on 2026-09-08 using Node 24.20.0.
The final installed versions include Astro 7.3.1, MDX 8.0.1, and the native
Satteri integration 0.4.1. Formatting passed; Astro checked 71 files with zero
errors, warnings, or hints; the production build generated 16 pages; 108 unit/build
tests and all 16 desktop/mobile browser tests passed. The dependency audit
reported zero vulnerabilities. Final desktop/mobile screenshots were inspected.

The current URL report found 90 direct redirects and zero broken local paths,
broken fragments, redirect problems, or original-file mismatches. Regression
checks cover all 75 original public-file addresses and their original SHA-256
hashes. Seven historical draft routes are now excluded from production.

Logs, browser results, screenshots, and the current inventory are retained under
`artifacts/`. Rerun `npm run validate` and `npm run inventory:urls` after changes.

The completed gate covers:

- Production draft exclusion and correct author/feed/sitemap links.
- Byte-preserving originals and archives, semantic saved names, and host headers.
- Every previously published address resolving or having a documented exception.
- Native math, footnotes, code, diagrams, responsive images, galleries, and chart
  theme/navigation behavior in their actual rendered pages.
- Slashless pages beside child assets and direct redirect behavior on the local
  Pages host.

A successful local gate establishes those local checks, not a production rollout
or the scientific correctness of supporting programs.

Final full-gate result: **passed locally; not deployed**.

## Deliberately retained details

- KaTeX, Mermaid, Expressive Code, and ApexCharts provide features Astro itself
  does not replace. Diagram/chart code loads only when needed.
- A narrow native MathML adapter corrects Satteri's default-namespace parsing;
  tests cover the emitted namespace and math semantics.
- ApexCharts 7 caches tooltip theme configuration. The chart uses its public
  destroy/render lifecycle on a theme change, which resets transient legend
  selection. Chart data is unchanged; mobile options improve readability.
- TypeScript 6 is retained because the current Astro checker declares support
  for TypeScript 5/6. Node types match the configured Node 24 runtime.
- The site remains static. Server rendering, experimental incremental builds,
  and custom font infrastructure have no current requirement.
- The managed Cloudflare build command now uses the complete validation gate.
  Its remote execution and existing OpenTofu provider/state configuration were
  not migrated or applied to a live account.
- The missing SMCEFR dataset archive was absent from the repository. Its link is
  explicitly unavailable; no substitute data was fabricated.

## Simplification follow-up

The follow-up removes the pass-through Page layout and unused Hover component,
uses typed ordinary list rendering, and lets cards grow with their content.
Heading permalinks are keyboard accessible and light-theme links use darker
colors. Icon styling no longer overrides every SVG on the page.

Navigation uses ordinary document loads with progressive native view transitions.
Validated theme settings handle unavailable storage and expose button selection.
Charts receive typed configuration from their owning post, and gallery helpers
share sorting and download-link rules. Shared assets are discovered automatically;
the configuration contains only URL exceptions and historical aliases.

Site identity and metadata helpers are shared, including the article Open Graph
type and author identity links. The complete local validation gate includes this
follow-up, including storage failures, document navigation, keyboard permalinks,
readable light-theme links, larger listing text, and prototype-like file names
in original-file discovery and ZIP downloads.

## Primary references

- [Astro 7 migration guide](https://docs.astro.build/en/guides/upgrade-to/v7/)
- [Astro 7 announcement](https://astro.build/blog/astro-7/)
- [Astro 7.3 release](https://astro.build/blog/astro-730/)
- [Astro image assets](https://docs.astro.build/en/reference/modules/astro-assets/)
- [Astro configuration](https://docs.astro.build/en/reference/modules/astro-config/)
- [Astro imports](https://docs.astro.build/en/guides/imports/)
- [Astro static endpoints](https://docs.astro.build/en/guides/endpoints/)
