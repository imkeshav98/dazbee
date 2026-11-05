'use client'

// The round avatar at the top end, as in the final mock. Language, theme, settings and signing out
// live behind it, so the top bar keeps to the work and one action. In the editor its menu stands
// over the edit panel: Esc closes it first, and never clears the selection.
import { GearSixIcon, SignOutIcon } from '@phosphor-icons/react'
import Link from 'next/link'
import { useId, useState } from 'react'

import { TOUCH_ROW } from '@/components/ui/looks.ts'
import { useMenuClose } from '@/components/ui/menu-close.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { initialsOf } from '@/lib/initials.ts'

import { LocaleSwitch } from './locale-switch.tsx'
import { ThemeSwitch } from './theme-switch.tsx'

const ROW = `flex h-10 w-full cursor-pointer items-center gap-3 rounded-row px-3 text-start text-[13px] font-medium transition-colors duration-[var(--chrome-fast)] hover:bg-hover hover:lit active:bg-pressed active:lit focus-visible:bg-hover focus-visible:lit focus-visible:outline-none ${TOUCH_ROW}`

export function AccountMenu({
  name,
  signedIn,
}: {
  /** The workspace's name, shown as the avatar's initials and at the menu's top. */
  name: string
  /** Whether there is a session to end, so Sign out shows (#58). */
  signedIn: boolean
}) {
  const t = useMessages()
  const [open, setOpen] = useState(false)
  // Closes on Esc, before what is under it, or a press outside, giving the focus back to the avatar.
  const { box, button, overPanelMark } = useMenuClose(open, () => setOpen(false))
  const id = useId()

  return (
    <div ref={box} {...overPanelMark} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={t.account.open}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        data-testid="account-open"
        className="grid size-9 cursor-pointer place-items-center rounded-full bg-[image:var(--ai-gradient)] text-[13px] font-bold text-white shadow-[0_0_0_2px_var(--color-bg)] transition-transform duration-[var(--chrome-fast)] hover:scale-105"
      >
        <span aria-hidden>{initialsOf(name)}</span>
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={t.account.open}
          data-testid="account"
          className="pop-in-end absolute end-0 top-full z-40 mt-2 flex w-72 flex-col gap-1 rounded-card surface-frost p-1.5"
        >
          {/* As in the final mock: the avatar beside the workspace's name. */}
          <div className="flex items-center gap-3 px-3 pt-2 pb-1.5">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full bg-[image:var(--ai-gradient)] text-[13px] font-bold text-white"
            >
              {initialsOf(name)}
            </span>
            <p className="flex min-w-0 flex-col">
              <span className="truncate font-display text-sm font-semibold">{name}</span>
              <span className="truncate text-[11px] text-muted">{t.account.workspace}</span>
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-1.5">
            <span className="text-[13px] text-muted">{t.language.label}</span>
            <LocaleSwitch />
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-1.5">
            <span className="text-[13px] text-muted">{t.theme.label}</span>
            <ThemeSwitch />
          </div>
          <div className="my-1 h-px bg-line" />
          <Link href="/settings" className={ROW} data-testid="settings-link">
            <GearSixIcon size={18} aria-hidden className="text-muted" />
            {t.account.settings}
          </Link>
          {signedIn && (
            <form action="/logout" method="post">
              <button type="submit" className={ROW} data-testid="sign-out">
                <SignOutIcon size={18} aria-hidden className="text-muted rtl:-scale-x-100" />
                {t.signIn.signOut}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
