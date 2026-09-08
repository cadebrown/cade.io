// Inspect the current source and local production build; never refresh the historical baseline.
// Run from the repository root after building: node scripts/inventory-urls.mjs
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { htmlToHast } from 'satteri'
import { fileOutputName, postUrl } from '../src/lib/post-files.ts'
import { discoverSharedAssets } from '../src/lib/shared-assets.ts'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const output = join(root, 'artifacts/current-url-inventory.json')
const origin = 'https://cade.io'
const toPosix = (value) => value.replaceAll('\\', '/')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const sourcePath = (file) => toPosix(relative(root, file))

async function walk(folder, { authored = false } = {}) {
  const files = []
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (
      authored &&
      (entry.name.startsWith('.') ||
        ['node_modules', '__pycache__', 'Thumbs.db', 'desktop.ini'].includes(entry.name) ||
        entry.name.endsWith('~'))
    )
      continue
    const file = join(folder, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Inventory will not follow a symlink: ${file}`)
    if (entry.isDirectory()) files.push(...(await walk(file, { authored })))
    else if (entry.isFile()) files.push(file)
  }
  return files.sort()
}

async function fileDetails(file) {
  const bytes = await readFile(file)
  return { bytes: bytes.length, sha256: hash(bytes) }
}

let builtFiles
try {
  builtFiles = await walk(dist)
} catch (error) {
  if (error.code === 'ENOENT')
    throw new Error('No production build found. Run npm run build first.')
  throw error
}
const builtByPath = new Map(builtFiles.map((file) => [`/${toPosix(relative(dist, file))}`, file]))
const canonicalPage = (pathname) =>
  pathname === '/index.html'
    ? '/'
    : pathname === '/404.html'
      ? pathname
      : pathname.replace(/\/index\.html$/, '').replace(/\.html$/, '')
const redirects = (await readFile(join(dist, '_redirects'), 'utf8'))
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const [from, to, status] = line.split(/\s+/)
    return { from, to, status: Number(status) }
  })
const redirectMap = new Map(redirects.map((redirect) => [redirect.from, redirect]))
function targetFor(pathname) {
  const clean = pathname === '/' ? '' : pathname.replace(/\/$/, '')
  return [pathname, `${clean}.html`, `${clean}/index.html`].find((candidate) =>
    builtByPath.has(candidate)
  )
}
function resolveTarget(pathname) {
  const chain = [],
    visited = new Set()
  while (redirectMap.has(pathname)) {
    if (visited.has(pathname)) return { found: false, chain, error: 'redirect-cycle' }
    visited.add(pathname)
    const redirect = redirectMap.get(pathname)
    chain.push(redirect)
    if (!redirect.to.startsWith('/')) return { found: true, chain, external: redirect.to }
    pathname = redirect.to
  }
  const builtPath = targetFor(pathname)
  return { found: Boolean(builtPath), chain, pathname, builtPath }
}

const pages = [],
  references = [],
  pageIds = new Map()
for (const [builtPath, file] of builtByPath) {
  if (!builtPath.endsWith('.html')) continue
  const url = canonicalPage(builtPath),
    ids = new Set()
  const tree = htmlToHast(await readFile(file, 'utf8'))
  const visit = (node) => {
    if (node.type === 'element') {
      const props = node.properties
      if (props.id) ids.add(String(props.id))
      if (node.tagName === 'a' && props.name) ids.add(String(props.name))
      for (const attribute of ['href', 'src', 'poster']) {
        if (typeof props[attribute] === 'string')
          references.push({ from: url, attribute, value: props[attribute] })
      }
      const srcset = props.srcSet ?? props.srcset
      if (typeof srcset === 'string' && !srcset.startsWith('data:')) {
        for (const candidate of srcset.split(','))
          references.push({
            from: url,
            attribute: 'srcset',
            value: candidate.trim().split(/\s+/)[0],
          })
      }
    }
    if (node.children) node.children.forEach(visit)
  }
  visit(tree)
  pageIds.set(builtPath, ids)
  pages.push({ url, output: `dist${builtPath}`, ...(await fileDetails(file)) })
}
const broken = new Map(),
  brokenFragments = []
for (const reference of references) {
  let url
  try {
    url = new URL(reference.value, `${origin}${reference.from}`)
  } catch {
    continue
  }
  if (url.origin !== origin) continue
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    pathname = url.pathname
  }
  const target = resolveTarget(pathname)
  if (!target.found) {
    const record = broken.get(pathname) ?? { url: pathname, references: [] }
    record.references.push(reference)
    broken.set(pathname, record)
  } else if (url.hash && target.builtPath && pageIds.has(target.builtPath)) {
    let fragment
    try {
      fragment = decodeURIComponent(url.hash.slice(1))
    } catch {
      fragment = url.hash.slice(1)
    }
    if (fragment && !fragment.startsWith(':~:') && !pageIds.get(target.builtPath).has(fragment))
      brokenFragments.push({ ...reference, target: pathname, fragment })
  }
}

const { assets: shared } = await discoverSharedAssets(join(root, 'src/assets'))
const sources = []
async function recordSource(source, url, owner) {
  const details = await fileDetails(join(root, source)),
    builtFile = builtByPath.get(url)
  const built = builtFile ? await fileDetails(builtFile) : null
  sources.push({
    source,
    owner,
    url,
    ...details,
    emitted: Boolean(built),
    matchesOriginal: built ? built.sha256 === details.sha256 : null,
  })
}
for (const asset of shared) await recordSource(sourcePath(asset.sourcePath), asset.url, 'shared')
for (const file of await walk(join(root, 'public'), { authored: true })) {
  await recordSource(
    sourcePath(file),
    `/${toPosix(relative(join(root, 'public'), file))}`,
    'platform'
  )
}
const posts = []
for (const entry of await readdir(join(root, 'content/posts'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const id = entry.name,
    url = postUrl(id),
    folder = join(root, 'content/posts', id)
  const files = await walk(folder, { authored: true })
  const sourceEntry = files.find((file) => /^index\.mdx?$/.test(relative(folder, file)))
  if (!sourceEntry) continue
  posts.push({
    id,
    source: sourcePath(sourceEntry),
    url,
    publishedInBuild: Boolean(targetFor(url)),
    archive: `${url}/${id}-files.zip`,
  })
  for (const file of files) {
    const local = toPosix(relative(folder, file))
    const name = local === 'index.mdx' ? `${id}.mdx` : local === 'index.md' ? `${id}.md` : local
    await recordSource(sourcePath(file), `${url}/${fileOutputName(name)}`, id)
  }
}
const sitemapPaths = []
for (const [pathname, file] of builtByPath) {
  if (!/^\/sitemap-\d+\.xml$/.test(pathname)) continue
  for (const match of (await readFile(file, 'utf8')).matchAll(/<loc>(.*?)<\/loc>/g))
    sitemapPaths.push(new URL(match[1]).pathname)
}
const baseline = JSON.parse(await readFile(join(root, 'docs/url-inventory.json'), 'utf8'))
const baselineCoverage = [...baseline.pages, ...baseline.publicFiles].map((item) => ({
  before: item.current,
  ...resolveTarget(item.current),
  exception: item.draft
    ? 'Historical draft route: intentionally withheld from production.'
    : undefined,
}))
const originalUrls = new Set(sources.map((source) => source.url))
const routes = [...builtByPath.keys()]
  .filter((pathname) => !['/_headers', '/_redirects'].includes(pathname))
  .map((pathname) => ({
    url: pathname.endsWith('.html') ? canonicalPage(pathname) : pathname,
    output: `dist${pathname}`,
    kind: pathname.endsWith('.html')
      ? 'page'
      : originalUrls.has(pathname)
        ? 'original'
        : pathname.startsWith('/_astro/')
          ? 'generated-internal'
          : pathname.endsWith('-files.zip')
            ? 'post-archive'
            : 'generated-or-platform',
  }))
const inventory = {
  capturedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  workingTreeDirty: Boolean(
    execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
  ),
  origin,
  evidence:
    'Current source files and local dist only; no network requests or deployment verification. The build may be stale relative to the working tree.',
  scope:
    'Checks same-origin HTML href/src/poster/srcset paths and HTML fragments, exact host redirects, and original file hashes. Does not crawl external URLs, CSS references, or JavaScript-generated links.',
  sourcePolicy:
    'Includes authored post source candidates. emitted=false may indicate a draft, an explicit files exclusion, or a stale build; publication is observed from dist rather than reparsing frontmatter.',
  routes,
  pages,
  posts,
  sitemapPaths,
  redirects,
  redirectProblems: redirects
    .map((item) => ({ ...item, ...resolveTarget(item.from) }))
    .filter((item) => !item.found || item.chain.length > 1),
  sourceFiles: sources,
  brokenInternalLinks: [...broken.values()],
  brokenFragments,
  baselineCoverage,
  generatedBuildAssets: [...builtByPath.keys()].filter((pathname) =>
    pathname.startsWith('/_astro/')
  ),
}
await mkdir(dirname(output), { recursive: true })
try {
  if ((await lstat(output)).isSymbolicLink()) throw new Error(`Refusing symlink output: ${output}`)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
await writeFile(output, `${JSON.stringify(inventory, null, 2)}\n`)
console.log(
  JSON.stringify({
    output: sourcePath(output),
    pages: pages.length,
    posts: posts.length,
    sourceFiles: sources.length,
    redirects: redirects.length,
    brokenInternalLinks: broken.size,
    brokenFragments: brokenFragments.length,
    redirectProblems: inventory.redirectProblems.length,
    originalMismatches: sources.filter((source) => source.matchesOriginal === false).length,
  })
)
