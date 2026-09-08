export const THEMES = ['blackboard', 'whiteboard', 'debugboard'] as const
export type Theme = (typeof THEMES)[number]
export const DEFAULT_THEME: Theme = 'blackboard'

export function isTheme(value: unknown): value is Theme {
  return THEMES.some((theme) => theme === value)
}

export function readTheme(storage: Pick<Storage, 'getItem'>): Theme {
  try {
    const saved = storage.getItem('theme')
    return isTheme(saved) ? saved : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function currentTheme(): Theme {
  const theme = document.documentElement.dataset.theme
  return isTheme(theme) ? theme : DEFAULT_THEME
}

export function chartTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'whiteboard' ? 'light' : 'dark'
}

export function syncThemeButtons(): void {
  const theme = currentTheme()
  document.querySelectorAll<HTMLButtonElement>('button.themes').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.theme === theme))
  })
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  syncThemeButtons()
  try {
    window.localStorage.setItem('theme', theme)
  } catch {
    // A blocked or full store must not prevent changing the current page.
  }
}

export function initializeThemeControls(): void {
  syncThemeButtons()
  document.querySelectorAll<HTMLButtonElement>('button.themes').forEach((button) => {
    button.addEventListener('click', () => {
      if (isTheme(button.dataset.theme)) setTheme(button.dataset.theme)
    })
  })
  // History restoration can reuse a document whose theme predates another page.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return
    try {
      document.documentElement.dataset.theme = readTheme(window.localStorage)
    } catch {
      // Keep this document's selected theme if storage access itself is blocked.
    }
    syncThemeButtons()
  })
}
