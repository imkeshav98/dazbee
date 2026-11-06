'use client'

// A bento tile's menu (#159): a round button at the tile's top end that opens Rename, Duplicate and
// Delete. Rename opens a name field in the menu's place; Delete asks once more before it deletes.
import { DotsThreeIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { buttonStyles } from '@/components/ui/button.tsx'
import { LIT_ROW, TOUCH_ROW } from '@/components/ui/looks.ts'
import { Menu, MenuItem } from '@/components/ui/menu.tsx'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

type Step = 'menu' | 'rename' | 'delete'

export function TileMenu({
  name,
  rename,
  duplicate,
  remove,
}: {
  /** What the tile is called, for the button's label and the fields. */
  name: string
  rename: (form: FormData) => Promise<void>
  /** Left out where a copy makes no sense, as for a template. */
  duplicate?: () => Promise<void>
  remove: () => Promise<void>
}) {
  const t = useMessages().library
  const [step, setStep] = useState<Step | null>(null)
  const box = useRef<HTMLDivElement>(null)
  // A form closes on Esc or a press outside it; the menu closes on its own.
  useEffect(() => {
    if (step !== 'rename' && step !== 'delete') return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setStep(null)
    const onPress = (event: PointerEvent) => !box.current?.contains(event.target as Node) && setStep(null)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPress)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPress)
    }
  }, [step])
  const row = `flex h-9 w-full cursor-pointer items-center rounded-row px-3 text-start text-[13px] font-medium ${LIT_ROW} ${TOUCH_ROW}`
  return (
    <div ref={box} className="absolute end-2 top-2 z-10" data-testid="tile-menu">
      <Menu
        trigger={
          <button
            type="button"
            aria-label={format(t.moreFor, { name })}
            className={cn(
              'grid size-8 cursor-pointer place-items-center rounded-full surface-frost text-muted transition-opacity duration-[var(--chrome-fast)] hover:text-text',
              // Shown on hover and focus, and while it is open, so the tiles stay clean.
              step
                ? 'opacity-100'
                : 'opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100 max-md:opacity-100',
            )}
          >
            <DotsThreeIcon size={18} weight="bold" aria-hidden />
          </button>
        }
        open={step === 'menu'}
        onOpenChange={(to) => {
          if (to) setStep('menu')
          else if (step === 'menu') setStep(null)
        }}
        label={format(t.moreFor, { name })}
        place={{ side: 'bottom', align: 'end', sideOffset: 6, collisionPadding: 12 }}
        className="w-44 p-1"
      >
        <MenuItem label={t.rename} look={row} onSelect={() => setStep('rename')} />
        {duplicate && (
          <MenuItem
            label={t.duplicate}
            look={row}
            keepOpen
            // The menu closes once the copy is made.
            onSelect={() => void duplicate().then(() => setStep(null))}
          />
        )}
        <MenuItem label={t.delete} look={cn(row, 'text-danger')} onSelect={() => setStep('delete')} />
      </Menu>
      {step === 'rename' && (
        <form
          action={async (form) => {
            await rename(form)
            setStep(null)
          }}
          className="pop-in-end absolute end-0 top-full mt-1.5 flex w-64 flex-col gap-2 rounded-card surface-frost p-3"
        >
          <label htmlFor="tile-rename" className="text-xs font-semibold text-muted">
            {t.newName}
          </label>
          <input
            id="tile-rename"
            name="name"
            required
            maxLength={120}
            defaultValue={name}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            className="h-9 min-w-0 rounded-row border border-line bg-bg px-2.5 text-[14px] outline-none hover:border-line-strong focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep(null)}
              className={cn(buttonStyles({ variant: 'ghost' }), 'h-8 px-3')}
            >
              {t.cancel}
            </button>
            <Submit label={t.save} />
          </div>
        </form>
      )}
      {step === 'delete' && (
        <form
          action={remove}
          className="pop-in-end absolute end-0 top-full mt-1.5 flex w-64 flex-col gap-3 rounded-card surface-frost p-3"
        >
          <p className="text-[13px] leading-snug">{format(t.deleteConfirm, { name })}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep(null)}
              className={cn(buttonStyles({ variant: 'ghost' }), 'h-8 px-3')}
            >
              {t.cancel}
            </button>
            <Submit label={t.delete} danger />
          </div>
        </form>
      )}
    </div>
  )
}

function Submit({ label, danger = false }: { label: string; danger?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(buttonStyles({ variant: danger ? 'danger' : 'primary' }), 'h-8 px-3 font-semibold')}
    >
      {label}
    </button>
  )
}
