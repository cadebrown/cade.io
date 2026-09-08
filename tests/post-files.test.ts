import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Unzip, UnzipInflate, unzipSync } from 'fflate'
import {
  assertSafePath,
  createPostArchive,
  discoverPostFiles,
  postUrl,
  resolvePostLink,
  serializePostDownloadHeaders,
} from '../src/lib/post-files'

const roots: string[] = []
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'cade-post-files-'))
  roots.push(root)
  await mkdir(join(root, 'example'))
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(root, 'example', name.split('/').slice(0, -1).join('/')), { recursive: true })
    await writeFile(join(root, 'example', name), content)
  }
  return root
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('post file publication', () => {
  it('preserves prototype-like filenames and bytes in archives', async () => {
    const originals = Object.fromEntries(
      ['__proto__', 'constructor', 'toString'].map((name) => [name, `Original ${name}`])
    )
    const root = await fixture(originals)
    const files = await discoverPostFiles('example', {}, root)
    const extracted = new Map<string, string>()
    const reader = new Unzip((file) => {
      const chunks: Uint8Array[] = []
      file.ondata = (error, chunk, final) => {
        if (error) throw error
        chunks.push(chunk)
        if (final) extracted.set(file.name, Buffer.concat(chunks).toString())
      }
      file.start()
    })
    reader.register(UnzipInflate)
    reader.push(await createPostArchive(files), true)
    expect(Object.fromEntries(extracted)).toEqual(originals)
    expect(files.map((file) => file.label)).toEqual(files.map((file) => file.name))
  })
  it('uses semantic source names, stable nested URLs, original bytes, and one exclusion policy', async () => {
    const root = await fixture({
      'index.mdx': '# Example',
      'results/data.csv': 'x,y\n1,2\n',
      '.DS_Store': 'junk',
      '.hidden/private': 'hidden',
      'notes.txt': 'omit',
      'node_modules/local.js': 'junk',
    })
    const files = await discoverPostFiles('example', { 'notes.txt': { exclude: true } }, root)
    expect(files.map((file) => file.url)).toEqual([
      '/posts/example/example.mdx',
      '/posts/example/results/data.csv',
    ])
    expect(files.find((file) => file.name.endsWith('.csv'))?.mime).toBe('text/csv; charset=utf-8')
    const zip = unzipSync(await createPostArchive(files))
    expect(Object.keys(zip)).toEqual(['example.mdx', 'results/data.csv'])
    for (const file of files)
      expect(Buffer.from(zip[file.name]!)).toEqual(await readFile(file.sourcePath))
    expect(await createPostArchive(files)).toEqual(await createPostArchive(files))
  })
  it.each([
    '../escape',
    '/absolute',
    'file%2fsecret',
    'a//b',
    'a/../b',
    'foo\\bar',
    'name?x',
    'foo.',
    'foo\n',
  ])('rejects ambiguous paths: %s', (value) => {
    expect(() => assertSafePath(value)).toThrow('Unsafe')
  })
  it.each(['../example', 'Example', 'one/two'])('rejects unsafe slug %s', (id) =>
    expect(() => postUrl(id)).toThrow()
  )
  it('rejects case-insensitive output collisions', async () => {
    const root = await fixture({ 'index.mdx': '# Example', 'EXAMPLE.mdx': 'collision' })
    await expect(discoverPostFiles('example', {}, root)).rejects.toThrow('collision')
  })
  it.each(['example-files.zip', 'example.mdx'])('reserves generated names: %s', async (name) => {
    const root = await fixture({ 'index.mdx': '# Example', [name]: 'collision' })
    await expect(discoverPostFiles('example', {}, root)).rejects.toThrow('collision')
  })
  it('publishes HTML source as plain text while retaining the saved and ZIP names', async () => {
    const root = await fixture({
      'index.mdx': '# Example',
      'index.html': '<h1>Example</h1>',
      'examples/demo.htm': '<p>Demo</p>',
    })
    const files = await discoverPostFiles('example', {}, root)
    const html = files.find((file) => file.name === 'index.html')!
    expect(html.outputName).toBe('index.html.txt')
    expect(html.url).toBe('/posts/example/index.html.txt')
    expect(html.mime).toBe('text/plain; charset=utf-8')
    const nested = files.find((file) => file.name === 'examples/demo.htm')!
    expect(nested.outputName).toBe('examples/demo.htm.txt')
    const zip = unzipSync(await createPostArchive(files))
    expect(Buffer.from(zip['index.html']!).toString()).toBe('<h1>Example</h1>')
    expect(zip['index.html.txt']).toBeUndefined()
  })
  it('rejects HTML transport-name collisions', async () => {
    const root = await fixture({
      'index.mdx': '# Example',
      'demo.html': '<p>Demo</p>',
      'demo.html.txt': 'collision',
    })
    await expect(discoverPostFiles('example', {}, root)).rejects.toThrow('collision')
  })
  it('rejects file/directory output collisions', async () => {
    const root = await fixture({
      'index.mdx': '# Example',
      'example-files.zip/nested.txt': 'collision',
    })
    await expect(discoverPostFiles('example', {}, root)).rejects.toThrow('collision')
  })
  it('rejects symlinks instead of publishing files outside a post', async () => {
    const root = await fixture({ 'index.mdx': '# Example' })
    await symlink(join(root, 'example', 'index.mdx'), join(root, 'example', 'linked.mdx'))
    await expect(discoverPostFiles('example', {}, root)).rejects.toThrow('symlink')
  })
  it('rejects stale file metadata', async () => {
    const root = await fixture({ 'index.mdx': '# Example' })
    await expect(
      discoverPostFiles('example', { 'absent.txt': { label: 'Absent' } }, root)
    ).rejects.toThrow('missing file')
  })
})

describe('slashless post links', () => {
  it.each([
    ['./paper.pdf#page=2', '/posts/example/paper.pdf#page=2'],
    ['index.mdx', '/posts/example/example.mdx'],
    ['./index.html', '/posts/example/index.html.txt'],
    ['examples/demo.htm#source', '/posts/example/examples/demo.htm.txt#source'],
    ['nested/data.csv?raw=1', '/posts/example/nested/data.csv?raw=1'],
    ['https://example.com/foo', 'https://example.com/foo'],
    ['#section', '#section'],
    ['/about', '/about'],
  ])('resolves %s to %s', (input, expected) => {
    expect(resolvePostLink('example', input)).toBe(expected)
  })
})

describe('metadata-derived host download headers', () => {
  it('distinguishes converted HTML source from a genuinely authored html.txt filename', async () => {
    const root = await fixture({
      'index.mdx': '# Example',
      'converted/demo.html': '<p>Demo</p>',
      'authored/demo.html.txt': 'Documented HTML source',
    })
    const files = await discoverPostFiles('example', {}, root)
    const html = files.find((file) => file.name === 'converted/demo.html')!
    const text = files.find((file) => file.name === 'authored/demo.html.txt')!
    expect(html.url).toBe('/posts/example/converted/demo.html.txt')
    expect(text.url).toBe('/posts/example/authored/demo.html.txt')
    const blocks = serializePostDownloadHeaders(files).split('\n\n')
    expect(blocks.find((block) => block.startsWith(html.url))).toContain('filename="demo.html"')
    expect(blocks.find((block) => block.startsWith(text.url))).toContain('filename="demo.html.txt"')
    expect(blocks.find((block) => block.startsWith(text.url))).not.toContain('filename="demo.html"')
  })
  it('uses discovered exclusions and semantic basenames, retaining inline media and PDFs', async () => {
    const root = await fixture({
      'index.mdx': '# Example',
      'nested/demo.htm': '<p>Demo</p>',
      'omit.txt': 'Excluded',
      'chart.svg': '<svg/>',
      'paper.pdf': '%PDF',
      'data.json': '{}',
      'measurements.bin': 'original bytes',
    })
    const files = await discoverPostFiles('example', { 'omit.txt': { exclude: true } }, root)
    const headers = serializePostDownloadHeaders([
      ...files,
      {
        name: 'example-files.zip',
        url: '/posts/example/example-files.zip',
        mime: 'application/zip',
      },
    ])
    expect(headers).toContain(
      '/posts/example/nested/demo.htm.txt\n  Content-Type: text/plain; charset=utf-8\n  Content-Disposition: attachment; filename="demo.htm"'
    )
    expect(headers).toContain('filename="example.mdx"')
    expect(headers).toContain('filename="example-files.zip"')
    expect(headers).toContain('filename="data.json"')
    expect(headers).toContain('filename="measurements.bin"')
    expect(headers).toContain('X-Content-Type-Options: nosniff')
    for (const omitted of ['omit.txt', 'chart.svg', 'paper.pdf'])
      expect(headers).not.toContain(omitted)
  })
})
