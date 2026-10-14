import type { APIRoute } from 'astro'
import { readCareerDocument, type CareerKind } from '../../lib/career-documents'

export const GET: APIRoute = async ({ url }) => {
  const kind = url.pathname.slice(1, -4) as CareerKind
  const { pdf, document } = await readCareerDocument(
    import.meta.env.CAREER_DOCUMENT_DIR,
    kind,
    import.meta.env.CAREER_DOCUMENT_MODE
  )
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="cade-brown-${kind}.pdf"`,
      ...(document.mode === 'review'
        ? { 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cache-Control': 'no-store' }
        : {}),
    },
  })
}
