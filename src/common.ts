// common.ts - common tools used in the project, including constants, functions, and imported values
//
//




// defines the preferred way to format the date
// TODO: also have formatTime and formatDateTime?
export const formatDate = (value: Date) => {
    // return iso8601, just YYYY-MM-DD
    return value.toISOString().split('T')[0]
    // if you want to use a 'normie' date format, use this:
    // return value.toLocaleDateString('en-us', {
    //     year: 'numeric',
    //     month: 'short',
    //     day: 'numeric',
    // })
}

// the site's display title
export const SITE_TITLE = 'Near Computronium';
// the site's display description/tagline/slogan
export const SITE_BLURB = 'Musings on math, music, meaning, machines, and more.'
// the site's display image (favicon)
// export const SITE_IMAGE = '/favicon.svg'
export const SITE_IMAGE = '/assets/favicon.dev.svg'
// the site's canonical web URL
export const SITE_CANON = 'https://cade.io'


export const SITE_TEXTS = {
    
}





// import JSON definitions of themes
// NOTE: I generated these with https://themes.vscode.one/your-themes
import theme_whiteboard from './styles/vscodetheme-whiteboard.json'
import theme_blackboard from './styles/vscodetheme-blackboard.json'

// export the VSCode color themes we have
export const vscodeThemes = {
    whiteboard: theme_whiteboard,
    blackboard: theme_blackboard,
}

// additional KaTeX macro definitions. there are also some useful ones included:
// NOTE: https://katex.org/docs/supported#macros
// \def\gijk#1#2#3{\Gamma^{#1}_{#2#3}}   % only valid within the current block
// \gdef\gijk#1#2#3{\Gamma^{#1}_{#2#3}}  % valid for the entire page
export const katexMacros = {
	// parentheses and brackets wrapping
	'\\paren': '\\left(#1\\right)',
	'\\brack': '\\left[#1\\right]',

	// handy matrix shorthand
	'\\mat': '\\begin{matrix}#1\\end{matrix}',

	// commonly used math symbols
	'\\N': '\\mathbb{N}',
	'\\Z': '\\mathbb{Z}',
	'\\Q': '\\mathbb{Q}',
	'\\R': '\\mathbb{R}',
	'\\C': '\\mathbb{C}',
	'\\H': '\\mathbb{H}',
}

// our full KaTeX configuration object
// NOTE: https://katex.org/docs/options
export const katexConfig = {

	// we want to see warnings, but still allow non-strict syntax
	strict: 'warn',

	// we can probably enable trust, since it is static at build time...
	trust: true,

	// WARN: if just HTML output is enabled, then the copy-tex extension doesn't work!
	//output: 'html',
	output: 'htmlAndMathml',

	// custom default macros I use across the site
	macros: katexMacros,
}

