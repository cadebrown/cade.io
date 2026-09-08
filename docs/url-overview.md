# URL overview and complete migration map

This document describes the local implementation as of 2026-09-08. It includes
changed and unchanged URL families. Deployment status is separate from this map.

The pre-migration inventory is `docs/url-inventory.json`, captured from the live
sitemap, tracked public files, and a local build at commit
`b5964ad94c5310c53cedac86d31f219cec9e58b8`. It records 22 sitemap pages and 75
tracked public-file addresses, plus known broken links. It is evidence of those
addresses, not a complete historical access-log inventory.

The implementation sources are `src/data/legacy-urls.json`,
`src/data/shared-assets.json`, the content collection, and
`src/integrations/shared-assets.ts`. The build derives `dist/_redirects` from those sources. The native endpoint
`src/pages/_headers.ts` generates `dist/_headers` from actual post-file metadata,
preserving the distinction between HTML transport suffixes and literal source filenames. Keep the pre-migration JSON unchanged; update
this document and the source manifests when later URLs move.

## Canonical rules

- Pages are extensionless and slashless: `/posts/magma-paper`.
- Download names retain their real extensions and descriptive names:
  `/posts/magma-paper/dense-linear-algebra-amd-gpus-hpec-2020.pdf`.
- Supporting HTML source has a deliberate transport suffix: `demo.html.txt` in
  the URL, while the downloaded file and ZIP entry are named `demo.html`. This
  avoids the host treating the source file as an extensionless page.
- Slugs do not contain dates or categories and do not change when titles change.
- Article files sit directly below their article URL. There is no `/files/`
  segment. Optional source subfolders retain their relative paths.
- Original files preserve their bytes. Display image optimization does not alter
  the original download.
- Existing published page and moved asset aliases receive direct 301 redirects
  to final destinations. Known old extensionless page aliases also get `/` and
  `.html` variants; the generated map rejects redirect chains and missing targets.
- Drafts are the explicit exception: local preview is available, but production
  does not generate their article pages, original-file endpoints, or ZIP packages.

The static build uses `format: 'file'`, producing, for example,
`dist/posts/magma-paper.html` beside `dist/posts/magma-paper/` containing downloads.
Cloudflare's HTML serving behavior provides the extensionless article URL. This
is why host behavior is included in browser tests instead of assuming Astro's
preview server has identical normalization.

## Every URL family

| Before | Canonical implementation | Decision and reason |
| --- | --- | --- |
| `/` | `/` | Keep: the homepage needs no extra namespace. |
| `/posts` | `/posts` | Keep: the established, concise post index. |
| `/posts/<slug>` | `/posts/<slug>` | Keep published article addresses and stable slugs. Draft exception below. |
| Scattered post PDFs and originals | `/posts/<slug>/<filename>` | Colocate addresses with their owning article; semantic names survive download. |
| Supporting `.html` / `.htm` source files | `/posts/<slug>/<name>.html.txt` / `.htm.txt` | Serve source as text to avoid host page normalization; saved filenames and ZIP names retain `.html` / `.htm`. |
| No standard article-source download | `/posts/<slug>/<slug>.mdx` | New: raw source with a meaningful filename instead of `index.mdx`. |
| No standard complete package | `/posts/<slug>/<slug>-files.zip` | New: original files and article source in a deterministic archive. |
| `/authors` | `/authors` | Keep: useful index of structured author records. |
| `/authors/cade-brown` | `/authors/cade-brown` | Keep: established author identity URL; now lists the author's published posts correctly. |
| `/links` | `/links` | Keep: short and accurately describes the link collection. |
| `/testpage` | `/test` | Rename: short address for the rendering test page; excluded from the sitemap. |
| `/bones/resume-CadeBrown.pdf` | `/cade-brown-resume.pdf` | Move: site-wide document with a descriptive downloadable name at the root. |
| `/bones/cv-CadeBrown.pdf` | `/cade-brown-cv.pdf` | Move: separate CV identity and filename, independent of an article. |
| `/assets/cade-pics/<filename>` | `/assets/photos/<filename>` | Clarify the shared asset family; original filenames retained. |
| `/assets/dysdemi/<filename>` | `/assets/music/<filename>` | Clarify shared music artwork; existing artwork identifiers retained. |
| `/bones/favicon-512-<variant>.png` | `/assets/brand/favicon-512-<variant>.png` | Group downloadable branding variants with their shared owner. |
| `/icons/cadeio-icons/<path>.svg` | `/assets/icons/<path>.svg` | Remove a redundant project name and place shared originals under one namespace. |
| `/fonts/<filename>.woff2` | `/assets/fonts/<filename>.woff2` | Keep legacy font downloads in the common shared-asset namespace. Current system-font styling remains independent. |
| `/assets/favicon.dev.svg` | `/assets/favicon.dev.svg` | Keep the established editable-source URL; canonical source moved out of `public/` and remains openly downloadable. |
| `/assets/sprites.svg` | `/assets/sprites.svg` | Keep a previously published shared SVG address even though native SVG imports replace the icon integration. |
| `/assets/test.png` | `/assets/test.png` | Keep the existing shared rendering fixture URL while relocating its source. |
| `/assets/testpage_boxdrawing.svg` | `/assets/testpage_boxdrawing.svg` | Keep the existing rendering fixture URL; renaming the page does not require breaking its asset address. |
| `/rss.xml` | `/rss.xml` | Keep: a conventional feed address readers may already subscribe to; entries now point to `/posts`. |
| `/sitemap-index.xml`, `/sitemap-0.xml` | Same generated sitemap family | Keep: conventional machine-readable discovery; includes final published URLs. Sitemap numbering is generated. |
| `/robots.txt` | `/robots.txt` | Keep: standard crawler-discovery address, linking to the sitemap index. |
| `/404.html` | `/404.html` | Keep: the host's not-found document; it is not an article URL. |
| `/favicon.ico`, `/favicon.svg`, `/favicon-96x96.png` | Same addresses | Keep: browser discovery and existing metadata links expect stable root icon addresses. |
| `/apple-touch-icon.png` | `/apple-touch-icon.png` | Keep: platform icon convention. |
| `/site.webmanifest` | `/site.webmanifest` | Keep: established web app manifest address. |
| `/web-app-manifest-192x192.png`, `/web-app-manifest-512x512.png` | Same addresses | Keep: root assets referenced by the manifest. |
| `/CNAME` | `/CNAME` | Keep the existing platform/domain file. |
| `/_astro/<hashed-asset>` | Same internal family, newly generated hashes | Keep: Astro's optimized images, scripts, styles, and dependency assets need cache-safe generated names. Use stable original URLs for human download links. |

`/_astro/` is an implementation namespace, not a promise that every old generated
hash will remain available after deployment. The pre-migration JSON records those
old build artifacts separately. The compatibility policy applies to published
page addresses and authored asset URLs; it does not manufacture redirects between
unrelated build hashes.

## Download behavior

For the MAGMA article the complete public unit is:

```text
/posts/magma-paper
/posts/magma-paper/magma-paper.webp
/posts/magma-paper/dense-linear-algebra-amd-gpus-hpec-2020.pdf
/posts/magma-paper/magma-paper.mdx
/posts/magma-paper/magma-paper-files.zip
```

Authored supporting files of published posts are downloadable by default. A
shared discovery function defines each post's file list and endpoint set. The file
list offers **Download** actions with descriptive filenames; PDFs and images can
also open at their original URLs. The ZIP contains the original bytes, with the
entry source renamed to the slug and any optional subpaths preserved. HTML source
URLs append `.txt` to avoid Cloudflare page normalization; their download actions
and ZIP entries retain the original `.html` or `.htm` names.

There is no manual post asset manifest. Optional `files` frontmatter adds labels,
descriptions, or exclusions; original filenames themselves determine URLs. Hidden
files and common tool/filesystem junk are excluded. See
[the authoring guide](authoring.md) for exact rules.

## All sixteen article addresses

Nine articles are published. Seven records marked as drafts were exposed by the
old route implementation and appeared in its sitemap; that publication bug is
corrected here. Draft destinations below are local development addresses and
reserved future article URLs, not working production redirect targets.

| Previous address | New address | Production treatment |
| --- | --- | --- |
| `/posts/dataset-smcefr` | `/posts/dataset-smcefr` | Keep published address |
| `/posts/diy-gamma-zeta` | `/posts/diy-gamma-zeta` | Keep published address |
| `/posts/diy-miller-rabin` | `/posts/diy-miller-rabin` | Keep published address |
| `/posts/game-pikurn` | `/posts/game-pikurn` | Draft: withheld; no production redirect |
| `/posts/hwsw-setup` | `/posts/hwsw-setup` | Draft: withheld; no production redirect |
| `/posts/langjam-kardinality` | `/posts/langjam-kardinality` | Draft: withheld; no production redirect |
| `/posts/machine-knuth` | `/posts/machine-knuth` | Keep published address |
| `/posts/machine-kolmogorov` | `/posts/machine-kolmogorov` | Draft: withheld; no production redirect |
| `/posts/magma-paper` | `/posts/magma-paper` | Keep published address |
| `/posts/my-writing-environment` | `/posts/my-writing-environment` | Draft: withheld; no production redirect |
| `/posts/posters-diffusion` | `/posts/posters-diffusion` | Keep published address |
| `/posts/rendering-fractals` | `/posts/rendering-fractals` | Keep published address |
| `/posts/rust-poker-0` | `/posts/rust-poker-0` | Draft: withheld; no production redirect |
| `/posts/sequence-a267263` | `/posts/sequence-a267263` | Keep published address |
| `/posts/vqgan-clip` | `/posts/vqgan-clip` | Keep published address |
| `/posts/wow-css` | `/posts/wow-css` | Draft: withheld; no production redirect |

## Every old tracked public-file URL

This appendix accounts for all 75 paths in the pre-migration public-file
inventory, including unchanged addresses. A kept address may now be generated
from a source under `src/assets/`; keeping the URL does not require retaining a
second source copy under `public/`.

| Previous public URL | Canonical URL | Treatment |
| --- | --- | --- |
| `/apple-touch-icon.png` | `/apple-touch-icon.png` | Keep URL |
| `/assets/cade-pics/cade-codetn-2016.webp` | `/assets/photos/cade-codetn-2016.webp` | 301 |
| `/assets/cade-pics/cade-face-0.webp` | `/assets/photos/cade-face-0.webp` | 301 |
| `/assets/cade-pics/cade-face-grad.webp` | `/assets/photos/cade-face-grad.webp` | 301 |
| `/assets/cade-pics/cade-fractal.webp` | `/assets/photos/cade-fractal.webp` | 301 |
| `/assets/cade-pics/cade-frc-0.webp` | `/assets/photos/cade-frc-0.webp` | 301 |
| `/assets/cade-pics/cade-frc-1.webp` | `/assets/photos/cade-frc-1.webp` | 301 |
| `/assets/cade-pics/cade-isef-0.webp` | `/assets/photos/cade-isef-0.webp` | 301 |
| `/assets/cade-pics/cade-isef-1.webp` | `/assets/photos/cade-isef-1.webp` | 301 |
| `/assets/cade-pics/cade-quantum.webp` | `/assets/photos/cade-quantum.webp` | 301 |
| `/assets/cade-pics/cade-record.webp` | `/assets/photos/cade-record.webp` | 301 |
| `/assets/cade-pics/cade-sasef-1.webp` | `/assets/photos/cade-sasef-1.webp` | 301 |
| `/assets/cade-pics/cade-sasef.webp` | `/assets/photos/cade-sasef.webp` | 301 |
| `/assets/cade-pics/cade-thumbs-0.webp` | `/assets/photos/cade-thumbs-0.webp` | 301 |
| `/assets/cade-pics/cade-thumbs-1.webp` | `/assets/photos/cade-thumbs-1.webp` | 301 |
| `/assets/cade-pics/cade-titan.webp` | `/assets/photos/cade-titan.webp` | 301 |
| `/assets/dysdemi/DDAYHFP.webp` | `/assets/music/DDAYHFP.webp` | 301 |
| `/assets/dysdemi/DDD.webp` | `/assets/music/DDD.webp` | 301 |
| `/assets/dysdemi/DDTGATW.webp` | `/assets/music/DDTGATW.webp` | 301 |
| `/assets/favicon.dev.svg` | `/assets/favicon.dev.svg` | Keep URL |
| `/assets/magma-paper/magma-paper.pdf` | `/posts/magma-paper/dense-linear-algebra-amd-gpus-hpec-2020.pdf` | 301 |
| `/assets/sprites.svg` | `/assets/sprites.svg` | Keep URL |
| `/assets/test.png` | `/assets/test.png` | Keep URL |
| `/assets/testpage_boxdrawing.svg` | `/assets/testpage_boxdrawing.svg` | Keep URL |
| `/bones/CadeBrown-2021-ICL-MAGMA-AI.pdf` | `/posts/vqgan-clip/cade-brown-magma-ai-2021.pdf` | 301 |
| `/bones/cv-CadeBrown.pdf` | `/cade-brown-cv.pdf` | 301 |
| `/bones/favicon-512-alpha.png` | `/assets/brand/favicon-512-alpha.png` | 301 |
| `/bones/favicon-512-blue.png` | `/assets/brand/favicon-512-blue.png` | 301 |
| `/bones/favicon-512-green.png` | `/assets/brand/favicon-512-green.png` | 301 |
| `/bones/favicon-512-red.png` | `/assets/brand/favicon-512-red.png` | 301 |
| `/bones/favicon-512-white.png` | `/assets/brand/favicon-512-white.png` | 301 |
| `/bones/machine-god.webp` | `/posts/vqgan-clip/machine-god.webp` | 301 |
| `/bones/resume-CadeBrown.pdf` | `/cade-brown-resume.pdf` | 301 |
| `/CNAME` | `/CNAME` | Keep URL |
| `/favicon-96x96.png` | `/favicon-96x96.png` | Keep URL |
| `/favicon.ico` | `/favicon.ico` | Keep URL |
| `/favicon.svg` | `/favicon.svg` | Keep URL |
| `/fonts/Ubuntu-Bold.woff2` | `/assets/fonts/Ubuntu-Bold.woff2` | 301 |
| `/fonts/Ubuntu-BoldItalic.woff2` | `/assets/fonts/Ubuntu-BoldItalic.woff2` | 301 |
| `/fonts/Ubuntu-Italic.woff2` | `/assets/fonts/Ubuntu-Italic.woff2` | 301 |
| `/fonts/Ubuntu-Light.woff2` | `/assets/fonts/Ubuntu-Light.woff2` | 301 |
| `/fonts/Ubuntu-LightItalic.woff2` | `/assets/fonts/Ubuntu-LightItalic.woff2` | 301 |
| `/fonts/Ubuntu-Medium.woff2` | `/assets/fonts/Ubuntu-Medium.woff2` | 301 |
| `/fonts/Ubuntu-MediumItalic.woff2` | `/assets/fonts/Ubuntu-MediumItalic.woff2` | 301 |
| `/fonts/Ubuntu-Regular.woff2` | `/assets/fonts/Ubuntu-Regular.woff2` | 301 |
| `/fonts/UbuntuMono-Bold.woff2` | `/assets/fonts/UbuntuMono-Bold.woff2` | 301 |
| `/fonts/UbuntuMono-BoldItalic.woff2` | `/assets/fonts/UbuntuMono-BoldItalic.woff2` | 301 |
| `/fonts/UbuntuMono-Italic.woff2` | `/assets/fonts/UbuntuMono-Italic.woff2` | 301 |
| `/fonts/UbuntuMono-Regular.woff2` | `/assets/fonts/UbuntuMono-Regular.woff2` | 301 |
| `/icons/cadeio-icons/autolink.svg` | `/assets/icons/autolink.svg` | 301 |
| `/icons/cadeio-icons/autolink2.svg` | `/assets/icons/autolink2.svg` | 301 |
| `/icons/cadeio-icons/misc/box-plus.svg` | `/assets/icons/misc/box-plus.svg` | 301 |
| `/icons/cadeio-icons/misc/box-x.svg` | `/assets/icons/misc/box-x.svg` | 301 |
| `/icons/cadeio-icons/misc/chevrons-down.svg` | `/assets/icons/misc/chevrons-down.svg` | 301 |
| `/icons/cadeio-icons/misc/chevrons-left.svg` | `/assets/icons/misc/chevrons-left.svg` | 301 |
| `/icons/cadeio-icons/misc/chevrons-right.svg` | `/assets/icons/misc/chevrons-right.svg` | 301 |
| `/icons/cadeio-icons/misc/chevrons-up.svg` | `/assets/icons/misc/chevrons-up.svg` | 301 |
| `/icons/cadeio-icons/misc/circle-close.svg` | `/assets/icons/misc/circle-close.svg` | 301 |
| `/icons/cadeio-icons/misc/circle-plus.svg` | `/assets/icons/misc/circle-plus.svg` | 301 |
| `/icons/cadeio-icons/misc/eye-closed.svg` | `/assets/icons/misc/eye-closed.svg` | 301 |
| `/icons/cadeio-icons/misc/eye.svg` | `/assets/icons/misc/eye.svg` | 301 |
| `/icons/cadeio-icons/misc/plus.svg` | `/assets/icons/misc/plus.svg` | 301 |
| `/icons/cadeio-icons/socials/email.svg` | `/assets/icons/socials/email.svg` | 301 |
| `/icons/cadeio-icons/socials/facebook.svg` | `/assets/icons/socials/facebook.svg` | 301 |
| `/icons/cadeio-icons/socials/github.svg` | `/assets/icons/socials/github.svg` | 301 |
| `/icons/cadeio-icons/socials/instagram.svg` | `/assets/icons/socials/instagram.svg` | 301 |
| `/icons/cadeio-icons/socials/linkedin.svg` | `/assets/icons/socials/linkedin.svg` | 301 |
| `/icons/cadeio-icons/socials/twitch.svg` | `/assets/icons/socials/twitch.svg` | 301 |
| `/icons/cadeio-icons/socials/twitter.svg` | `/assets/icons/socials/twitter.svg` | 301 |
| `/icons/cadeio-icons/socials/website.svg` | `/assets/icons/socials/website.svg` | 301 |
| `/icons/cadeio-icons/socials/youtube.svg` | `/assets/icons/socials/youtube.svg` | 301 |
| `/icons/cadeio-icons/uiux/arrow-right.svg` | `/assets/icons/uiux/arrow-right.svg` | 301 |
| `/site.webmanifest` | `/site.webmanifest` | Keep URL |
| `/web-app-manifest-192x192.png` | `/web-app-manifest-192x192.png` | Keep URL |
| `/web-app-manifest-512x512.png` | `/web-app-manifest-512x512.png` | Keep URL |

## Additional legacy and broken addresses

These are outside the public-file appendix or need an explicit exception:

| Address | Treatment |
| --- | --- |
| `/2020/08/05/diy-gamma-zeta` | 301 to `/posts/diy-gamma-zeta`; repairs the dated link previously used by `/links`. |
| `/posts/magma-paper/magma-paper.pdf` | 301 to `/posts/magma-paper/dense-linear-algebra-amd-gpus-hpec-2020.pdf`; the genuine PDF was recovered from the old shared asset location. |
| `/posts/dataset-smcefr/smcefr-mini.tar.gz` | No substitute archive or misleading redirect. The archive is absent from the repository and inspected Git history; the article explicitly says it is unavailable and no longer links to a nonexistent download. |
| Old extensionless aliases with `/` or `.html` appended | Generated 301 variants point directly to the same final destination; this includes the published `/posts` pages and `/testpage`. |

For example, `/posts/magma-paper` serves the article directly. Its trailing-slash
and `.html` variants redirect directly to `/posts/magma-paper` without a chain. Draft page aliases are not generated in production.

## Further schema changes considered

The remaining short page names do not need a wholesale rename. `/authors` is a
structured identity index; `/about` would be a different editorial page, not a
necessary replacement. `/links` already states its purpose. `/rss.xml` is a stable
subscription endpoint; renaming it to `/feed.xml` would add migration cost without
new behavior.

An extensionless `/resume` landing page could be useful later if it offers a short
biography and a choice of résumé/CV downloads. The actual PDFs should retain their
semantic `.pdf` URLs. Likewise, `/projects/<slug>` would be appropriate for a real
project landing page with releases and documentation; it need not move historical
articles out of `/posts`.

The retained `/assets/test.png` and `/assets/testpage_boxdrawing.svg` names could
later become `/assets/test/sample.png` and
`/assets/test/box-drawing.svg` if those fixtures get a dedicated owner.
That cleanup is optional and has not been applied. Music artwork filenames retain
the existing work identifiers rather than guessing expanded titles. New shared
assets should use descriptive filenames from the start.

No date, tag, category, technology, or publication status belongs in a permanent
article path. Those properties can change independently of the resource's
identity.
