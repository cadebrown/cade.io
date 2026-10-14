import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { dev } from 'astro'

const { values } = parseArgs({
  options: { source: { type: 'string' }, port: { type: 'string', default: '4325' } },
})
const source = values.source ?? process.env.CAREER_REVIEW_DIR
if (!source)
  throw new Error('Pass --source DIRECTORY containing the reviewed resume/ and cv/ snapshots')
process.env.CAREER_REVIEW_DIR = resolve(source)
const port = Number(values.port)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port')
const server = await dev({ server: { host: '127.0.0.1', port } })
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await server.stop()
    process.exit(0)
  })
