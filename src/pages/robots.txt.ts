// robots.txt.ts - generates the robots.txt file for the site
// NOTE: https://docs.astro.build/en/guides/integrations-guide/sitemap/#sitemap-link-in-robotstxt

import type { APIRoute } from 'astro'

const getRobotsTxt = (sitemapURL: URL) => `
User-agent: *
Allow: /

Sitemap: ${sitemapURL.href}
`
export const GET: APIRoute = ({ site }) => {
    const sitemapURL = new URL('sitemap-index.xml', site)
    return new Response(getRobotsTxt(sitemapURL))
}
