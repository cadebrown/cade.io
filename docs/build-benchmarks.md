# Isolated Astro build benchmarks

The build benchmark measures the current working tree without modifying its
`dist/`, `.astro/`, or a running preview. It is an optional local diagnostic,
not a replacement for `npm run validate` or a deployment check.

Run it from the repository root after installing the locked dependencies:

```sh
node scripts/benchmark-build.mjs
```

The package-script alias is `npm run benchmark:build`. Pass a label to make the
artifact location stable, or repeat independent pairs when comparing changes:

```sh
node scripts/benchmark-build.mjs --label before-widget-cache
node scripts/benchmark-build.mjs --label after-widget-cache --runs 5
```

Labels may contain letters, numbers, dots, underscores, and hyphens. The command
refuses to overwrite an existing label. Use `--help` for the complete option
list.

Each run creates a temporary copy of the current source tree, including
untracked source changes. It excludes only generated and repository metadata:
`.astro`, `.git`, `.wrangler`, `artifacts`, `dist`, and `node_modules`. The copy
gets symlinked installed dependencies plus separate `.astro`,
`node_modules/.astro`, `node_modules/.vite`, and build-output directories. All
dot-prefixed dependency entries are excluded from the links except `.bin`, so a
build cannot reuse or mutate a working-tree cache. This lets Astro configuration
imports resolve from the copied project while avoiding writes to the working tree.

The first build of a pair is **cold** with empty project (`.astro`), Astro
(`node_modules/.astro`), and Vite (`node_modules/.vite`) caches. The following
**warm** build reuses only those cache directories in that same copied tree. Its
report records child-process wall time, output file count and bytes, and cache
file count and bytes; it reports the project cache separately from Astro's
default `node_modules/.astro` cache. Source-copy time is deliberately outside
the measured interval.

Results appear under `artifacts/build-benchmarks/<label>/`:

- `benchmark.json` contains platform details, source revision and dirty state,
  method notes, and every measurement.
- `index.html` is a compact readable summary.
- `cold-<n>.log` and `warm-<n>.log` retain the complete Astro output for each
  measurement.

One cold/warm pair is a diagnostic sample rather than a statistical benchmark.
The command does not clear operating-system file caches, Node code already
resident in memory, or caches outside its temporary copy, so compare runs on the
same host and use `--runs` for independent pairs. Authored draft content remains
in the copied source; Astro's production filtering remains part of what is
measured.
