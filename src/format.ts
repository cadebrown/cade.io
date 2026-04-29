// Display-format helpers.

// ISO-8601 date (YYYY-MM-DD). Locale-independent and stable.
export const formatDate = (value: Date) => value.toISOString().split('T')[0]

// Strip markdown/MDX syntax to get a rough word count.
// We strip code blocks (which inflate counts wildly) and common syntax noise,
// then split on whitespace. Good enough for "X min read" estimates.
const WORDS_PER_MINUTE = 220

export function readingStats(body: string) {
	const cleaned = body
		.replace(/```[\s\S]*?```/g, '')         // fenced code blocks
		.replace(/`[^`]*`/g, '')                 // inline code
		.replace(/<[^>]+>/g, ' ')                // HTML/JSX tags
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')   // images
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → keep text
		.replace(/[#*_~>$|]/g, ' ')              // markdown emphasis/headings
	const words = cleaned.split(/\s+/).filter(Boolean).length
	const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE))
	return { words, minutes }
}
