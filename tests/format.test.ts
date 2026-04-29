import { describe, expect, it } from 'vitest'
import { formatDate, readingStats } from '../src/format'

describe('formatDate', () => {
	it('returns ISO-8601 YYYY-MM-DD', () => {
		expect(formatDate(new Date('2024-03-15T12:34:56Z'))).toBe('2024-03-15')
	})

	it('is locale-independent', () => {
		// Date is constructed in UTC; the result must be the same UTC date string
		// regardless of where the test runs.
		expect(formatDate(new Date(Date.UTC(2024, 0, 1)))).toBe('2024-01-01')
	})
})

describe('readingStats', () => {
	it('counts words in plain prose', () => {
		const { words, minutes } = readingStats('one two three four five')
		expect(words).toBe(5)
		expect(minutes).toBe(1) // floor of any short post is 1 minute
	})

	it('strips fenced code blocks before counting', () => {
		const body = `
intro paragraph words.

\`\`\`rust
fn this_should_not_be_counted() {
    let many_words = "lorem ipsum dolor sit amet";
    return many_words;
}
\`\`\`

closing paragraph words.
`
		const { words } = readingStats(body)
		expect(words).toBe(6) // "intro paragraph words" (3) + "closing paragraph words" (3); code block is dropped
	})

	it('strips inline code', () => {
		const { words } = readingStats('use the `function_name()` like this')
		// "use", "the", "like", "this"
		expect(words).toBe(4)
	})

	it('keeps link text but drops URLs', () => {
		const { words } = readingStats('see [the docs](https://example.com/path/to/thing) for more')
		// "see", "the", "docs", "for", "more"
		expect(words).toBe(5)
	})

	it('drops images entirely', () => {
		const { words } = readingStats('before ![alt text here](./img.webp) after')
		expect(words).toBe(2) // "before", "after"
	})

	it('strips HTML/JSX tags', () => {
		const { words } = readingStats('<Figure src="x">caption</Figure> body words')
		expect(words).toBe(3) // tags stripped: "caption body words"
	})

	it('estimates minutes at ~220 wpm with a floor of 1', () => {
		const longBody = Array(440).fill('word').join(' ')
		const { minutes } = readingStats(longBody)
		expect(minutes).toBe(2)
	})

	it('returns minutes >= 1 even for empty/short content', () => {
		expect(readingStats('').minutes).toBe(1)
		expect(readingStats('hi').minutes).toBe(1)
	})
})
