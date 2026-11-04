'use client'

// The theme pick on the client: the root layout reads it from the cookie on the server and hands it
// here, and the theme switch changes it, so the switch shows the pick from its first render, on the
// server and in the browser, and again each time it is shown.
import { createContext, type ReactNode, useContext, useState } from 'react'

import type { ThemePick } from './theme.ts'

const ThemePickContext = createContext<[ThemePick, (pick: ThemePick) => void]>(['system', () => {}])

/** The theme picked, and the function that changes it. */
export const useThemePick = () => useContext(ThemePickContext)

export function ThemePickProvider({ pick, children }: { pick: ThemePick; children: ReactNode }) {
  const state = useState(pick)
  return <ThemePickContext.Provider value={state}>{children}</ThemePickContext.Provider>
}
