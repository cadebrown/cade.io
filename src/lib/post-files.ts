import { lstat, readFile, readdir } from 'node:fs/promises'
import { resolve, join, extname } from 'node:path'
import { Zip, ZipDeflate } from 'fflate'

export type FileOptions = Record<
  string,
  { label?: string; description?: string; exclude?: boolean }
>
export interface PostFile {
  sourcePath: string
  relativePath: string
  name: string
  outputName: string
  url: string
  label: string
  description?: string
  size: number
  mime: string
}
export const postRoot = resolve('content/posts')
const junk = new Set(['node_modules', '__pycache__', 'Thumbs.db', 'desktop.ini'])
const mimeTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.md': 'text/markdown; charset=utf-8',
  '.mdx': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.py': 'text/plain; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.astro': 'text/plain; charset=utf-8',
  '.mjs': 'text/plain; charset=utf-8',
  '.js': 'text/plain; charset=utf-8',
  '.rs': 'text/plain; charset=utf-8',
}

export function assertSafePath(value: string): void {
  if (
    !value ||
    value
      .split('/')
      .some(
        (segment) =>
          !/^[a-zA-Z0-9_][a-zA-Z0-9._-]*$/.test(segment) ||
          segment === '..' ||
          segment.endsWith('.')
      )
  ) {
    throw new Error(`Unsafe post file path: ${value}`)
  }
}
export function postUrl(id: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Invalid post slug: ${id}`)
  return `/posts/${id}`
}
export function resolvePostLink(id: string, url: string): string {
  if (!url || /^(?:[a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(url)) return url
  const match = /^([^?#]+)(.*)$/.exec(url)
  if (!match) return url
  const path = match[1]!.replace(/^\.\//, '')
  assertSafePath(path)
  const name = path === 'index.mdx' ? `${id}.mdx` : path === 'index.md' ? `${id}.md` : path
  return `${postUrl(id)}/${fileOutputName(name)}${match[2]}`
}

/** Avoid Cloudflare's HTML page normalization while retaining the saved/ZIP filename. */
export function fileOutputName(name: string): string {
  return /\.html?$/i.test(name) ? `${name}.txt` : name
}

export function archiveName(id: string): string {
  postUrl(id)
  return `${id}-files.zip`
}

/** The file list and static endpoints share this inventory, including all exclusions. */
export async function discoverPostFiles(
  id: string,
  options: FileOptions = {},
  root = postRoot
): Promise<PostFile[]> {
  const baseUrl = postUrl(id)
  const folder = join(root, id)
  if ((await lstat(folder)).isSymbolicLink())
    throw new Error(`Post folder must not be a symlink: ${folder}`)
  const outputs = new Set([archiveName(id).toLowerCase()])
  const seenSources = new Set<string>()
  const files: PostFile[] = []
  async function walk(relative = ''): Promise<void> {
    for (const entry of (await readdir(join(folder, relative), { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name)
    )) {
      if (entry.name.startsWith('.') || junk.has(entry.name) || entry.name.endsWith('~')) continue
      const local = relative ? `${relative}/${entry.name}` : entry.name
      assertSafePath(local)
      seenSources.add(local)
      const metadata = Object.hasOwn(options, local) ? options[local] : undefined
      if (metadata?.exclude) continue
      const sourcePath = join(folder, local)
      if (entry.isSymbolicLink()) throw new Error(`Post files must not be symlinks: ${sourcePath}`)
      if (entry.isDirectory()) {
        await walk(local)
        continue
      }
      if (!entry.isFile()) throw new Error(`Unsupported post file: ${sourcePath}`)
      const name = local === 'index.mdx' ? `${id}.mdx` : local === 'index.md' ? `${id}.md` : local
      assertSafePath(name)
      const outputName = fileOutputName(name)
      const folded = outputName.toLowerCase()
      if (outputs.has(folded)) throw new Error(`Post file URL collision: ${baseUrl}/${name}`)
      for (const existing of outputs) {
        if (existing.startsWith(`${folded}/`) || folded.startsWith(`${existing}/`))
          throw new Error(`Post file/directory collision: ${baseUrl}/${name}`)
      }
      outputs.add(folded)
      files.push({
        sourcePath,
        relativePath: local,
        name,
        outputName,
        url: `${baseUrl}/${outputName}`,
        label: metadata?.label ?? name,
        description: metadata?.description,
        size: (await lstat(sourcePath)).size,
        mime: mimeTypes[extname(outputName).toLowerCase()] ?? 'application/octet-stream',
      })
    }
  }
  await walk()
  for (const source of Object.keys(options)) {
    assertSafePath(source)
    if (!seenSources.has(source))
      throw new Error(`File metadata references missing file: ${id}/${source}`)
  }
  return files.sort((a, b) => a.name.localeCompare(b.name))
}

/** Fixed timestamps and ordering make archives reproducible across builds. */
export async function createPostArchive(files: PostFile[]): Promise<Uint8Array> {
  const sources = await Promise.all(files.map((file) => readFile(file.sourcePath)))
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    const archive = new Zip((error, chunk, final) => {
      if (error) return reject(error)
      chunks.push(chunk)
      if (final) resolve(new Uint8Array(Buffer.concat(chunks)))
    })
    // Named entries avoid zipSync's object-key flattening of filenames such as __proto__.
    files.forEach((file, index) => {
      const entry = new ZipDeflate(file.name, { level: 6 })
      entry.mtime = new Date(2000, 0, 1)
      archive.add(entry)
      entry.push(sources[index]!, true)
    })
    archive.end()
  })
}

export type PostDownloadHeader = Pick<PostFile, 'url' | 'name' | 'mime'>

/** Host headers use original-file metadata; a .html.txt URL alone cannot reveal its saved name. */
export function serializePostDownloadHeaders(files: readonly PostDownloadHeader[]): string {
  const headers = files
    .filter(
      (file) =>
        file.mime.startsWith('text/') ||
        ['application/json', 'application/octet-stream', 'application/zip'].includes(
          file.mime.split(';')[0]!
        )
    )
    .sort((a, b) => a.url.localeCompare(b.url))
    .map((file) => {
      assertSafePath(file.name)
      if (!file.url.startsWith('/'))
        throw new Error(`Expected an absolute download URL: ${file.url}`)
      assertSafePath(file.url.slice(1))
      if (/[\r\n]/.test(file.mime)) throw new Error(`Invalid download MIME type: ${file.mime}`)
      return `${file.url}\n  Content-Type: ${file.mime}\n  Content-Disposition: attachment; filename="${file.name.split('/').at(-1)}"\n  X-Content-Type-Options: nosniff`
    })
  return headers.length ? `${headers.join('\n\n')}\n` : ''
}
