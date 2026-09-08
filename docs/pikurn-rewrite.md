# Pikurn article and interactive solver

Implemented and published on 2026-09-08, preserving the posting date 2025-12-01.

The article separates maximum expected terminal wealth from maximum guaranteed
terminal wealth. It derives both Bellman recurrences, the original game's exact
efficient frontier, the complete-bag expectation formula, and the no-blue
limited-horizon guarantee formula. An independent mathematical review checked
the proofs and identified a numerical-overflow case now rejected by the solver.

All article-specific sources are in `content/posts/game-pikurn/`:

- `pikurn.ts`: dependency-free solver, runout enumeration, and Node CLI.
- `PikurnExplorer.astro`, `pikurn-explorer.ts`, `pikurn-explorer.css`: urn,
  adaptive decisions, conditional game tree, and outcome distribution.
- `WagerLab.astro`, `wager-lab.ts`: two-dollar-wager controls and frontier graph.
- `pikurn-game-tree.svg`: original editable illustration.
- `DecisionGeometry.astro`: static, accessible wager-value diagrams.
- `pikurn-article.css`: prose widths, typography, and proof disclosures.
- `index.mdx`: article, proofs, and a source listing imported from the solver.

The original shower-thought image remains available in the download bundle.
The obsolete first-bet-only chart wrapper and hard-coded data were removed.

## Local verification

- Formatting and Astro/TypeScript checks; production build.
- 126 unit/build tests, including 18 solver tests: independent action-grid
  recursion, complete path probabilities, closed forms, varying horizons, blue
  termination, scaling, invalid input, and numerical overflow.
- 18 desktop/mobile browser tests: both objectives, adaptive play, blue stop,
  horizon changes, wager presets, keyboard controls, themes, source listing,
  downloads, existing site behavior, and draft exclusion.
- No-JavaScript fallback and full source listing inspected separately.
- All eleven ZIP entries verified; solver and visualization originals preserve bytes.
- URL inventory: 90 redirects; no broken internal paths/fragments, redirect
  problems, or original-file mismatches.

Screenshots and logs are under `artifacts/pikurn/` and `artifacts/browser/`.
The lab enumerates small bags rather than sampling them; its controls cap the
bag at eight balls. The displayed tree ends after three draws, with truncation
explicitly labeled. Numerical values use floating-point arithmetic; the article
derivations establish the exact results. Larger standalone inputs are limited by
number range, recursion depth, and memory.

To reproduce: `node content/posts/game-pikurn/pikurn.ts`, then
`ASTRO_DRAFT_PORT=4325 npm run validate` if the default draft-test port is occupied.
The published article is available at `/posts/game-pikurn`.

## Editorial and visual refinement

The follow-up pass reduced the rendered reading text from about 2,080 to 1,178
words. Rules and comparisons use short lists; derivations use displayed equations,
and longer proofs remain available in native disclosures. Prose and headings share
an 820px maximum width; the interactive diagrams use the wider article canvas.
The labs use compact controls, paired statistics and charts, and an expandable
game tree. Static diagrams show affine expected value and the lower envelope
that determines guaranteed value.

The full validation gate passed again (126 unit/build tests and 18 browser tests).
Desktop dark and mobile light views were visually inspected, including diagram
labels, matching prose/heading widths, and absence of horizontal page overflow.
All eleven downloaded ZIP entries matched their original source bytes.

## Shared code rendering and authoring instructions

The full listing now uses `Code` from `astro-expressive-code/components`, matching
Markdown fences. `ec.config.mjs` owns the shared themes and plugins; the obsolete
theme-export wrapper and article-specific pre styling were removed. A native
Satteri metadata bridge preserves fence languages and titles across raw HTML
parsing, with a regression test. `/test` demonstrates fences and imported source.
`AGENTS.md` points authors and assistants to the component index, examples, and
verified official references in `docs/authoring.md`.

Formatting, Astro checks, and production build passed; 127 unit/build tests and
20 desktop/mobile browser tests passed, including highlighting, shared themes,
source-text parity, and actual clipboard contents. At this stage the article remained a draft.

## Publication

Selected `pikurn-risk-balance.png` as the cover and social image, removed the draft
flag, and preserved `dated: '2025-12-01'`. The original cover is downloadable with
the article sources; rejected concepts remain outside the content package.
The complete artwork stays visible on desktop and mobile without cropping.

Formatting, Astro checks, production build, 127 unit/build tests, and 22 browser
tests passed. Publication checks cover the posting date, decoded cover, social
image, post and author listings, RSS, and sitemap. Both interactive labs now run
against the production preview in browser tests. The URL inventory reports no
broken paths or fragments, redirect problems, or original-file mismatches.
