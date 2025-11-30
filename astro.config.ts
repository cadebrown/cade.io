// astro.config.ts - configures and defines this Astro project's settings, integrations, and more.
//
// This is for my personal website (https://cade.io), but feel free to copy and modify this for your own use!
//
// Astro Configuration Reference: https://docs.astro.build/en/reference/configuration-reference/
//

// base Astro utilities
import { defineConfig } from 'astro/config'

// official Astro plugins/extensions
import sitemap from '@astrojs/sitemap'
import mdx from '@astrojs/mdx'

// remark plugins for markdown processing
import remarkMath from "remark-math";
import { remarkDefinitionList, defListHastHandlers } from 'remark-definition-list'
import remarkRehype from 'remark-rehype'
import remarkDirective from 'remark-directive'

// rehype plugins for HTML processing
import rehypeToc from 'rehype-toc'
import rehypeUnwrapImages from 'rehype-unwrap-images'
import rehypeKatex from "rehype-katex"
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeFigure from "@microflash/rehype-figure"

// ApexCharts for charts and plots
import { rehypeApexcharts } from './src/rehype-plugins-cade/rehype-apexcharts'

// Mermaid for diagram rendering
// import rehypeMermaid from 'rehype-mermaid';
import mermaid from 'astro-mermaid';


// Astro Icon: for SVG icons
import icon from 'astro-icon'

// favicon generator
import favicons from "astro-favicons";

// Expressive Code: for beautiful code blocks
import expressiveCode, { ExpressiveCodeTheme } from 'astro-expressive-code'

// custom plugins for Expressive Code
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections'
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers'
import { pluginColorChips } from 'expressive-code-color-chips'

// extra configuration, constants, and definitions
import { katexConfig, vscodeThemes } from './src/common.ts'

// the actual configuration object, which is a JSON tree of settings
// NOTE: https://astro.build/config
export default defineConfig({
	site: 'https://cade.io',
	trailingSlash: 'never',
	scopedStyleStrategy: 'where',
	compressHTML: true,
	server: {
		host: true,
	},
	experimental: {
		// for content collections
		contentIntellisense: true,
	},
	markdown: {
		// NOTE: 
		// NOTE: https://docs.astro.build/en/guides/syntax-highlighting/
		shikiConfig: {
			// theme: 'dracula',
			themes: {
				whiteboard: vscodeThemes.whiteboard,
				blackboard: vscodeThemes.blackboard,
			},


			excludeLangs: [
				'apexcharts',
			],
			// excludeLangs: [
			// 	// exclude mermaid diagrams from syntax highlighting, since they are rendered by a plugin
			// 	'mermaid',
			// ],
		},


		// Astro can use GitHub Flavored Markdown by default, so no need for the remark-gfm plugin
		gfm: true,
		// here is where you can add custom markdown processors
		remarkPlugins: [
			// parses math blocks and inline equations (in '$' and '$$')
			remarkMath,
			// parses definition lists in markdown
			// NOTE: must have 'defListHastHandlers' in the rehype plugins for this to work
			remarkDefinitionList,

			// parses custom directives in markdown
			// NOTE: https://github.com/remarkjs/remark-directive
			// NOTE: https://mdxeditor.dev/editor/docs/custom-directive-editors
			remarkDirective,

		],
		// here is where you can add custom HTML processors
		rehypePlugins: [
			// converts ApexCharts charts to HTML
			rehypeApexcharts,
			// remark -> rehype conversion, ensures everything is HTML that needs to be
			[remarkRehype, {
				// the prefix for generated IDs (i.e. footnotes)
				// I like removeing this, so it is just '#fn-1', etc...
				// TODO: figure out if footnotes can also be made into inline hoverboxes (like Hover component)
				// TODO: also add backreference preview so you can see what the reference is
				// SEE https://github.com/syntax-tree/mdast-util-gfm-footnote#syntax-tree
				clobberPrefix: '',

				// the title of the section for references/footnotes
				footnoteLabel: 'References',
				// generate the ARIA label text for backreferences
				footnoteBackLabel: function (referenceIndex: number, rereferenceIndex: number) {
					return 'Go back to ' + rereferenceIndex;
				},
				// generate the displayed content for backreferences
				footnoteBackContent: function (referenceIndex: number, rereferenceIndex: number) {
					// return '#' + rereferenceIndex;
					return '↑' + rereferenceIndex;
					// return '↩' + rereferenceIndex;

				},
				handlers: {
					// as above, this is required to actually convert definition lists to HTML
					...defListHastHandlers
				}
			}],

			// converts math blocks and inline equations to HTML using KaTeX rendering
			[rehypeKatex, katexConfig],
			// converts Mermaid diagrams to HTML
			// rehypeMermaid,
			// unwraps images from their parent paragraph tags
			rehypeUnwrapImages,
			// adds figure elements around images with captions generated from the alt text
			// TODO: make my own plugin that splits the alt text into a caption and a title?
			rehypeFigure,
			// adds slug anchors to all headings
			rehypeSlug,
			// adds autolinks to all headings, a clickable icon that can be shared
			[rehypeAutolinkHeadings, {
				behavior: 'append',
				properties: {
					className: ['autolink-headings', 'autolink-headings-link'],
					'aria-hidden': 'true',
					'tabindex': '-1',
				},
				content: {
					type: 'element',
					tagName: 'svg',
					properties: {
						className: ['autolink-headings', 'autolink-headings-icon'],
						// width: '1em',
						// height: '1em',
						'aria-hidden': 'true',
					},
					children: [
						{
							type: 'element',
							tagName: 'use',
							properties: {
								href: '/assets/sprites.svg#autolink-headings-icon'
							},
						},
					],
				},
			}],
			// extracts a table of contents from the data
			// TODO: how should this be displayed?
			// rehypeToc,
		],
	},
	integrations: [
		// NOTE: https://docs.astro.build/en/guides/integrations-guide/sitemap/
		sitemap({
			// a theme for viewing the sitemap (optional)
			// xslURL: '/assets/sitemap.xsl',
		}),
		// NOTE: https://expressive-code.com/reference/configuration/
		expressiveCode({
			// you can create themes with https://themes.vscode.one/your-themesfd
			themes: [...Object.values(vscodeThemes)],
			plugins: [
				// NOTE: https://expressive-code.com/plugins/collapsible-sections/
				pluginCollapsibleSections(),
				// NOTE: https://expressive-code.com/plugins/line-numbers/
				pluginLineNumbers(),
				// NOTE: https://delucis.github.io/expressive-code-color-chips/getting-started/
				pluginColorChips(),
			],
			defaultProps: {
				// change the default style of collapsible sections
				collapseStyle: 'collapsible-auto',
				// by default enable word wrap
				wrap: true,
				// disable line wrapped indentation in 'shell' languages
				overridesByLang: {
					'zsh,bash,sh,ps,bat': {
						preserveIndent: false,
					},
				},
			},
			styleOverrides: {
				frames: {
					// disable the little dots in the terminal frames
					// terminalTitlebarDotsOpacity: '0.0',
				},
				codePaddingInline: '1.0em',
				codePaddingBlock: '1.0em',
			},
		}),
		// turn mermaid markdown into HTML
		mermaid({
			theme: 'forest',
			autoTheme: true,
		}),
		mdx(),
		// NOTE: https://www.astroicon.dev/reference/configuration/
		icon({
			iconDir: "./public/icons",
			svgoOptions: {
				multipass: true,
				plugins: [
					{
						name: "preset-default",
						params: {
							overrides: {
								// customize default plugin options
								inlineStyles: {
									onlyMatchedOnce: false,
								},
								// or disable plugins
								removeDoctype: false,
							}
						}
					}
				]
			}
		}),
		// favicons({
		// 	input: {
		// 		favicons: [
		// 			"public/favicon.png",
		// 			//   await readFile("src/assets/pixel.png"),
		// 		], // select best source image by its size
		// 		// Add other platform-specific sources if needed.
		// 	},
		// 	manifest: {},
		// 	icons: {
		// 		favicons: true,
		// 		android: true,
		// 		appleIcon: true,
		// 		appleStartup: true,
		// 		windows: true,
		// 		yandex: true,
		// 	},
		// 	pixel_art: true,
		// 	manifestMaskable: false,
		// 	output: {
		// 		images: true,
		// 		files: true,
		// 		html: true,
		// 		// assetsPrefix: "/",
		// 	},
		// 	// Extra options...
		// }),
	],
})
