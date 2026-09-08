export type ArticleSearchResult = { title: string; url: string; excerpt: string }
type Pagefind = {
  init(): Promise<void>
  search(query: string): Promise<{
    results: { data(): Promise<{ url: string; meta: { title?: string }; excerpt: string }> }[]
  }>
}
let engine: Promise<Pagefind> | undefined
export function prepareSearch(): Promise<Pagefind> {
  const url = '/pagefind/pagefind.js'
  engine ??= import(/* @vite-ignore */ url)
    .then(async (module: Pagefind) => {
      await module.init()
      return module
    })
    .catch((error) => {
      engine = undefined
      throw error
    })
  return engine
}
export async function searchArticles(query: string): Promise<ArticleSearchResult[]> {
  if (typeof query !== 'string' || query.length > 200)
    throw new Error('Search must be text of at most 200 characters.')
  if (!query.trim()) return []
  const pagefind = await prepareSearch()
  const result = await pagefind.search(query.trim())
  return Promise.all(
    result.results.slice(0, 20).map(async (item) => {
      const data = await item.data()
      const url = new URL(data.url, location.origin)
      if (url.origin !== location.origin || !url.pathname.startsWith('/posts/'))
        throw new Error('Unexpected search destination.')
      const excerpt = document.createElement('div')
      excerpt.innerHTML = data.excerpt
      return {
        title: data.meta.title ?? 'Article',
        url: url.pathname + url.hash,
        excerpt: excerpt.textContent ?? '',
      }
    })
  )
}
