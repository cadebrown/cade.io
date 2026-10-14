import { it, expect } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

it('imports only public pairs, migrates PDF aliases directly and keeps one copy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'career-import-'))
  try {
    for (const directory of [
      'scripts',
      'src/lib',
      'src/data',
      'src/assets',
      'source/resume',
      'source/cv',
    ])
      await mkdir(join(root, directory), { recursive: true })
    for (const file of ['scripts/import-career.mjs', 'src/lib/career-documents.ts'])
      await copyFile(resolve(file), join(root, file))
    await writeFile(join(root, 'package.json'), '{"type":"module"}')
    const oldConfig = {
      urls: { 'other.pdf': '/other.pdf' },
      aliases: { '/old-other.pdf': '/other.pdf' },
    }
    await writeFile(join(root, 'src/data/shared-assets.json'), JSON.stringify(oldConfig))
    const pdf = Buffer.from('%PDF-career-fixture')
    const documents = ['resume', 'cv'].map((kind) => ({
      schemaVersion: 1,
      kind,
      mode: 'review',
      updated: '2026-10-13',
      pdfSha256: createHash('sha256').update(pdf).digest('hex'),
      blocks: [{ type: 'name', text: 'Sample Person' }],
    }))
    for (const document of documents) {
      await writeFile(
        join(root, 'source', document.kind, 'document.json'),
        JSON.stringify(document)
      )
      await writeFile(join(root, 'source', document.kind, 'document.pdf'), pdf)
    }
    const run = () =>
      execFileSync(
        process.execPath,
        [join(root, 'scripts/import-career.mjs'), '--source', join(root, 'source')],
        { stdio: 'pipe' }
      )
    expect(run).toThrow()
    expect(JSON.parse(await readFile(join(root, 'src/data/shared-assets.json'), 'utf8'))).toEqual(
      oldConfig
    )
    for (const document of documents) {
      document.mode = 'public'
      await writeFile(
        join(root, 'source', document.kind, 'document.json'),
        JSON.stringify(document)
      )
    }
    run()
    const config = JSON.parse(await readFile(join(root, 'src/data/shared-assets.json'), 'utf8'))
    for (const kind of ['resume', 'cv']) {
      const canonical = `/${kind}-CadeBrown.pdf`
      expect(config.urls[`cade-brown-${kind}.pdf`]).toBe(canonical)
      expect(config.aliases[`/${kind}.pdf`]).toBe(canonical)
      expect(config.aliases[`/cade-brown-${kind}.pdf`]).toBe(canonical)
      expect(config.aliases[`/bones/${kind}-CadeBrown.pdf`]).toBe(canonical)
      expect(await readFile(join(root, `src/assets/cade-brown-${kind}.pdf`))).toEqual(pdf)
      await expect(readFile(join(root, `src/data/career/${kind}/document.pdf`))).rejects.toThrow()
    }
    expect(config.aliases['/old-other.pdf']).toBe('/other.pdf')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
