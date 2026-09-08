import { defineEcConfig } from 'astro-expressive-code'
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections'
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers'
import { pluginColorChips } from 'expressive-code-color-chips'
import whiteboard from './src/styles/vscodetheme-whiteboard.json' with { type: 'json' }
import blackboard from './src/styles/vscodetheme-blackboard.json' with { type: 'json' }

export default defineEcConfig({
  themes: [whiteboard, blackboard],
  plugins: [pluginCollapsibleSections(), pluginLineNumbers(), pluginColorChips()],
  defaultProps: {
    collapseStyle: 'collapsible-auto',
    wrap: true,
    overridesByLang: { 'zsh,bash,sh,ps,bat': { preserveIndent: false } },
  },
  styleOverrides: { codePaddingInline: '1.0em', codePaddingBlock: '1.0em' },
})
