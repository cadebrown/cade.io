// KaTeX configuration and custom macros.
// Macro reference: https://katex.org/docs/supported#macros
// Config reference: https://katex.org/docs/options

export const katexMacros = {
	// Wrapping helpers
	'\\paren': '\\left(#1\\right)',
	'\\brack': '\\left[#1\\right]',

	// Matrix shorthand
	'\\mat': '\\begin{matrix}#1\\end{matrix}',

	// Common number sets
	'\\N': '\\mathbb{N}',
	'\\Z': '\\mathbb{Z}',
	'\\Q': '\\mathbb{Q}',
	'\\R': '\\mathbb{R}',
	'\\C': '\\mathbb{C}',
	'\\H': '\\mathbb{H}',
}

export const katexConfig = {
	strict: 'warn',
	trust: true,
	// htmlAndMathml is required for the copy-tex extension to work
	output: 'htmlAndMathml',
	macros: katexMacros,
}
