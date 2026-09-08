import { lstat, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import config from '../data/shared-assets.json' with { type: 'json' }

export interface SharedAssetConfig {
  urls?: Record<string, string>
  aliases?: Record<string, string>
}

export interface SharedAsset {
  sourcePath: string
  relativePath: string
  url: string
}

const junk = new Set(['node_modules', '__pycache__', 'Thumbs.db', 'desktop.ini'])
function assertPath(value: string): void {
  if (!value || value.split('/').some((part) => !/^[\w][\w.-]*$/.test(part) || part.endsWith('.')))
    throw new Error(`Unsafe shared asset path: ${value}`)
}

/** Every authored shared file is published; configuration records exceptions and old addresses only. */
export async function discoverSharedAssets(
  root = resolve('src/assets'),
  { urls = {}, aliases = {} }: SharedAssetConfig = config
): Promise<{ assets: SharedAsset[]; aliases: Map<string, string> }> {
  if ((await lstat(root)).isSymbolicLink())
    throw new Error(`Shared asset root is a symlink: ${root}`)
  const assets: SharedAsset[] = []
  const outputs = new Set<string>()
  async function walk(relative = ''): Promise<void> {
    for (const entry of (await readdir(join(root, relative), { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name)
    )) {
      if (entry.name.startsWith('.') || junk.has(entry.name) || entry.name.endsWith('~')) continue
      const relativePath = relative ? `${relative}/${entry.name}` : entry.name
      assertPath(relativePath)
      const sourcePath = join(root, relativePath)
      if (entry.isSymbolicLink()) throw new Error(`Shared asset is a symlink: ${sourcePath}`)
      if (entry.isDirectory()) {
        await walk(relativePath)
        continue
      }
      if (!entry.isFile()) throw new Error(`Unsupported shared asset: ${sourcePath}`)
      const url = Object.hasOwn(urls, relativePath)
        ? urls[relativePath]!
        : `/assets/${relativePath}`
      if (!url.startsWith('/')) throw new Error(`Shared asset URL must be absolute: ${url}`)
      assertPath(url.slice(1))
      const folded = url.toLowerCase()
      for (const existing of outputs) {
        if (
          existing === folded ||
          existing.startsWith(`${folded}/`) ||
          folded.startsWith(`${existing}/`)
        )
          throw new Error(`Shared asset URL collision: ${url}`)
      }
      outputs.add(folded)
      assets.push({ sourcePath, relativePath, url })
    }
  }
  await walk()
  for (const name of Object.keys(urls)) {
    assertPath(name)
    if (!assets.some((asset) => asset.relativePath === name))
      throw new Error(`Shared asset URL override references missing file: ${name}`)
  }
  const canonical = new Set(assets.map((asset) => asset.url))
  const redirects = new Map(Object.entries(aliases))
  for (const [from, to] of redirects) {
    if (!from.startsWith('/')) throw new Error(`Shared asset alias must be absolute: ${from}`)
    assertPath(from.slice(1))
    if (outputs.has(from.toLowerCase()))
      throw new Error(`Shared asset alias shadows a file: ${from}`)
    if (!canonical.has(to))
      throw new Error(`Shared asset alias ${from} targets missing file: ${to}`)
  }
  return { assets, aliases: redirects }
}
