// copies the roo26 static assets into public-roo26/ for the standalone
// roo26.alkem.dev build (so it doesn't ship the whole cade.io public dir)
import { mkdirSync, copyFileSync, readdirSync } from 'node:fs'

mkdirSync('public-roo26', { recursive: true })
const files = readdirSync('public').filter((f) => f.startsWith('roo26'))
for (const f of files) copyFileSync(`public/${f}`, `public-roo26/${f}`)
console.log('synced to public-roo26/:', files.join(', '))
