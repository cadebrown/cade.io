import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverSharedAssets, type SharedAssetConfig } from '../src/lib/shared-assets'

const roots: string[] = []
async function fixture(files: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'cade-shared-assets-'))
  roots.push(root)
  for (const name of files) {
    const file = join(root, name)
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, name)
  }
  return root
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('shared asset discovery', () => {
  it('discovers new originals without registration, using only explicit URL exceptions', async () => {
    const root = await fixture([
      'photos/portrait.webp',
      'cv.pdf',
      '.DS_Store',
      '.hidden/data',
      'node_modules/file',
      'draft~',
    ])
    const config = { urls: { 'cv.pdf': '/cv.pdf' }, aliases: { '/bones/cv.pdf': '/cv.pdf' } }
    const first = await discoverSharedAssets(root, config)
    expect(first.assets.map(({ url }) => url)).toEqual(['/cv.pdf', '/assets/photos/portrait.webp'])
    expect(first.aliases.get('/bones/cv.pdf')).toBe('/cv.pdf')
    await writeFile(join(root, 'new.svg'), '<svg/>')
    expect((await discoverSharedAssets(root, config)).assets.map(({ url }) => url)).toContain(
      '/assets/new.svg'
    )
  })
  const invalidMappings: SharedAssetConfig[] = [
    { urls: { 'a.svg': '/same.svg', 'b.svg': '/SAME.svg' } },
    { urls: { 'a.svg': '/assets/b.svg/child' } },
    { aliases: { '/assets/a.svg': '/assets/b.svg' } },
    { aliases: { '/old.svg': '/absent.svg' } },
    { urls: { 'absent.svg': '/new.svg' } },
    { urls: { 'a.svg': '/assets/../escape.svg' } },
  ]
  it.each(invalidMappings)('rejects collisions and invalid mapping %#', async (config) => {
    const root = await fixture(['a.svg', 'b.svg'])
    await expect(discoverSharedAssets(root, config)).rejects.toThrow()
  })
  it('publishes filenames matching inherited object properties without an override', async () => {
    const root = await fixture(['constructor', 'toString', '__proto__'])
    const { assets } = await discoverSharedAssets(root, {})
    expect(assets.map(({ url }) => url).sort()).toEqual([
      '/assets/__proto__',
      '/assets/constructor',
      '/assets/toString',
    ])
  })
  it('rejects source symlinks instead of publishing their targets', async () => {
    const root = await fixture(['a.svg'])
    await symlink(join(root, 'a.svg'), join(root, 'link.svg'))
    await expect(discoverSharedAssets(root, {})).rejects.toThrow('symlink')
  })
})
