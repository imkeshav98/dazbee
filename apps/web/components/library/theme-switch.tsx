'use client'

import { useEffect, useState } from 'react'

import { TOUCH_ROW } from '@/components/ui/looks.ts'
import { segment, SEGMENTED } from '@/components/ui/segmented.tsx'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { themeOf, type ThemePick, THEMES } from '@/lib/theme.ts'

declare global {
  interface Window {
    __applyTheme?: () => void
  }
}

/** System, light or dark; only the tokens change. On a phone each is a touch target. */
export function ThemeSwitch() {
  const t = useMessages().theme
  const [pick, setPick] = useState<ThemePick>('system')
  useEffect(() => setPick(themeOf(document.cookie.match(/(?:^|; )theme=(\w+)/)?.[1])), [])

  function choose(next: ThemePick) {
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`
    setPick(next)
    if (next === 'system') delete document.documentElement.dataset.theme
    window.__applyTheme?.()
  }

  return (
    <div role="radiogroup" aria-label={t.label} className={SEGMENTED}>
      {THEMES.map((theme) => (
        <button
          key={theme}
          type="button"
          role="radio"
          aria-checked={pick === theme}
          onClick={() => choose(theme)}
          className={cn(segment(pick === theme), TOUCH_ROW)}
        >
          {t[theme]}
        </button>
      ))}
    </div>
  )
}
