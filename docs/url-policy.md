# Clean URLs and publication policy

The migration is implemented locally. Final full-gate validation passed locally;
this document does not establish deployment status. See
[the complete URL map](url-overview.md) for changed and unchanged families,
all sixteen article addresses, and all 75 old public-file addresses.

## Canonical structure

| Resource | URL |
| --- | --- |
| Post listing | `/posts` |
| Article | `/posts/magma-paper` |
| Original figure, illustrative name | `/posts/magma-paper/amd-gpu-benchmarks.svg` |
| Paper download | `/posts/magma-paper/dense-linear-algebra-amd-gpus-hpec-2020.pdf` |
| Article source | `/posts/magma-paper/magma-paper.mdx` |
| Complete article package | `/posts/magma-paper/magma-paper-files.zip` |
| Supporting HTML source, illustrative name | `/posts/magma-paper/benchmark-demo.html.txt` |

Pages are extensionless and slashless. Keep slugs stable after publication,
independent of titles, dates, tags, or categories. Files normally use their source
names and real extensions, directly under the article; no `/files/` segment is
inserted. An HTML source file has a deliberate exception: `.html` and `.htm`
receive an additional `.txt` in the serving URL to avoid Cloudflare's HTML page
normalization. Its saved filename and ZIP entry retain the original extension
and bytes. This includes supporting `index.html` files.

Astro's static build uses `format: 'file'`: the article HTML sits beside the
article's file directory, allowing `/posts/<slug>` and `/posts/<slug>/<filename>`
to coexist. Optimized display assets retain internal hashed `/_astro/` addresses;
reader-facing original links use stable semantic URLs.

## Source ownership and publication

Keep `content/posts/<slug>/index.mdx` and related material together. Optional
subfolders retain their paths; they are not silently flattened. Author records
and portraits are flat under `content/authors/`, such as `cade-brown.json` and
`cade-brown.webp`.

Authored supporting files of published posts are downloadable by default.
`src/lib/post-files.ts` supplies the common inventory for file endpoints, the
**Files & source** section, and deterministic ZIP packages. The source entry is
renamed to `<slug>.mdx` (or `<slug>.md`) in downloads. Original bytes are preserved.

Optional `files` metadata provides labels, descriptions, and exclusions. There is
no filename-override metadata: source filenames determine download names. The
publisher omits hidden files/directories, common filesystem and tool junk, and
explicitly excluded files. It rejects symlinks, traversal, percent-encoded or
ambiguous names, case-folded output collisions, and generated source/archive
collisions. HTML's `.txt` transport name participates in the same collision checks.

Shared assets have canonical sources under `src/assets/`; files are discovered automatically, and
`src/data/shared-assets.json` records only URL exceptions and legacy aliases. Browser/platform files requiring fixed root
addresses remain in `public/`. Generated copies, headers, and redirects belong
in `dist/`, never in a manually maintained second source location.

Production routes, listings, author pages, and RSS use the common publication
query in `src/lib/content.ts`. The local development server can show drafts.
Production does not emit draft article pages, post-file endpoints, or archives;
repository openness is separate from the article publication flag.

## Links and download names

The native Markdown adapter resolves relative links and literal MDX `href`/`src`
attributes under the owning article. For example, `./paper.pdf` becomes
`/posts/<slug>/paper.pdf`, and `./demo.html` becomes
`/posts/<slug>/demo.html.txt`. Markdown image references remain local so Astro can
import and optimize them. Expressions in MDX are authored code and must provide
an appropriate absolute site path or imported URL.

Do not depend on browser-relative resolution at a slashless article URL, or add
a global `<base>` workaround. Explicit download attributes and generated host
headers preserve meaningful saved filenames. PDFs and images can also be opened
inline; HTML supporting files are distributed as source text, not implicit pages.

## Legacy compatibility

`src/data/legacy-urls.json`, shared-asset discovery and URL exceptions, and the published article
set generate permanent, direct-to-final 301 redirects. The build adds old
extensionless page slash/HTML variants and rejects redirect chains or missing
targets. Published `/posts/<slug>` articles and `/posts` retain their established addresses.
`/testpage` moves to `/test`.

| Old address | Implemented treatment |
| --- | --- |
| `/assets/magma-paper/magma-paper.pdf` | Redirect to `/posts/magma-paper/dense-linear-algebra-amd-gpus-hpec-2020.pdf` |
| `/posts/magma-paper/magma-paper.pdf` | Redirect to the same genuine PDF |
| `/bones/machine-god.webp` | Redirect to `/posts/vqgan-clip/machine-god.webp`; the duplicate source was byte-identical |
| `/bones/CadeBrown-2021-ICL-MAGMA-AI.pdf` | Redirect to `/posts/vqgan-clip/cade-brown-magma-ai-2021.pdf` |
| `/2020/08/05/diy-gamma-zeta` | Redirect to `/posts/diy-gamma-zeta` |
| `/posts/dataset-smcefr/smcefr-mini.tar.gz` | No fabricated replacement or redirect. The archive is absent from the inspected repository/history; the article now states it is unavailable and removes the dead download link. |

Seven draft routes appeared in the pre-migration sitemap. They are intentionally
withheld from production and receive no redirects to nonexistent destinations.
Unchanged public addresses and all remaining asset moves are enumerated in
[the URL overview](url-overview.md).

## Inventory and validation

`docs/url-inventory.json` is the immutable **pre-migration** evidence. It records
what the old sitemap, tracked public files, and old local build exposed; it is
not an access-log history and must not be regenerated from the new site.

To inspect a current build, run:

```sh
npm run build
npm run inventory:urls
```

The reporter reads local source and `dist/`, makes no network requests, and writes
only `artifacts/current-url-inventory.json`. It lists built routes, exact redirects,
source hashes, emitted originals, sitemap paths, broken same-origin HTML links
and fragments, and coverage of the old inventory. It does not overwrite the
historical snapshot. A report is evidence about the existing build, which may be
stale relative to source; non-emitted source candidates may be drafts or explicit
exclusions. External URLs and dynamically generated links are outside its scope.

The final gate is `npm run validate`: formatting, type checks, production build,
unit/build assertions, and desktop/mobile browser tests through Wrangler's local
Pages server. Validate original hashes, semantic saved names, MIME/disposition
headers, redirects, and article/file path coexistence. Astro preview and local
Wrangler tests are distinct from checking a production deployment.

Final full-gate result: **passed locally** — 81 unit/build tests and 10 desktop/mobile
browser tests; no broken inventoried paths/fragments or original-byte mismatches.
This is not a deployed production verification.

## Host references

- [Cloudflare Pages redirects](https://developers.cloudflare.com/pages/configuration/redirects/)
- [Cloudflare Pages HTML serving behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/)
