import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
	resolve: {
		alias: {
			'@site': fileURLToPath(new URL('./src/site.ts', import.meta.url)),
			'@format': fileURLToPath(new URL('./src/format.ts', import.meta.url)),
			'@themes': fileURLToPath(new URL('./src/themes.ts', import.meta.url)),
			'@katex': fileURLToPath(new URL('./src/katex.ts', import.meta.url)),
		},
	},
	test: {
		include: ['tests/**/*.test.ts'],
	},
})
