# Visualization foundation

This site uses a small, purpose-specific stack. It favors useful server-rendered output over an empty chart shell.

| Tool                                                                                 | Ready use                                          | Why                                                                                                | Current boundary                                                                                      |
| ------------------------------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Observable Plot](https://observablehq.com/plot/)                                    | Static comparative plots                           | Declarative marks generate accessible SVG from data                                                | Run at Astro build time with an explicit `linkedom` document; do not import it into a browser island. |
| [Svelte 5 with Astro](https://docs.astro.build/en/guides/integrations-guide/svelte/) | Local mathematical explorers                       | SSR output plus `client:visible` hydration gives a complete initial graphic and defers interaction | Use one Svelte island per independent explorer.                                                       |
| [uPlot](https://github.com/leeoniya/uPlot)                                           | Dense, frequently updated time series              | Small canvas renderer for cases where SVG point counts become impractical                          | Do not add until a measured streaming or high-point-count use case exists.                            |
| [Apache ECharts](https://echarts.apache.org/)                                        | Coordinated dashboards and specialized chart types | Broad chart vocabulary and linked interactions                                                     | Keep out of ordinary articles; its runtime cost needs a dashboard-scale requirement.                  |

## Authoring contract

Put an article's model, component, data, and downloads in `content/posts/<slug>/` when they serve that article alone. The Pikurn article is the reference: its typed solver is the source of truth, and its Astro element owns only the controls and rendering. Promote code to `src/lib/visualizations/` only when more than one article needs the same pure model or renderer.

Static output should have an SVG or HTML table in the initial document, a descriptive `title` or accessible label, a visible caption, and a text table for exact values. Build-time DOM libraries need an explicit adapter; do not assume Node provides `document`. Keep SVG and CSV downloads derived from the same data that rendered the graphic.

`StaticPlot` accepts typed `data`, `xKey`, `yKey`, axis labels, `title`, `description`, `filename`, and `identifier` props. Pass a unique `identifier` when placing multiple instances on one page. Its default series is explicitly synthetic demonstration data. The in-page SVG inherits the active site theme; the downloaded SVG substitutes dark ink and a white background so it remains readable outside the site.

Interactive models separate a deterministic pure TypeScript state/data contract from the Svelte view. Validate every control and query value at that boundary, name query keys with an explorer-specific prefix, and make the default SSR state meaningful. A no-JavaScript view should state what remains available and leave controls disabled instead of implying they work. Fixed SVG aspect ratios avoid layout shifts; labels, `fieldset`/`legend`, visible focus states, and a live status line cover keyboard and assistive-technology use.

The default harmonic explorer owns the `hv-*` query namespace. A second independent harmonic explorer must receive a distinct `instanceId`; it derives a distinct `<instanceId>-hv-*` namespace and distinct element IDs. If no keys in its namespace occur in the URL, its supplied `initial` state remains authoritative.

For raster explorations, generate a stable default PNG at build time from the same pure pixel model used by an optional worker. Place the fallback `<img>` at its final dimensions, then reveal the canvas only after a current worker request completes. Give requests monotonically increasing IDs and ignore late responses; terminate the worker on component teardown. This preserves the image when a worker fails and prevents a stale zoom from replacing a newer one.

## Layout and overflow

Center each widget within its existing article area. Use compact sizing for
small result tables and natural-size diagrams; use available width for detailed
plots and comparisons. Preserve readable labels before allowing a dense diagram
to scroll. The global page palette, typography, and content widths are independent
of these component rules.

`StaticPlot` renders wide and narrow SVG variants at build time, with fewer ticks
and a taller plotting area in the narrow variant. CSS container queries select
one accessible SVG; both share data, domains, and the single table/download set.
`StaticDiagram` derives reserved dimensions from the SVG viewBox and owns the
horizontal scroll region. Never stretch exact geometry non-uniformly.

Use `Table.astro` for authored HTML and the automatic Markdown wrapper for prose
tables. Both expose one keyboard-focusable scroll area and preserve native table
display. A bounded-height table is an explicit long-results option, not a default.
See the authoring guide and `/test#layout-examples` for props and examples.

## Lifecycle and escalation

Use `client:visible` for an optional, below-the-fold explorer; reserve `client:load` for controls that must respond immediately. Dispose subscriptions, timers, observers, workers, and object URLs in component teardown. Move numeric work to a worker only after profiling shows it blocks interaction, or when a computation is independently cancellable and has a versioned message/data contract. Keep a worker optional: SSR and the initial static view remain authoritative fallbacks.

A future page-provided WebMCP tool may expose validated visualization actions (for example, set state or export data), but it must call the same state/model contract and needs separate coordination with site navigation and agent tooling.
