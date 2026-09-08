import { dev } from 'astro'

// Keep lifecycle ownership with Playwright even when Astro CLI detects an agent
// and would otherwise daemonize itself.
const server = await dev({
  server: { host: '127.0.0.1', port: Number(process.env.ASTRO_DRAFT_PORT ?? 4323) },
})
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await server.stop()
    process.exit(0)
  })
