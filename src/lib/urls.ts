/** File-format builds expose .html while rendering; public HTML routes are slashless. */
export function canonicalPath(pathname: string): string {
  return (
    pathname
      .replace(/\/index\.html$/, '/')
      .replace(/\.html$/, '')
      .replace(/\/$/, '') || '/'
  )
}

export function authorUrl(id: string): string {
  return `/authors/${encodeURIComponent(id)}`
}
