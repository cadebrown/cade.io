// astro.roo26.config.ts — standalone build of the Bonnaroo guide for
// roo26.alkem.dev: same app component, served from the domain root.
// Build with: npm run build:roo26
import { defineConfig } from 'astro/config'

export default defineConfig({
	site: 'https://roo26.alkem.dev',
	srcDir: './src-roo26',
	publicDir: './public-roo26',
	outDir: './dist-roo26',
	trailingSlash: 'never',
	compressHTML: true,
})
