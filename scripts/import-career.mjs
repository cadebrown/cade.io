import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { validateCareerDocument } from '../src/lib/career-documents.ts'

// Only run for a reviewed public release produced by Findwork site-export --mode export.
const { values } = parseArgs({ options: { source: { type: 'string' } } })
if (!values.source)
  throw new Error('Pass --source DIRECTORY containing public resume/ and cv/ snapshots')
const root = fileURLToPath(new URL('../', import.meta.url))
const source = resolve(values.source)
const updates = []
for (const kind of ['resume', 'cv']) {
  const json = await readFile(join(source, kind, 'document.json'), 'utf8')
  const pdf = await readFile(join(source, kind, 'document.pdf'))
  validateCareerDocument(JSON.parse(json), pdf, kind, 'public')
  updates.push([join(root, `src/data/career/${kind}/document.json`), json])
  updates.push([join(root, `src/assets/cade-brown-${kind}.pdf`), pdf])
}
const configPath = join(root, 'src/data/shared-assets.json')
const config = JSON.parse(await readFile(configPath, 'utf8'))
for (const kind of ['resume', 'cv']) {
  config.urls[`cade-brown-${kind}.pdf`] = `/${kind}.pdf`
  config.aliases[`/cade-brown-${kind}.pdf`] = `/${kind}.pdf`
  config.aliases[`/bones/${kind}-CadeBrown.pdf`] = `/${kind}.pdf`
}
updates.push([configPath, JSON.stringify(config, null, 2) + '\n'])
// Validate the complete pair before writing anything; a partial import fails the build's hash check.
for (const [destination, data] of updates) {
  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.import-${process.pid}`
  await writeFile(temporary, data, { flag: 'wx' })
  await rename(temporary, destination)
}
console.log(
  'Imported the public resume/CV snapshots and canonical PDF assets. Run npm run validate before release.'
)
