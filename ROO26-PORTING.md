# Porting Roo '26 to `alkemdev/roo26` + `roo26.alkem.dev`

Handoff doc for an agent (or human) porting the Bonnaroo 2026 guide app out of
`cadebrown/cade.io` into its own repo and standing it up on Cloudflare Pages at
`roo26.alkem.dev`. The app is **complete and battle-tested in production** at
https://cade.io/roo26 — the job is an exact lift, not a rewrite. Do not redesign
anything; copy, restructure paths, deploy, verify.

---

## 1. What this app is

A standalone, mobile-first PWA: full Bonnaroo 2026 schedule (116 sets, transcribed
from the official posters), interactive Leaflet satellite map with researched GPS
data (stages, water, medical, Plazas 1–9, etc.), personal planner with shareable
URL-encoded plans + QR codes, passive trip tracking with a stats tab, live NWS
weather/alerts, offline support, and a pet/scavenger-hunt easter egg. Five routes:
`/` (schedule), `/map`, `/plan`, `/trip`, `/info`. No backend except an optional
Cloudflare Pages Function for crew location sharing.

## 2. Complete file inventory (source: `cadebrown/cade.io`, branch `main`)

### The app itself
| File | Role |
|---|---|
| `src/pages/roo26/_App.astro` | Entire UI: standalone HTML shell, all markup, all CSS (~1100 lines). Takes props `tab` and `standalone`. |
| `src/pages/roo26/_app.js` | All client logic (~1500 lines): router, schedule, favorites, sheet, map, pins, geolocation, compass, official-map viewer, radar, route arrows, trip tracking, pet, quests, weather, alerts, share/QR/ICS, crew client. |
| `src/pages/roo26/_data/schedule.json` | 116 sets, 6 stages, 4 days. Times are local CDT ISO strings without offset; `tz: "-05:00"`. |
| `src/pages/roo26/_data/pois.json` | 49 map POIs with categories (stage/water/medical/entrance/food/utility/camping/landmark), map center/bounds. |
| `src/pages/roo26/_data/artists.json` | 115 artists keyed by slug: genre, tagline, bio, Spotify ID + image, verified socials, news links. |

### Standalone-build scaffolding (already in the repo — this IS the port, half-done)
| File | Role |
|---|---|
| `src-roo26/pages/{index,map,plan,trip,info}.astro` | Root-path wrappers; each renders `<App tab="..." standalone />`. |
| `astro.roo26.config.ts` | Standalone build config: `site: 'https://roo26.alkem.dev'`, srcDir `src-roo26`, outDir `dist-roo26`, publicDir `public-roo26`. |
| `scripts/sync-roo26-public.mjs` | Copies `public/roo26*` → `public-roo26/` pre-build. |
| `package.json` → `"build:roo26"` | `node scripts/sync-roo26-public.mjs && astro build --config astro.roo26.config.ts` |

### Static assets (names are load-bearing — referenced by absolute path in code)
- `public/roo26-sw.js` — service worker (network-first pages, cache-first assets, precaches official maps)
- `public/roo26.webmanifest` (scope `/roo26`) and `public/roo26-root.webmanifest` (scope `/` — the one the standalone build uses)
- `public/roo26-icon-{180,192,512}.png` — rainbow-arch icons (PIL-generated)
- `public/roo26-map-centeroo.webp`, `public/roo26-map-outeroo.webp` — official festival maps, downscaled (sources: Bonnaroo Zendesk attachments 50022050935444 / 50022045004692)

### Optional backend
- `functions/roo26-api/[[path]].js` — crew location sharing (anonymous 6-char codes, 5-min-TTL KV entries). Inert until a KV namespace is bound as `ROO_KV`; the client feature-detects via `/roo26-api/health` and hides all crew UI when absent.

### npm dependencies (beyond Astro)
`leaflet` (bundled, not CDN), `@dicebear/core` + `@dicebear/collection` (pet avatars, lazy-loaded), `qrcode` (lazy-loaded). Dev: none required for this app.

## 3. The one architectural trick: origin-aware base path

The same code serves `cade.io/roo26` and `roo26.alkem.dev`. Both `_app.js` and
`roo26-sw.js` contain:

```js
const BASE = location.hostname.startsWith('roo26.') ? '' : '/roo26'
```

Everything derives from `BASE`: the pushState router paths, share/QR URLs
(`${location.origin}${BASE}/plan#p=...`), SW precache list and page matching.
The manifest is the only fork: `_App.astro` links `/roo26-root.webmanifest` when
the `standalone` prop is set. **If the new repo serves ONLY the subdomain you may
hardcode `BASE = ''`, but keeping the detection costs nothing and keeps the code
identical to upstream — prefer keeping it.**

## 4. Port plan (recommended: dedicated repo `alkemdev/roo26`)

1. New Astro project skeleton (`npm create astro` minimal, or hand-write):
   - `package.json`: type module, scripts `dev`/`build`/`preview`, deps: `astro`, `leaflet`, `@dicebear/core`, `@dicebear/collection`, `qrcode`.
   - `astro.config.ts`: just `{ site: 'https://roo26.alkem.dev', trailingSlash: 'never', compressHTML: true }`. None of cade.io's markdown/plugin config is needed — the app uses zero of it.
2. Copy `src/pages/roo26/{_App.astro,_app.js,_data/}` → same relative layout, e.g. `src/components/roo26/` or keep `src/pages/roo26/` with underscore names (underscored files in pages/ are route-excluded).
3. Create `src/pages/{index,map,plan,trip,info}.astro` from `src-roo26/pages/*` — fix the import path to wherever `_App.astro` landed. Keep `standalone` prop.
4. Copy all `public/roo26-*` files into `public/` **with identical filenames** (absolute refs: icons in manifests/head, maps in `_app.js` `OMAPS`, SW path `/roo26-sw.js` in the register call).
5. Copy `functions/roo26-api/[[path]].js` → `functions/roo26-api/[[path]].js`.
6. Build, then verify (checklist below).

Alternative zero-port path: skip the new repo entirely — create a second Cloudflare
Pages project on `cadebrown/cade.io` with build command `npm run build:roo26`,
output `dist-roo26`. Everything else in this doc still applies.

## 5. Cloudflare setup (dashboard or API token with Pages:Edit + DNS:Edit)

1. Workers & Pages → Create → Pages → connect the repo. Build command `npm run build`
   (new repo) or `npm run build:roo26` (cade.io repo); output `dist` / `dist-roo26`.
2. Custom domains → add `roo26.alkem.dev` (alkem.dev zone is in the same CF account;
   DNS + cert are automatic).
3. Optional, enables crew sharing: create a KV namespace, bind it to the Pages
   project as `ROO_KV` (Settings → Bindings). No code change needed — the Crew chip
   appears on the map automatically once `/roo26-api/health` returns `{ok:true}`.

## 6. Invariants — do not break these

- **localStorage keys** (`roo26:favs2`, `roo26:pins`, `roo26:friends`, `roo26:track`,
  `roo26:trackagg`, `roo26:pet`, `roo26:quest`, `roo26:myname`, `roo26:locate`,
  `roo26:day`, `roo26:crew`): formats must stay readable; every past upgrade shipped
  migrations (`favs`→`favs2`, `tent`→`pins`) — follow that pattern for any change.
  Note localStorage does NOT transfer between cade.io and the subdomain (different
  origins) — accepted by the owner, ~2 existing users.
- **Share-link format** `#p=2!<name>!<idx.idx...>!<idx...>`: indexes into `SETS`
  sorted by start time. Old two-tier links must keep decoding (slot 4 folds into
  the starred list). Changing `schedule.json` ordering breaks old links — acceptable,
  but don't reorder casually.
- **Set IDs** `${day}-${stageId}-${slug(artist)}` — favorites/friends reference them.
  The `slug()` function (lowercase, non-alnum runs → `-`, trim `-`) also keys
  `artists.json`; the two must stay in lockstep.
- **Times**: stored as local-CDT ISO without offset; epoch math appends `-05:00`.
  The "festival day" rolls over at 6 AM. Don't introduce `Date` timezone parsing.
- **External services** (no keys needed): Esri World Imagery tiles, OSM tiles
  (unused since satellite-only), api.weather.gov (forecast + alerts),
  api.rainviewer.com (radar), i.scdn.co (artist images). All fetched client-side.

## 7. Verification checklist after deploy

- [ ] All 5 routes return 200 at roo26.alkem.dev; tab nav rewrites URLs as `/`, `/map`, `/plan`, `/trip`, `/info` without reloads; deep-loading each URL works.
- [ ] Schedule: Thursday auto-selected (during fest), 116 sets across days, LIVE badges, search shows other-day matches under "OTHER DAYS".
- [ ] Artist sheet: photo, bio, socials/news chips, Spotify link `open.spotify.com/artist/<id>`.
- [ ] Map: satellite tiles load, stage + plaza labels visible, category chips toggle, 📍 location + nearest panel, ⛺ pin create (locked until popup → Move), 🧭 compass, 📜 official map viewer (pinch-zoom), 🌧️ radar, ➤ route arrows, 🐾 tracks.
- [ ] Plan: star/unstar, conflicts, 🚶 leave-by chips, Share link opens import prompt in a fresh browser profile, ⊞ QR renders and scans to the same, 📅 downloads valid .ics.
- [ ] Trip: seed `roo26:track`/`roo26:trackagg` in devtools → stats + hourly bars render.
- [ ] PWA: manifest `roo26-root.webmanifest` with scope `/`, SW registers, airplane-mode reload still serves the app + official maps.
- [ ] Guide: weather card populates (or falls back), accordions, pet + quest tucked in the bottom accordion.

## 8. Data maintenance (the part that will actually need touching)

- Set times: official posters at https://www.bonnaroo.com/schedule (Webflow CDN
  images; transcribe). Update `_data/schedule.json` (`a`/`s`/`d`/`t`/`e` fields).
- POI coordinates: high-confidence stage coords are satellite-verified; everything
  marked "(approx.)" came from georeferencing the official map PNGs (Centeroo map
  is printed SOUTH-UP; Outeroo map is north-up). Affine used for Outeroo:
  `lon = -86.05166 + (x−2722)·5.789e-6`, `lat = 35.47143 + (3995−y)·4.046e-6`
  (full-res 8698×5539 px).
- Weather fallback: inline `ROO_WX_FALLBACK` array in `_App.astro` — refresh when
  the forecast changes meaningfully.
- If the upstream cade.io copy and the port both live on: schedule/POI/artist JSON
  is the sync surface; everything else rarely changes.
