import { describe, expect, it } from 'vitest'
import { chartTheme, DEFAULT_THEME, isTheme, readTheme, THEMES } from '../src/lib/theme'

describe('theme preferences', () => {
  it.each(THEMES)('accepts and restores the %s theme', (theme) => {
    expect(isTheme(theme)).toBe(true)
    expect(readTheme({ getItem: () => theme })).toBe(theme)
  })

  it.each([null, undefined, '', 'light', 'BLACKBOARD', '__proto__', {}])(
    'rejects an unsupported saved value %j',
    (value) => {
      expect(isTheme(value)).toBe(false)
      expect(readTheme({ getItem: () => value as string | null })).toBe(DEFAULT_THEME)
    }
  )

  it('uses the site default when browser storage is blocked', () => {
    expect(
      readTheme({
        getItem: () => {
          throw new Error('Storage blocked')
        },
      })
    ).toBe('blackboard')
  })

  it('maps the three site themes onto the two supported chart appearances', () => {
    expect(THEMES.map(chartTheme)).toEqual(['dark', 'light', 'dark'])
  })
})
