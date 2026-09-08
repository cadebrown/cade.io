# Widget improvement plan

## Scope

Improve individual reader-facing widgets and their supporting performance work
while preserving the existing homepage, article layout, typography, palette,
header, footer, theme controls, and social styling. A widget may improve its own
responsive geometry, accessibility, static fallback, loading behavior, or
interaction. It may not rearrange surrounding content or introduce a site-wide
visual direction unless that is explicitly requested.

The current work covers native responsive images; static Mermaid and mathematical
snapshots; Svelte, Plot, and worker-backed examples on `/test`; standalone search;
read-only discovery endpoints; and social-card demos on `/test`. These pieces
should remain independently useful and progressively enhanced.

## Implementation rules

- Preserve natural image dimensions and reserve deliberate cropping for a known
  thumbnail slot.
- Render diagrams, mathematics, and ordinary data graphics statically where a
  reader benefits from the result before JavaScript loads.
- Use an optional hydrated explorer only when interaction adds material value;
  provide meaningful SSR output and accessible, named controls.
- Keep one-off models, workers, components, and assets beside their article.
  Promote them to shared code after a second real use.
- Keep `/search` and public discovery endpoints read-only and limited to the
  published collection.
- Treat social-card routes as `/test` demos. Do not use them to replace existing
  Open Graph behavior without a separate request.
- Avoid global font, navigation, design-preview, or content-layout experiments
  as part of widget work.

## Validation boundaries

Run the relevant README command for the changed surface. Rendering or integration
changes require `npm run validate`; inspect the affected widget in both themes and
at a narrow viewport. `npm run quality:audit` is a separate, heavier report over
an existing build. It can measure local behavior and resource budgets, but it does
not prove deployed performance, browser support beyond the exercised browsers, or
the correctness of a supporting mathematical model.

Audit artifacts from the superseded broader redesign are historical evidence.
Use the scope and source information recorded with each report before comparing
it with the current widget work. `WORKLOG.md` records completed passes and their
validation evidence; the live `/test` examples and maintained tests define the
current behavior.
