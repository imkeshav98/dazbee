'use client'

import { useState } from 'react'

import { SEGMENT, SEGMENTS } from '@/components/ui/looks.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { themeOf, type ThemePick, THEMES } from '@/lib/theme.ts'

declare global {
  interface Window {
    __applyTheme?: () => void
  }
}

/** System, light or dark; only the tokens change. */
export function ThemeSwitch() {
  const t = useMessages().theme
  // The account menu shows the switch only once opened, in the browser, so the cookie is there to read
  // as it is first drawn, and the theme in use is chosen from the start.
  const [pick, setPick] = useState<ThemePick>(() => themeOf(document.cookie.match(/(?:^|; )theme=(\w+)/)?.[1]))

  function choose(next: ThemePick) {
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`
    setPick(next)
    if (next === 'system') delete document.documentElement.dataset.theme
    window.__applyTheme?.()
  }

  return (
    <div role="radiogroup" aria-label={t.label} className={SEGMENTS}>
      {THEMES.map((theme) => (
        <button
          key={theme}
          type="button"
          role="radio"
          aria-checked={pick === theme}
          onClick={() => choose(theme)}
          className={SEGMENT}
        >
          {t[theme]}
        </button>
      ))}
    </div>
  )
}
