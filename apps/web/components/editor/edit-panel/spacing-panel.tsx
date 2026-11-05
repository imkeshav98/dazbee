'use client'

// The Spacing panel of text: the room between its lines, letters and paragraphs, its box, then under
// Advanced shrinking to fit and the most lines it shows.
import { KNOBS, TILE, TILE_FACE_WIDE } from '@/components/editor/styles.ts'
import { TOUCH_GAP } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { LIMITS } from '@/lib/editor/limits.ts'
import { tidy } from '@/lib/editor/size.ts'
import { useMessages } from '@/lib/i18n/client.tsx'

import { clamp, NumberField, PanelPart, SwitchRow } from './fields.tsx'
import {
  type Fit,
  type P,
  type PanelProps,
  type Patch,
  type Props,
  set,
  shared,
  type Style,
  type Target,
  textStyle,
} from './target.ts'

type BoxMode = 'autoWidth' | 'autoHeight' | 'fixed'

/** The letters a box mode's tile draws in its box; the same in every language, as a font sample is. */
const SAMPLE_LETTERS = 'Aa'

/** Shrink to fit's sizes as set under the Spacing panel's Advanced, the text's size following the largest. */
const fitPatch = (now: Props, fit: Fit): Patch => ({
  shrinkToFit: fit,
  style: { ...(now.style as Style), fontSize: fit.max },
})

/** The Spacing panel of text: the room between its lines, letters and paragraphs, its box, and under Advanced shrinking to fit and the most lines it shows. */
export function SpacingPanel({ target }: PanelProps) {
  const t = useMessages()
  const p = t.editor.props
  return (
    <>
      <SpacingCard target={target} p={p} />
      <TextBoxCard target={target} p={p} />
      <TextFitCard target={target} p={p} title={t.editor.bar.advanced} />
    </>
  )
}

/**
 * The text's spacing as slider fields, one to a row: between its lines (Auto when cleared), its
 * letters, which can come closer as well as part, and its paragraphs.
 */
function SpacingCard({ target, p }: { target: Target; p: P }) {
  const { style, setStyle, shiftStyle } = textStyle(target)
  return (
    <PanelPart id="spacing-card" title={p.spacing}>
      <div className={cn('grid gap-1.5', TOUCH_GAP)}>
        <NumberField
          label={p.lineHeight}
          name={p.lineHeight}
          value={style('lineHeight') as number | 'mixed' | undefined}
          step={0.05}
          min={0.5}
          max={LIMITS.lineHeight}
          fillRange={[0.8, 2]}
          placeholder={p.lineHeightAuto}
          editor={target.editor}
          onSet={(v) => setStyle('lineHeight', v)}
          onShift={(by) => shiftStyle('lineHeight', by, 0.5, 1.2, LIMITS.lineHeight)}
          onClear={() => setStyle('lineHeight', undefined)}
        />
        <NumberField
          label={p.letterSpacing}
          name={p.letterSpacing}
          value={(style('letterSpacing') ?? 0) as number | 'mixed'}
          step={0.1}
          min={-LIMITS.letterSpacing}
          max={LIMITS.letterSpacing}
          fillRange={[-20, 20]}
          editor={target.editor}
          onSet={(v) => setStyle('letterSpacing', v)}
          onShift={(by) => shiftStyle('letterSpacing', by, -LIMITS.letterSpacing, 0, LIMITS.letterSpacing)}
        />
        <NumberField
          label={p.paragraphSpacing}
          name={p.paragraphSpacing}
          value={(shared(target.props.map((pr) => pr.paragraphSpacing)) ?? 0) as number | 'mixed'}
          min={0}
          max={LIMITS.paragraphSpacing}
          fillRange={[0, 60]}
          editor={target.editor}
          onSet={(v) => set(target, () => ({ paragraphSpacing: v }))}
          onShift={(by) =>
            set(target, (now) => ({
              paragraphSpacing: tidy(
                clamp(((now.paragraphSpacing as number | undefined) ?? 0) + by, 0, LIMITS.paragraphSpacing),
              ),
            }))
          }
        />
      </div>
    </PanelPart>
  )
}

/** The text's box as three picture tiles: growing along a line, growing down, or holding its size. */
function TextBoxCard({ target, p }: { target: Target; p: P }) {
  const mode = (shared(target.props.map((pr) => pr.boxMode)) ?? 'autoHeight') as BoxMode | 'mixed'
  return (
    <PanelPart id="text-box-card" title={p.textBox}>
      <div role="radiogroup" aria-label={p.boxMode} className="grid grid-cols-3 gap-[7px]">
        {(['autoWidth', 'autoHeight', 'fixed'] as const).map((to) => (
          <button
            key={to}
            type="button"
            role="radio"
            aria-checked={mode === to}
            data-value={to}
            onClick={() => set(target, () => ({ boxMode: to }))}
            className={TILE}
          >
            <span className={cn(TILE_FACE_WIDE, 'text-muted group-aria-checked:text-text')}>
              <BoxArt mode={to} />
            </span>
            <span className="w-full truncate text-center">{p.boxModes[to]}</span>
          </button>
        ))}
      </div>
    </PanelPart>
  )
}

/**
 * How each box mode's tile draws it: a box round "Aa", dashed where it grows, with arrows along the
 * way it grows, or solid with its corners marked where it holds its size.
 */
function BoxArt({ mode }: { mode: BoxMode }) {
  const box =
    mode === 'autoWidth'
      ? { x: 16, y: 8, width: 32, height: 18 }
      : mode === 'autoHeight'
        ? { x: 6, y: 4, width: 52, height: 26 }
        : { x: 6, y: 8, width: 52, height: 18 }
  const marks = {
    autoWidth: 'M4 17h8M8 14l-4 3 4 3M60 17h-8M56 14l4 3-4 3',
    autoHeight: 'M58 6v22M55 9l3-3 3 3M55 25l3 3 3-3',
    fixed: 'M6 8h3M6 8v3M58 26h-3M58 26v-3',
  }
  return (
    <svg width="64" height="34" viewBox="0 0 64 34" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect {...box} rx="3" strokeDasharray={mode === 'fixed' ? undefined : '3 2'} />
      <text
        x="32"
        y="21"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        className="font-sans text-[10px] font-semibold"
      >
        {SAMPLE_LETTERS}
      </text>
      <path d={marks[mode]} strokeWidth={mode === 'fixed' ? 2 : 1.5} />
    </svg>
  )
}

/** The text box's numbers, under Advanced: shrinking to fit between a smallest and a largest size, and the lines shown at most. */
function TextFitCard({ target, p, title }: { target: Target; p: P; title: string }) {
  const value = (key: string) => shared(target.props.map((pr) => pr[key])) as unknown
  const shrink = value('shrinkToFit') as Fit | undefined | 'mixed'
  return (
    <PanelPart id="text-fit-card" title={title} strong>
      <SwitchRow
        name={p.shrinkToFit}
        on={shrink === 'mixed' ? 'mixed' : shrink !== undefined}
        onSet={(on) =>
          set(target, (now) => {
            const size = (now.style as Style).fontSize
            return { shrinkToFit: on ? { min: tidy(Math.max(1, size / 2)), max: size } : undefined }
          })
        }
      />
      {shrink !== undefined && shrink !== 'mixed' && (
        <div className={KNOBS}>
          {(['min', 'max'] as const).map((end) => (
            <NumberField
              key={end}
              label={p.shrinkShort[end]}
              name={p.shrinkSize[end]}
              value={shrink[end]}
              min={1}
              max={LIMITS.fontSize}
              editor={target.editor}
              onSet={(v) =>
                set(target, (now) => {
                  const was = now.shrinkToFit as Fit | undefined
                  if (!was) return null
                  const next = { ...was, [end]: v }
                  return fitPatch(
                    now,
                    end === 'min'
                      ? { min: Math.min(next.min, next.max), max: next.max }
                      : { min: next.min, max: Math.max(next.min, next.max) },
                  )
                })
              }
              onShift={(by) =>
                set(target, (now) => {
                  const was = now.shrinkToFit as Fit | undefined
                  if (!was) return null
                  const v = tidy(Math.max(1, was[end] + by))
                  return fitPatch(
                    now,
                    end === 'min'
                      ? { min: Math.min(v, was.max), max: was.max }
                      : { min: was.min, max: Math.max(v, was.min) },
                  )
                })
              }
            />
          ))}
        </div>
      )}
      <NumberField
        label={p.maxLines}
        name={p.maxLines}
        value={value('maxLines') as number | 'mixed' | undefined}
        min={0}
        placeholder={p.none}
        editor={target.editor}
        // 0, or nothing, lifts the limit.
        onSet={(v) => set(target, () => ({ maxLines: Math.round(v) >= 1 ? Math.round(v) : undefined }))}
        onClear={() => set(target, () => ({ maxLines: undefined }))}
        onShift={(by) =>
          set(target, (now) => {
            const next = Math.round(((now.maxLines as number | undefined) ?? 0) + by)
            return { maxLines: next >= 1 ? next : undefined }
          })
        }
      />
    </PanelPart>
  )
}
