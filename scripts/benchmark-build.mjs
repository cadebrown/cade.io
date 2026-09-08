#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { cp, lstat, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { arch, cpus, hostname, platform, release, tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const ignoredSourceEntries = new Set([
  '.astro',
  '.git',
  '.wrangler',
  'artifacts',
  'dist',
  'node_modules',
])

function usage() {
  return `Usage: node scripts/benchmark-build.mjs [--label name] [--runs count]

Measure one isolated cold and warm Astro production build by default. Results are
written to artifacts/build-benchmarks/<label>/ as JSON, HTML, and per-build logs.

Options:
  --label name  Output directory name (letters, numbers, dots, underscores, hyphens)
  --runs count  Number of independent cold/warm pairs; default: 1
  --help         Show this help`
}

function argumentValue(name) {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`)
  return value
}

function safeLabel(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value))
    throw new Error('--label must use letters, numbers, dots, underscores, or hyphens.')
  return value
}

function parseArgs() {
  const recognized = new Set(['--help', '--label', '--runs'])
  const seen = new Set()
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`)
    if (!recognized.has(argument)) throw new Error(`Unknown option: ${argument}`)
    if (seen.has(argument)) throw new Error(`Option supplied more than once: ${argument}`)
    seen.add(argument)
    if (argument === '--label' || argument === '--runs') index += 1
  }
  if (args.includes('--help')) {
    if (args.length !== 1) throw new Error('--help cannot be combined with other options.')
    console.log(usage())
    process.exit(0)
  }

  const requestedRuns = argumentValue('--runs') ?? '1'
  if (!/^\d+$/.test(requestedRuns) || Number(requestedRuns) < 1 || Number(requestedRuns) > 50)
    throw new Error('--runs must be an integer from 1 through 50.')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return {
    label: safeLabel(argumentValue('--label') ?? `build-${stamp}`),
    runs: Number(requestedRuns),
  }
}

function run(command, commandArgs, { cwd = root, env = process.env } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const startedAt = new Date().toISOString()
    const started = performance.now()
    const child = spawn(command, commandArgs, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.once('error', rejectRun)
    child.once('close', (code, signal) => {
      resolveRun({
        command: [command, ...commandArgs].join(' '),
        startedAt,
        durationMs: Math.round(performance.now() - started),
        exitCode: code,
        signal,
        output,
      })
    })
  })
}

async function git(commandArgs) {
  const result = await run('git', commandArgs)
  return result.exitCode === 0 ? result.output.trim() : 'unavailable'
}

async function directorySize(directory) {
  let bytes = 0
  let files = 0
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await directorySize(path)
      bytes += nested.bytes
      files += nested.files
    } else if (entry.isFile()) {
      bytes += (await lstat(path)).size
      files += 1
    }
  }
  return { bytes, files }
}

async function directorySizeIfPresent(directory) {
  return (await exists(directory)) ? directorySize(directory) : { bytes: 0, files: 0 }
}

async function exists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function linkNodeModules(source, destination) {
  await mkdir(destination, { recursive: true })
  for (const entry of await readdir(source)) {
    if (entry.startsWith('.') && entry !== '.bin') continue
    await symlink(join(source, entry), join(destination, entry), 'junction')
  }
}

async function copySource(destination) {
  await cp(root, destination, {
    recursive: true,
    filter: (source) => {
      const fromRoot = relative(root, source)
      if (!fromRoot) return true
      return !ignoredSourceEntries.has(fromRoot.split(/[\\/]/)[0])
    },
  })
  await linkNodeModules(join(root, 'node_modules'), join(destination, 'node_modules'))
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function readableHtml(report) {
  const rows = report.measurements
    .map(
      (measurement) =>
        `<tr><td>${measurement.run}</td><td>${measurement.kind}</td><td>${measurement.durationMs}</td><td>${measurement.output.bytes}</td><td>${measurement.output.files}</td><td>${measurement.cache.bytes}</td><td>${measurement.exitCode ?? 'signal'}</td></tr>`
    )
    .join('')
  return `<!doctype html>
<html lang="en">
  <meta charset="utf-8">
  <title>Astro build benchmark: ${htmlEscape(report.label)}</title>
  <style>body{font:16px/1.5 system-ui,sans-serif;margin:2rem;max-width:72rem}table{border-collapse:collapse}td,th{border:1px solid #999;padding:.4rem;text-align:right}td:nth-child(2),th:nth-child(2){text-align:left}code{background:#eee;padding:.1rem .25rem}</style>
  <h1>Astro build benchmark: ${htmlEscape(report.label)}</h1>
  <p>Source <code>${htmlEscape(report.source.revision)}</code>; dirty: ${report.source.dirty}; Node ${htmlEscape(report.platform.node)} on ${htmlEscape(report.platform.os)}.</p>
  <p>Each cold measurement starts from a new copied working tree with empty project, Astro, and Vite caches. Its warm partner reuses only those caches in the same disposable copy. See <a href="benchmark.json">benchmark.json</a> and the per-build logs for complete details.</p>
  <table><thead><tr><th>Run</th><th>Kind</th><th>Duration (ms)</th><th>Output bytes</th><th>Output files</th><th>Cache bytes</th><th>Exit</th></tr></thead><tbody>${rows}</tbody></table>
</html>`
}

const { label, runs } = parseArgs()
const output = join(root, 'artifacts', 'build-benchmarks', label)
if (await exists(output))
  throw new Error(`Output already exists: ${output}. Choose another --label.`)
if (!(await exists(join(root, 'node_modules', 'astro', 'bin', 'astro.mjs'))))
  throw new Error('Astro is not installed. Run npm ci before benchmarking.')

const revision = await git(['rev-parse', 'HEAD'])
const branch = await git(['branch', '--show-current'])
const dirtyStatus = await git(['status', '--porcelain'])
await mkdir(dirname(output), { recursive: true })
await mkdir(output)
const temporaryRoot = await mkdtemp(join(tmpdir(), 'cade-build-benchmark-'))
const measurements = []
let failure

try {
  for (let index = 1; index <= runs; index += 1) {
    const source = join(temporaryRoot, `run-${index}`)
    await copySource(source)
    const astroCli = join(source, 'node_modules', 'astro', 'bin', 'astro.mjs')
    const outputDir = join(source, 'benchmark-dist')
    const projectCacheDir = join(source, '.astro')
    const astroCacheDir = join(source, 'node_modules', '.astro')
    const viteCacheDir = join(source, 'node_modules', '.vite')
    for (const kind of ['cold', 'warm']) {
      const result = await run(process.execPath, [astroCli, 'build', '--outDir', outputDir], {
        cwd: source,
        env: { ...process.env, CI: '1', NO_COLOR: '1' },
      })
      await writeFile(join(output, `${kind}-${index}.log`), result.output)
      const measurement = {
        run: index,
        kind,
        ...result,
        log: `${kind}-${index}.log`,
        output: await directorySizeIfPresent(outputDir),
        cache: {
          project: await directorySizeIfPresent(projectCacheDir),
          astro: await directorySizeIfPresent(astroCacheDir),
          vite: await directorySizeIfPresent(viteCacheDir),
        },
      }
      measurement.cache = {
        bytes:
          measurement.cache.project.bytes +
          measurement.cache.astro.bytes +
          measurement.cache.vite.bytes,
        files:
          measurement.cache.project.files +
          measurement.cache.astro.files +
          measurement.cache.vite.files,
        ...measurement.cache,
      }
      measurements.push(measurement)
      if (result.exitCode !== 0) {
        failure = new Error(
          `${kind} build ${index} failed; inspect ${join(output, measurement.log)}.`
        )
        break
      }
    }
    if (failure) break
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

const report = {
  schemaVersion: 1,
  label,
  generatedAt: new Date().toISOString(),
  source: {
    root,
    revision,
    branch,
    dirty: dirtyStatus === 'unavailable' ? 'unavailable' : Boolean(dirtyStatus),
  },
  platform: {
    hostname: hostname(),
    os: `${platform()} ${release()} (${arch()})`,
    cpu: cpus()[0]?.model ?? 'unavailable',
    cpuCount: cpus().length,
    node: process.version,
  },
  method: {
    command: 'astro build --outDir benchmark-dist',
    measuredInterval: 'Astro child-process wall time; source-copy setup is excluded.',
    sourceCopy: 'Copies the current working tree, including untracked source changes.',
    excludedFromCopy: [...ignoredSourceEntries],
    cold: 'New disposable copy with empty .astro, node_modules/.astro, and node_modules/.vite caches.',
    warm: 'Immediately follows its cold partner in the same disposable copy and reuses its project, Astro, and Vite caches.',
    limitations: [
      'This does not clear operating-system file caches, Node module code already resident in memory, or caches outside the disposable copy.',
      'One cold/warm pair is a diagnostic sample, not a statistical performance benchmark; use --runs for independent pairs.',
      'Authored draft content is copied. Astro production filtering remains the behavior under test.',
    ],
  },
  measurements,
}
await writeFile(join(output, 'benchmark.json'), `${JSON.stringify(report, null, 2)}\n`)
await writeFile(join(output, 'index.html'), readableHtml(report))

if (failure) throw failure
console.log(`Wrote ${measurements.length} measurements to ${output}`)
