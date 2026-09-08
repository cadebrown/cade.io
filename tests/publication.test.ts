import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { unzipSync } from 'fflate'
import { createHash } from 'node:crypto'
import { discoverPostFiles } from '../src/lib/post-files'

const root = resolve('content/posts')
const dist = resolve('dist')
const posts = readdirSync(root).map((id) => ({
  id,
  source: readFileSync(join(root, id, 'index.mdx'), 'utf8'),
}))
const published = posts.filter((post) => !/^draft:\s*true\s*$/m.test(post.source.split('---')[1]!))
const drafts = posts.filter((post) => !published.includes(post))
const read = (file: string) => readFileSync(join(dist, file), 'utf8')
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

describe('published routes and originals', () => {
  it('excludes every draft page, original, archive, feed entry and sitemap entry', () => {
    const feed = read('rss.xml'),
      sitemap = read('sitemap-0.xml'),
      listing = read('posts.html')
    for (const { id } of drafts) {
      expect(existsSync(join(dist, 'posts', `${id}.html`)), id).toBe(false)
      expect(existsSync(join(dist, 'posts', id)), id).toBe(false)
      for (const output of [feed, sitemap, listing]) expect(output).not.toContain(`/posts/${id}`)
    }
  })
  it('renders published posts in author listing with canonical post links', () => {
    const author = read('authors/cade-brown.html')
    for (const { id } of published) expect(author).toContain(`/posts/${id}`)
    for (const { id } of drafts) expect(author).not.toContain(`/posts/${id}`)
  })
  it('publishes every original byte-for-byte and exposes semantic filenames', async () => {
    for (const { id } of published) {
      const page = read(`posts/${id}.html`)
      const files = await discoverPostFiles(id)
      const archive = unzipSync(readFileSync(join(dist, 'posts', id, `${id}-files.zip`)))
      for (const file of files) {
        const original = readFileSync(file.sourcePath)
        expect(hash(readFileSync(join(dist, file.url))), file.url).toBe(hash(original))
        expect(hash(archive[file.name]!), file.name).toBe(hash(original))
        expect(page).toContain(`href="${file.url}"`)
        expect(page).toContain(`download="${file.name.split('/').at(-1)}"`)
      }
    }
  })
  it('uses final paths in feeds and canonical metadata', () => {
    const feed = read('rss.xml')
    expect(feed).not.toContain('/blog/')
    for (const { id } of published) {
      expect(feed).toContain(`/posts/${id}`)
      expect(read(`posts/${id}.html`)).toContain(`href="https://cade.io/posts/${id}"`)
    }
  })
  it('repairs the genuine PDF links and removes the unavailable dataset link', () => {
    expect(read('posts/magma-paper.html')).toContain(
      '/posts/magma-paper/dense-linear-algebra-amd-gpus-hpec-2020.pdf'
    )
    expect(read('posts/dataset-smcefr.html')).not.toMatch(/href="[^"]*smcefr-mini\.tar\.gz"/)
    expect(read('posts/dataset-smcefr.html')).toContain('not currently available')
  })
})
