#!/usr/bin/env node

import { createServer } from 'node:http'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, normalize } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import { launch } from 'chrome-launcher'
import lighthouse, { generateReport } from 'lighthouse'
import { chromium } from 'playwright'

const execFileAsync = promisify(execFile)
const gzipAsync = promisify(gzip)
const root = process.cwd()
const dist = join(root, 'dist')
const qualityRoot = join(root, 'artifacts', 'quality')
const config = JSON.parse(await readFile(join(root, 'quality.config.json'), 'utf8'))
const args = process.argv.slice(2)
const valueAfter = (name) => {
  const index = args.indexOf(name)
  const value = index === -1 ? undefined : args[index + 1]
  return value?.startsWith('--') ? undefined : value
}
const requestedLabel = valueAfter('--label')
const baseline = args.includes('--baseline')
const compression = valueAfter('--compression') ?? 'gzip'

if (args.includes('--help')) {
  console.log(
    'Usage: node scripts/quality-audit.mjs [--label name] [--baseline [name]] [--compression gzip|none]'
  )
  process.exit(0)
}
if (args.includes('--label') && !requestedLabel) {
  throw new Error('--label requires a label value.')
}
if (!['gzip', 'none'].includes(compression)) {
  throw new Error('--compression must be gzip or none.')
}

const safeLabel = (value) => {
  if (!value || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new Error('Labels must use letters, numbers, dots, underscores, or hyphens.')
  }
  return value
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const label = requestedLabel
  ? safeLabel(requestedLabel)
  : baseline
    ? safeLabel(valueAfter('--baseline') ?? `baseline-${stamp}`)
    : 'latest'
const output = join(qualityRoot, baseline ? 'baselines' : '', label)
await mkdir(output, { recursive: true })

async function git(args) {
  try {
    return (await execFileAsync('git', args, { cwd: root })).stdout.trim()
  } catch {
    return 'unavailable'
  }
}

async function sizeOf(directory) {
  let total = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    total += entry.isDirectory() ? await sizeOf(path) : (await stat(path)).size
  }
  return total
}

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
}

async function fileForRequest(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname)
  const relative = normalize(pathname.replace(/^\/+/, ''))
  if (relative.startsWith('..')) return null
  const candidates = [
    join(dist, relative),
    join(dist, `${relative}.html`),
    join(dist, relative, 'index.html'),
  ]
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate
    } catch {}
  }
  return null
}

function isCompressible(contentType) {
  return /^(text\/|application\/(?:json|javascript|xml)|image\/svg\+xml)/.test(contentType)
}

function acceptsGzip(header) {
  const gzip = header
    .toLowerCase()
    .split(',')
    .map((value) => value.trim())
    .find((value) => value.startsWith('gzip'))
  return Boolean(gzip && !/(?:^|;)\s*q=0(?:\.0*)?(?:;|$)/.test(gzip))
}

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const file = await fileForRequest(request.url ?? '/')
      if (!file) {
        response.writeHead(404).end('Not found')
        return
      }
      const contentType = mime[extname(file).toLowerCase()] ?? 'application/octet-stream'
      const original = await readFile(file)
      const shouldGzip =
        compression === 'gzip' &&
        acceptsGzip(request.headers['accept-encoding'] ?? '') &&
        isCompressible(contentType)
      const body = shouldGzip ? await gzipAsync(original) : original
      response.writeHead(200, {
        'content-type': contentType,
        'content-length': body.byteLength,
        ...(compression === 'gzip' && isCompressible(contentType)
          ? { vary: 'Accept-Encoding' }
          : {}),
        ...(shouldGzip ? { 'content-encoding': 'gzip' } : {}),
      })
      response.end(body)
    } catch {
      response.writeHead(500).end('Server error')
    }
  })
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Could not allocate a local quality-audit port.')
  return { server, baseURL: `http://127.0.0.1:${address.port}` }
}

function resourceType(resource) {
  try {
    const pathname = new URL(resource.url ?? resource.name).pathname.toLowerCase()
    if (/\.(?:m?js)$/.test(pathname)) return 'script'
    if (/\.css$/.test(pathname)) return 'link'
    if (/\.(?:avif|gif|jpe?g|png|svg|webp)$/.test(pathname)) return 'img'
    if (/\.(?:otf|ttf|woff2?)$/.test(pathname)) return 'font'
  } catch {}
  return resource.initiatorType
}

function sumsByType(resources, sizeKey) {
  return Object.fromEntries(
    ['script', 'link', 'img', 'font'].map((type) => [
      type,
      resources
        .filter((entry) => resourceType(entry) === type)
        .reduce((sum, entry) => sum + entry[sizeKey], 0),
    ])
  )
}

async function measure(browser, url, route, screenshots) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.__qualityCLS = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (!entry.hadRecentInput) window.__qualityCLS += entry.value
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]?.toJSON()
    const paints = Object.fromEntries(
      performance.getEntriesByType('paint').map((entry) => [entry.name, entry.startTime])
    )
    const resources = performance.getEntriesByType('resource').map((entry) => {
      const item = entry.toJSON()
      return {
        name: item.name,
        initiatorType: item.initiatorType,
        duration: item.duration,
        transferSize: item.transferSize,
        encodedBodySize: item.encodedBodySize,
        decodedBodySize: item.decodedBodySize,
      }
    })
    const external = resources
      .filter((entry) => new URL(entry.name).origin !== location.origin)
      .map((entry) => entry.name)
    return {
      navigation: nav,
      paints,
      cumulativeLayoutShift: window.__qualityCLS,
      resources,
      external,
    }
  })
  const screenshotInteraction = await page.evaluate(
    async (initialResources) => {
      const images = [...document.images]
      for (let offset = 0; offset < document.documentElement.scrollHeight; offset += innerHeight) {
        window.scrollTo(0, offset)
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      await Promise.all(images.map((image) => image.decode().catch(() => undefined)))
      const initial = new Set(initialResources)
      const addedResources = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => !initial.has(name))
      return {
        loadedImageCount: images.filter((image) => image.complete && image.naturalWidth > 0).length,
        addedResources,
        cumulativeLayoutShift: window.__qualityCLS,
      }
    },
    metrics.resources.map((entry) => entry.name)
  )
  await page.screenshot({ path: join(output, `${screenshots}-mobile.png`), fullPage: true })
  if (route.path !== '/') {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.screenshot({ path: join(output, `${screenshots}-below-fold.png`) })
  }
  if (route.path === '/') {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: join(output, `${screenshots}-desktop.png`), fullPage: true })
  }
  await context.close()
  const resources = metrics.resources.map((entry) => ({ ...entry, url: entry.name }))
  const initial = {
    ...metrics,
    resourceTransferByType: sumsByType(resources, 'transferSize'),
    resourceDecodedByType: sumsByType(resources, 'decodedBodySize'),
    externalImageOrFontRequests: resources
      .filter(
        (entry) =>
          ['img', 'font'].includes(resourceType(entry)) && metrics.external.includes(entry.url)
      )
      .map((entry) => entry.url),
  }
  return { initial, screenshotInteraction }
}

function budgetFailures(route, measurement) {
  const limits = {
    script: route.maxJavaScriptDecodedBytes,
    link: route.maxCssTransferBytes,
    img: route.maxImageTransferBytes,
  }
  return Object.entries(limits).flatMap(([type, maximum]) => {
    const size =
      type === 'script'
        ? measurement.resourceDecodedByType[type]
        : measurement.resourceTransferByType[type]
    const unit = type === 'script' ? 'decoded body' : 'transfer'
    return size > maximum ? [`${route.path}: ${type} ${unit} ${size} exceeds ${maximum} bytes`] : []
  })
}

function lighthouseSummary(lhr) {
  const metrics = Object.fromEntries(
    [
      'first-contentful-paint',
      'largest-contentful-paint',
      'speed-index',
      'total-blocking-time',
      'cumulative-layout-shift',
      'interactive',
    ].map((id) => {
      const audit = lhr.audits[id]
      return [
        id,
        audit
          ? { numericValue: audit.numericValue ?? null, displayValue: audit.displayValue ?? null }
          : null,
      ]
    })
  )
  const failingAuditIds = lhr.categories.performance.auditRefs
    .map(({ id }) => ({ id, audit: lhr.audits[id] }))
    .filter(({ audit }) => audit?.score !== null && audit?.score !== undefined && audit.score < 1)
    .map(({ id, audit }) => ({
      id,
      title: audit.title,
      score: audit.score,
      numericValue: audit.numericValue ?? null,
      displayValue: audit.displayValue ?? null,
    }))
  return { metrics, failingAuditIds }
}

async function run() {
  const distBytes = await sizeOf(dist)
  const astroBytes = await sizeOf(join(dist, '_astro'))
  const serverState = await startStaticServer()
  let browser
  let chrome
  try {
    browser = await chromium.launch({ headless: true })
    const routes = []
    for (const route of config.routes) {
      const url = `${serverState.baseURL}${route.path}`
      const native = await measure(
        browser,
        url,
        route,
        route.path === '/' ? 'home' : basename(route.path)
      )
      routes.push({ path: route.path, native })
    }
    chrome = await launch({
      chromePath: chromium.executablePath(),
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
    })
    for (const route of routes) {
      const result = await lighthouse(`${serverState.baseURL}${route.path}`, {
        port: chrome.port,
        onlyCategories: config.lighthouse.categories,
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 1.75,
          disabled: false,
        },
      })
      if (!result) throw new Error(`Lighthouse did not return a result for ${route.path}.`)
      const artifactName = `lighthouse-${route.path === '/' ? 'home' : basename(route.path)}`
      await writeFile(
        join(output, `${artifactName}.json`),
        `${JSON.stringify(result.lhr, null, 2)}\n`
      )
      await writeFile(join(output, `${artifactName}.html`), generateReport(result.lhr, 'html'))
      route.lighthouse = Object.fromEntries(
        config.lighthouse.categories.map((category) => [
          category,
          result.lhr.categories[category]?.score ?? null,
        ])
      )
      route.lighthouseDetails = {
        ...lighthouseSummary(result.lhr),
        json: `${artifactName}.json`,
        html: `${artifactName}.html`,
      }
    }
    const failures = [
      ...(distBytes > config.site.maxDistBytes
        ? [`dist size ${distBytes} exceeds ${config.site.maxDistBytes} bytes`]
        : []),
      ...(astroBytes > config.site.maxAstroBytes
        ? [`dist/_astro size ${astroBytes} exceeds ${config.site.maxAstroBytes} bytes`]
        : []),
      ...routes.flatMap((route) =>
        budgetFailures(
          config.routes.find((item) => item.path === route.path),
          route.native.initial
        )
      ),
      ...routes.flatMap((route) =>
        Object.entries(config.lighthouse.scoreFloors).flatMap(([category, floor]) =>
          route.lighthouse[category] !== null && route.lighthouse[category] < floor
            ? [
                `${route.path}: Lighthouse ${category} score ${route.lighthouse[category]} is below ${floor}`,
              ]
            : []
        )
      ),
    ]
    const report = {
      generatedAt: new Date().toISOString(),
      label,
      baseline,
      environment: {
        node: process.version,
        browser: browser.version(),
        gitRevision: await git(['rev-parse', 'HEAD']),
        gitDirty: Boolean(await git(['status', '--porcelain'])),
      },
      server: {
        baseURL: serverState.baseURL,
        compression,
        note: 'This audit serves dist with an owned local static server. It is not Cloudflare Pages or deployment verification.',
      },
      byteDefinitions: {
        transferSize:
          'Network transfer bytes reported by Resource Timing, including response headers where available.',
        encodedBodySize: 'Encoded response body bytes, typically compressed on the wire.',
        decodedBodySize: 'Decoded response body bytes after content decoding.',
      },
      site: { distBytes, astroBytes },
      routes,
      failures,
      limitations: [
        'Lighthouse and native timing are repeatable local lab observations, not real-user data.',
        'No field INP is reported; field interaction data requires a real-user measurement source.',
      ],
    }
    await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    const rows = routes
      .map(
        (route) =>
          `<tr><th>${route.path}</th>${Object.values(route.lighthouse)
            .map((score) => `<td>${score === null ? 'n/a' : Math.round(score * 100)}</td>`)
            .join(
              ''
            )}<td>${Math.round(route.native.initial.cumulativeLayoutShift * 1000) / 1000}</td><td>${route.native.initial.resourceDecodedByType.script}</td></tr>`
      )
      .join('')
    const lighthouseDetails = routes
      .map(
        (route) =>
          `<section><h2>${route.path}</h2><p><a href="${route.lighthouseDetails.html}">Full Lighthouse HTML</a> · <a href="${route.lighthouseDetails.json}">Full Lighthouse JSON</a></p><dl>${Object.entries(
            route.lighthouseDetails.metrics
          )
            .map(
              ([id, metric]) =>
                `<dt>${id}</dt><dd>${metric?.displayValue ?? 'n/a'} (${metric?.numericValue ?? 'n/a'})</dd>`
            )
            .join(
              ''
            )}</dl><h3>Performance audits below 1.0</h3><ul>${route.lighthouseDetails.failingAuditIds.map((audit) => `<li><code>${audit.id}</code>: ${audit.displayValue ?? audit.score}</li>`).join('') || '<li>None</li>'}</ul></section>`
      )
      .join('')
    await writeFile(
      join(output, 'report.html'),
      `<!doctype html><meta charset="utf-8"><title>cade.io quality audit</title><style>body{font:16px system-ui;margin:2rem;max-width:80rem}table{border-collapse:collapse}td,th{border:1px solid #999;padding:.5rem;text-align:left}dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem}.fail{color:#b00}</style><h1>cade.io quality audit</h1><p>${report.generatedAt}; ${report.environment.gitRevision}${report.environment.gitDirty ? ' (dirty)' : ''}</p><p>Local static serving only (${compression}); this does not verify Cloudflare Pages or a deployment. Lighthouse performance floor: ${config.lighthouse.scoreFloors.performance * 100}; report goal: ${config.lighthouse.scoreGoals.performance * 100}.</p><p>Table values are native initial-navigation observations, captured before scrolling or screenshots. Screenshot interaction observations are separate in <code>report.json</code>.</p><table><thead><tr><th>route</th><th>performance</th><th>accessibility</th><th>best practices</th><th>SEO</th><th>initial CLS</th><th>initial JS decoded-body bytes</th></tr></thead><tbody>${rows}</tbody></table><h2>Failures</h2><ul class="fail">${failures.map((failure) => `<li>${failure}</li>`).join('') || '<li>None</li>'}</ul>${lighthouseDetails}<p>Sizes: transfer includes network transfer; encoded is compressed body; decoded is uncompressed body. JavaScript budgets use decoded-body bytes; CSS and image budgets use transfer bytes. No field INP is claimed.</p>`
    )
    console.log(`Quality report: ${join(output, 'report.html')}`)
    if (failures.length) {
      console.error(failures.join('\n'))
      process.exitCode = 1
    }
  } finally {
    chrome?.kill()
    await browser?.close()
    await new Promise((resolveClose) => serverState.server.close(resolveClose))
  }
}

await run()
