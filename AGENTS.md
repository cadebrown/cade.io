# Working in cade.io

Read [README.md](README.md) for setup and [docs/authoring.md](docs/authoring.md)
before creating or editing articles. The authoring guide is the source of truth
for examples, component choices, downloads, and official documentation links.
See [src/pages/test.mdx](src/pages/test.mdx), rendered at `/test`, for live examples.

## Authoring conventions

- Keep each article and its assets in `content/posts/<stable-slug>/`. Start flat;
  use semantic filenames and relative asset links. Canonical pages use `/posts`.
- Preserve a draft's publication status unless the user requests publication.
- Use Markdown for prose, lists, tables, math, and fenced code. Use imported Astro
  components when the content needs behavior or richer semantics.
- Use fenced blocks with a language for short examples. For existing source, use
  `Code` from `astro-expressive-code/components` with a `?raw` import. Both use
  `ec.config.mjs`; do not hand-build highlighted HTML, copy runnable files into
  fences, or add a separate article-specific highlighter/theme.
- Prefer existing `Figure`, `Gallery`, and `Chart` components. Keep article-specific
  interactive components beside the article; share them only when reused.
- Make explanations direct. Define notation, label diagrams, distinguish proof
  from numerical evidence, and provide meaningful alt text and control labels.
- Use theme tokens, keyboard-accessible controls, and readable mobile layouts.
  Escape literal currency dollars in math-enabled prose (`\$100`).

## Maintenance and validation

Edit canonical sources, not `dist/`, `.astro/`, `.wrangler/`, or `artifacts/`.
Keep the authoring guide and `/test` examples in sync when changing component APIs
or rendering conventions. Consult the linked primary docs and installed package
APIs before introducing compatibility code.

Run the relevant checks from the README. Rendering/integration changes require
`npm run validate`; inspect the affected page in both themes and a narrow viewport.
The browser suite owns port 4322 and uses 4323 for drafts; use `ASTRO_DRAFT_PORT`
when the draft port is occupied. Preserve unrelated servers and working changes.
A site build does not validate the mathematics or behavior of supporting programs.
Commit, push, and deploy only when authorized; validation alone does not publish.
