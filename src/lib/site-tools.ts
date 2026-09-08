import { searchArticles } from './search'

type Tool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean }
  execute(input: Record<string, unknown>): unknown
}
type ModelContext = { registerTool(tool: Tool, options: { signal: AbortSignal }): Promise<void> }

/** Optional proposed WebMCP API; ordinary links and static indexes remain sufficient. */
export function registerSiteTools(): void {
  const api = (document as Document & { modelContext?: ModelContext }).modelContext
  if (!api?.registerTool) return
  const lifecycle = new AbortController()
  const tools: Tool[] = [
    {
      name: 'read_page',
      description:
        'Read the current article title, sections, and local navigation or source links.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => ({
        title: document.querySelector('h1')?.textContent,
        url: location.href,
        sections: [...document.querySelectorAll('main h2[id], main h3[id]')].map((heading) => ({
          title: heading.textContent?.trim(),
          fragment: `#${heading.id}`,
        })),
        links: [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
          .filter((link) => link.origin === location.origin)
          .map((link) => ({
            title: link.textContent?.trim() || link.getAttribute('aria-label'),
            url: link.pathname + link.search + link.hash,
          }))
          .filter((link) => link.title),
        index: '/content-index.json',
      }),
    },
    {
      name: 'search_articles',
      description:
        'Search published articles using the same local full-text index as the Search page.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', maxLength: 200 } },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async ({ query }) => {
        if (typeof query !== 'string' || query.length > 200)
          return { error: 'query must be a string of at most 200 characters' }
        return { results: await searchArticles(query) }
      },
    },
  ]
  for (const tool of tools) {
    try {
      void Promise.resolve(api.registerTool(tool, { signal: lifecycle.signal })).catch((error) =>
        console.warn('Optional site tool registration failed', error)
      )
    } catch (error) {
      console.warn('Optional site tool registration failed', error)
    }
  }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true })
  const restoreFromBackForwardCache = (event: PageTransitionEvent) => {
    // The initial pageshow is not a restore. Keep this listener until a persisted
    // pageshow, then remove it before installing the fresh registration's listener.
    if (!event.persisted || !lifecycle.signal.aborted) return
    window.removeEventListener('pageshow', restoreFromBackForwardCache)
    registerSiteTools()
  }
  window.addEventListener('pageshow', restoreFromBackForwardCache)
}
