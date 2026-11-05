'use client'

// The Effects panel: a picture tile for each effect, then under Advanced each effect's numbers and
// colour, and text's outline.
import { type Effect } from '@dazbee/schema'

import { assetThumbnail } from '@/components/editor/paint/paint-stack.tsx'
import { RemoveButton } from '@/components/editor/reorder-list.tsx'
import { KNOBS, PANEL_PART, TILE, TILE_FACE_WIDE, TOUCH_GAP } from '@/components/editor/styles.ts'
import { Select } from '@/components/ui/select.tsx'
import { cn } from '@/lib/cn.ts'
import { LIMITS } from '@/lib/editor/limits.ts'
import { tidy } from '@/lib/editor/size.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { clamp, ColorField, NumberField, PanelPart } from './fields.tsx'
import {
  imageFillOf,
  kindOf,
  type P,
  type PanelProps,
  type Props,
  set,
  shared,
  type Style,
  type Target,
} from './target.ts'

/** The effect tiles, in the order the panel shows them; Outline is text's alone. */
type Tile = 'none' | Effect['type'] | 'outline'

/** What the effect tiles show their effects on: "Ag" for text, a photo for a photo, a rounded shape for the rest. */
type Sample = { kind: 'text' } | { kind: 'photo'; src: string } | { kind: 'shape' }

const EFFECT_FIELDS = {
  dropShadow: ['x', 'y', 'blur', 'spread'],
  innerShadow: ['x', 'y', 'blur', 'spread'],
  glow: ['blur', 'spread'],
  layerBlur: ['radius'],
  backgroundBlur: ['radius'],
} as const

const NEW_EFFECT: Record<Effect['type'], Effect> = {
  dropShadow: { type: 'dropShadow', x: 0, y: 8, blur: 24, spread: 0, color: '#00000040' },
  innerShadow: { type: 'innerShadow', x: 0, y: 4, blur: 12, spread: 0, color: '#00000040' },
  glow: { type: 'glow', blur: 24, spread: 0, color: '#FF48B080' },
  layerBlur: { type: 'layerBlur', radius: 8 },
  backgroundBlur: { type: 'backgroundBlur', radius: 16 },
}

/** The letters text's effect tiles show their effects on; the same in every language, as a font sample is. */
const SAMPLE_GLYPHS = 'Ag'

const TILES: Tile[] = ['none', 'dropShadow', 'innerShadow', 'glow', 'outline', 'layerBlur', 'backgroundBlur']

/** How a tile's sample shows its effect, close to what the renderer draws. */
const TILE_LOOK: Record<Tile, string> = {
  none: '',
  dropShadow: '[filter:drop-shadow(0_4px_3px_rgb(0_0_0/0.55))]',
  innerShadow: '',
  glow: '[filter:drop-shadow(0_0_8px_rgb(255_72_176/0.6))]',
  outline: '',
  layerBlur: 'blur-[1.8px]',
  backgroundBlur: '',
}

/**
 * The Effects panel: one grid of picture tiles, each previewing its effect on a sample of the
 * selection's kind, never the layer itself. A tile adds its effect, or takes every effect of its type
 * off; None takes them all off. Under Advanced, each effect that is on with its numbers and its own
 * remove button, text's outline with its width and colour, and Add another, which adds a second
 * effect of a type.
 */
export function EffectsPanel({ target, brandId }: PanelProps) {
  const t = useMessages()
  const p = t.editor.props
  const b = t.editor.bar
  const lists = target.props.map((pr) => (pr.effects ?? []) as Effect[])
  const list = shared(lists)
  const write = (to: (now: Effect[]) => Effect[]) =>
    set(target, (now) => ({ effects: to((now.effects ?? []) as Effect[]) }))
  const kind = kindOf(target)
  const text = kind === 'text'
  const image = imageFillOf(target)
  const sample: Sample = text
    ? { kind: 'text' }
    : kind === 'photo' && image
      ? { kind: 'photo', src: assetThumbnail(brandId, image.paint.assetId) }
      : { kind: 'shape' }
  const tiles = TILES.filter((tile) => tile !== 'outline' || text)
  const outlined = (pr: Props) =>
    ((pr.style as Style | undefined)?.outline as { width: number } | undefined)?.width ?? 0
  const on = (tile: Tile): boolean => {
    if (tile === 'outline') return target.props.every((pr) => outlined(pr) > 0)
    if (tile === 'none')
      return lists.every((l) => l.length === 0) && (!text || target.props.every((pr) => outlined(pr) === 0))
    return lists.every((l) => l.some((e) => e.type === tile))
  }
  const press = (tile: Tile) => {
    if (tile === 'none') {
      set(target, (now) => ({
        effects: [],
        ...(text ? { style: { ...(now.style as Style), outline: undefined } } : {}),
      }))
      return
    }
    if (tile === 'outline') {
      const off = on('outline')
      set(target, (now) => ({
        style: {
          ...(now.style as Style),
          outline: off
            ? undefined
            : {
                width: 2,
                color: ((now.style as Style).outline as { color?: string } | undefined)?.color ?? '#000000FF',
              },
        },
      }))
      return
    }
    const off = on(tile)
    write((now) =>
      off ? now.filter((e) => e.type !== tile) : now.some((e) => e.type === tile) ? now : [...now, NEW_EFFECT[tile]],
    )
  }
  const outline = shared(
    target.props.map((pr) => (pr.style as Style | undefined)?.outline as { width: number; color: string } | undefined),
  )
  const setOutline = (to: (was: { width: number; color: string }) => { width: number; color: string }) =>
    set(target, (now) => {
      const was = (now.style as Style).outline as { width: number; color: string } | undefined
      return was ? { style: { ...(now.style as Style), outline: to(was) } } : null
    })
  const empty = list !== 'mixed' && list.length === 0 && !(text && outline && outline !== 'mixed' && outline.width > 0)
  return (
    <>
      <section aria-label={p.effects} className={PANEL_PART} data-testid="effect-tiles">
        <div role="group" aria-label={p.effects} className="grid grid-cols-3 gap-[7px]">
          {tiles.map((tile) => (
            <button
              key={tile}
              type="button"
              aria-pressed={on(tile)}
              data-tile={tile}
              onClick={() => press(tile)}
              className={TILE}
            >
              <span className={TILE_FACE_WIDE}>
                <EffectSample sample={sample} tile={tile} />
              </span>
              <span className="w-full truncate text-center">
                {tile === 'none' || tile === 'outline' ? p.tiles[tile] : p.effect[tile]}
              </span>
            </button>
          ))}
        </div>
      </section>
      <PanelPart id="effects-card" title={b.advanced} strong>
        {text && outline && outline !== 'mixed' && outline.width > 0 && (
          <div className="flex flex-col gap-1.5" data-item="text-outline">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text">{p.tiles.outline}</span>
              <RemoveButton
                label={format(p.remove, { name: p.tiles.outline.toLowerCase(), n: 1 })}
                onClick={() => press('outline')}
              />
            </div>
            <div className={cn('flex items-center gap-1', TOUCH_GAP)}>
              <div className="w-24 shrink-0">
                <NumberField
                  label="W"
                  name={p.outlineWidth}
                  value={outline.width}
                  min={0.5}
                  step={0.5}
                  editor={target.editor}
                  onSet={(width) => setOutline((was) => ({ ...was, width }))}
                  onShift={(by) => setOutline((was) => ({ ...was, width: tidy(clamp(was.width + by, 0.5)) }))}
                />
              </div>
              <ColorField
                name={p.outline}
                value={outline.color}
                editor={target.editor}
                onSet={(to) => setOutline((was) => ({ ...was, color: to(was.color) }))}
              />
            </div>
          </div>
        )}
        {list === 'mixed' ? (
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            {p.mixedList}
            <button
              type="button"
              onClick={() => write(() => [])}
              className="cursor-pointer font-medium text-accent-text hover:underline"
            >
              {p.useOne}
            </button>
          </div>
        ) : (
          list.map((effect, i) => <EffectRow key={i} effect={effect} i={i} target={target} p={p} write={write} />)
        )}
        {empty && <p className="text-xs text-muted">{b.effectsHint}</p>}
        <Select
          name="add-effect"
          label={empty ? p.addEffect : b.addAnother}
          value=""
          placeholder={empty ? p.addEffect : b.addAnother}
          options={(Object.keys(NEW_EFFECT) as Effect['type'][]).map((type) => ({
            value: type,
            label: p.effect[type],
          }))}
          onChange={(type) => {
            const fresh = NEW_EFFECT[type as Effect['type']]
            write((now) => [...(list === 'mixed' ? [] : now), fresh])
          }}
          className="h-8 w-full rounded-row border border-line bg-surface px-2.5 text-[12px] font-semibold"
        />
      </PanelPart>
    </>
  )
}

/** One tile's picture: the sample with the tile's effect on it. Background blur sets it on a frosted pane over stripes. */
function EffectSample({ sample, tile }: { sample: Sample; tile: Tile }) {
  const inner = tile === 'innerShadow'
  const body =
    sample.kind === 'text' ? (
      <span
        aria-hidden
        className={cn(
          'font-display text-[26px] leading-none font-extrabold',
          tile === 'outline'
            ? 'text-transparent [-webkit-text-stroke:1.4px_var(--accent)]'
            : inner
              ? 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent),black_55%)_0_30%,var(--accent)_62%)] bg-clip-text text-transparent'
              : 'text-accent',
          TILE_LOOK[tile],
        )}
      >
        {SAMPLE_GLYPHS}
      </span>
    ) : sample.kind === 'photo' ? (
      <span aria-hidden className={cn('relative block size-[60%] overflow-hidden rounded-[6px]', TILE_LOOK[tile])}>
        <img src={sample.src} alt="" draggable={false} loading="lazy" className="size-full object-cover" />
        {inner && <span className="absolute inset-0 shadow-[inset_0_4px_6px_rgb(0_0_0/0.65)]" />}
      </span>
    ) : (
      <span
        aria-hidden
        className={cn(
          'block size-[56%] rounded-[10px] bg-accent',
          inner && 'shadow-[inset_0_4px_6px_rgb(0_0_0/0.55)]',
          TILE_LOOK[tile],
        )}
      />
    )
  if (tile !== 'backgroundBlur') return body
  // Background blur blurs what is behind the layer: bright stripes, softened through a frosted pane
  // that holds the sample, sharp.
  return (
    <span
      aria-hidden
      className="grid size-full place-items-center bg-[repeating-linear-gradient(135deg,#ff48b0_0_6px,#ffd23f_6px_12px,#3d6bff_12px_18px)]"
    >
      <span className="grid aspect-[4/3] h-[72%] place-items-center rounded-[8px] border border-white/60 bg-white/35 backdrop-blur-[3px]">
        {body}
      </span>
    </span>
  )
}

/** One effect's numbers and colour, with its remove button. */
function EffectRow({
  effect,
  i,
  target,
  p,
  write,
}: {
  effect: Effect
  i: number
  target: Target
  p: P
  write: (to: (now: Effect[]) => Effect[]) => void
}) {
  const change = (to: (now: Effect) => Effect) => write((now) => now.map((x, j) => (j === i ? to(x) : x)))
  const effectName = p.effect[effect.type]
  return (
    <div className={cn('flex flex-col gap-1.5', TOUCH_GAP)} data-item={`effects-${i}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text">{effectName}</span>
        <RemoveButton
          label={format(p.remove, { name: effectName.toLowerCase(), n: i + 1 })}
          onClick={() => write((now) => now.filter((_, j) => j !== i))}
        />
      </div>
      <div className={KNOBS}>
        {EFFECT_FIELDS[effect.type].map((field) => {
          const value = (effect as unknown as Record<string, number>)[field] ?? 0
          const far =
            field === 'x' || field === 'y'
              ? LIMITS.effectOffset
              : field === 'spread'
                ? LIMITS.effectSpread
                : LIMITS.effectBlur
          const min = field === 'x' || field === 'y' || (field === 'spread' && effect.type === 'dropShadow') ? -far : 0
          return (
            <NumberField
              key={field}
              label={p.effectField[field].charAt(0)}
              name={format(p.effectFieldName, { effect: effectName, n: i + 1, field: p.effectField[field] })}
              value={value}
              min={min}
              max={far}
              editor={target.editor}
              onSet={(v) => change((now) => ({ ...now, [field]: v }) as Effect)}
              onShift={(by) =>
                change(
                  (now) =>
                    ({
                      ...now,
                      [field]: tidy(clamp(((now as unknown as Record<string, number>)[field] ?? 0) + by, min, far)),
                    }) as Effect,
                )
              }
            />
          )
        })}
      </div>
      {'color' in effect && (
        <ColorField
          name={format(p.effectNamed, { effect: effectName, n: i + 1 })}
          value={effect.color}
          editor={target.editor}
          onSet={(to) => change((now) => ({ ...now, color: to('color' in now ? now.color : undefined) }) as Effect)}
        />
      )}
    </div>
  )
}
