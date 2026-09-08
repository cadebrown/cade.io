import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { createHash } from 'node:crypto'
import inventory from '../docs/url-inventory.json'
import { canonicalPath } from '../src/lib/urls'

const output = 'dist'
const redirects = new Map(
  readFileSync(join(output, '_redirects'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const [from, to] = line.split(' ')
      return [from!, to!]
    })
)
function targetFile(url: string) {
  return [url, `${url}.html`, `${url.replace(/\/$/, '')}/index.html`]
    .map((p) => join(output, p))
    .find((p) => existsSync(p) && !readdirSafe(p))
}
function readdirSafe(file: string) {
  try {
    readdirSync(file)
    return true
  } catch {
    return false
  }
}
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  )
}

describe('URL migration contract', () => {
  it('normalizes file-rendering paths without leaking extensions into canonical URLs', () => {
    expect(canonicalPath('/index.html')).toBe('/')
    expect(canonicalPath('/posts/magma-paper.html')).toBe('/posts/magma-paper')
    expect(canonicalPath('/posts/magma-paper/')).toBe('/posts/magma-paper')
  })
  it('preserves every pre-migration public file, directly or through one redirect, with identical bytes', () => {
    for (const asset of inventory.publicFiles) {
      const target = redirects.get(asset.current) ?? asset.current
      expect(redirects.has(target), `chain from ${asset.current}`).toBe(false)
      const file = targetFile(target)
      expect(file, asset.current).toBeTruthy()
      expect(createHash('sha256').update(readFileSync(file!)).digest('hex'), asset.current).toBe(
        asset.sha256
      )
    }
  })
  it('preserves published page routes while explicitly withholding historical draft leaks', () => {
    for (const page of inventory.pages) {
      if ('draft' in page && page.draft) {
        expect(redirects.has(page.current)).toBe(false)
        continue
      }
      const target = redirects.get(page.current) ?? page.current
      expect(targetFile(target), `${page.current} -> ${target}`).toBeTruthy()
    }
  })
  it('all local HTML links and media resolve to final outputs without legacy redirects', () => {
    const missing: string[] = []
    for (const file of walk(output).filter((file) => extname(file) === '.html')) {
      const pathname = canonicalPath('/' + file.slice(output.length + 1))
      const html = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
      for (const match of html.matchAll(/\b(?:href|src)="([^"\s]+)"/g)) {
        let url: URL
        try {
          url = new URL(match[1]!.replaceAll('&amp;', '&'), `https://cade.io${pathname}`)
        } catch {
          continue
        }
        if (url.origin !== 'https://cade.io') continue
        if (redirects.has(url.pathname))
          missing.push(`${pathname} references legacy ${url.pathname}`)
        else if (!targetFile(decodeURIComponent(url.pathname)))
          missing.push(`${pathname} -> ${url.pathname}`)
      }
    }
    expect([...new Set(missing)]).toEqual([])
  })
})
