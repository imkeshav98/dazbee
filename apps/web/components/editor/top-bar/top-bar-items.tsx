'use client'

// The top bar's items for what is selected: text, a photo, a shape, a box or several layers, each
// with the buttons and pop-ups it offers.
import {
  AlignLeftIcon,
  ArrowsClockwiseIcon,
  BoundingBoxIcon,
  CircleHalfIcon,
  CornersOutIcon,
  CropIcon,
  FadersIcon,
  ListBulletsIcon,
  ListNumbersIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  MaskHappyIcon,
  RowsIcon,
  SparkleIcon,
  StarIcon,
  TextAaIcon,
  TextAlignCenterIcon,
  TextAlignJustifyIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextBIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
  UniteSquareIcon,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import { type ShortcutAction, withImage } from '@dazbee/editor'
import { boundFillIndex, type Design, type Paint } from '@dazbee/schema'

import { nearest, useFontCatalog, weightsOf } from '@/components/brand-kit/font-catalog.ts'
import { COMBINE, DISTRIBUTE, keyOf } from '@/components/editor/arrange-actions.ts'
import { PopupContent } from '@/components/editor/edit-panel/popups.tsx'
import {
  factsOf,
  imageFillOf,
  kindOf,
  set,
  setTextFlag,
  shared,
  type Style,
  type Target,
  textFlag,
  textStyle,
} from '@/components/editor/edit-panel/target.ts'
import { type PanelId, setOpen, useEditState } from '@/components/editor/edit-store.ts'
import { ImagePickerButton } from '@/components/editor/image-tool.tsx'
import {
  BAR_BUTTON,
  BAR_DIVIDER,
  BAR_TOGGLE,
  MENU_DIVIDER,
  MENU_ITEM,
  MENU_KEY,
  MIXED_COLOUR,
} from '@/components/editor/styles.ts'
import { cn } from '@/lib/cn.ts'
import { hexOf } from '@/lib/colour.ts'
import { useMessages } from '@/lib/i18n/client.tsx'

import { BarPopover } from './bar-popover.tsx'
import { AlignRow } from './layer-actions.tsx'
import { SizeStepper } from './size-stepper.tsx'

/** One item of the bar: a button, a pop-up's button or a divider, by a key that names it. */
export type BarItem = { key: string; node: ReactNode }

/** Bold from this weight up, as type designers name their weights. */
const BOLD = 600
/** The marks on the text colour and case buttons; the same in every language, as a font sample is. */
const COLOUR_MARK = 'A'
const CASE_MARK = 'aA'

const ALIGN_ICON = {
  start: <TextAlignLeftIcon size={16} aria-hidden className="rtl:-scale-x-100" />,
  center: <TextAlignCenterIcon size={16} aria-hidden />,
  end: <TextAlignRightIcon size={16} aria-hidden className="rtl:-scale-x-100" />,
  justify: <TextAlignJustifyIcon size={16} aria-hidden />,
}

/** The items of the top bar for the selection, in order. */
export function useSelectionItems(target: Target, design: Design, brandId: string): BarItem[] {
  const t = useMessages()
  const p = t.editor.props
  const b = t.editor.bar
  const a = t.editor.arrange
  const { open } = useEditState()
  const { catalog } = useFontCatalog(brandId)
  const kind = kindOf(target)
  const facts = factsOf(target, design)
  const several = target.ids.length > 1
  const items: BarItem[] = []
  const add = (key: string, node: ReactNode) => items.push({ key, node })
  const divider = () => add(`divider-${items.length}`, <span aria-hidden className={BAR_DIVIDER} />)
  const pop = (
    id: string,
    label: string,
    children: ReactNode,
    look: { face?: ReactNode; icon?: ReactNode; testId?: string; className?: string } = {},
  ) =>
    add(
      id,
      <BarPopover
        id={id}
        open={open}
        onOpen={setOpen}
        label={label}
        face={look.face}
        icon={look.icon}
        testId={look.testId ?? id}
        className={look.className ?? 'w-auto'}
      >
        {children}
      </BarPopover>,
    )
  const popup = (id: string) => <PopupContent popup={id} target={target} design={design} />

  // A locked layer's settings would all be refused: its bar says it is locked, and unlocks it.
  const locked = target.ids.filter((id) => Object.values(design.nodes[id]?.lock ?? {}).some(Boolean))
  if (locked.length > 0) {
    add(
      'locked',
      <span data-testid="bar-locked" className="flex items-center gap-1 ps-2 text-[12.5px] font-medium text-muted">
        <LockSimpleIcon size={15} weight="fill" aria-hidden />
        {b.locked}
        <button
          type="button"
          data-bar-item
          data-testid="bar-unlock"
          onClick={() => target.editor.setLocked(locked, false)}
          className={cn(BAR_BUTTON, 'ms-1')}
        >
          <LockSimpleOpenIcon size={15} aria-hidden />
          {b.unlock}
        </button>
      </span>,
    )
    return items
  }

  // Text: its font, size and colour, its styles, and its paragraph's alignment, list, case and spacing.
  const texts =
    kind === 'text'
      ? textStyle(target).styles
      : target.props.flatMap((pr, i) => (target.types[i] === 'text' ? [pr.style as Style] : []))
  if (texts.length > 0) {
    const family = shared(texts.map((s) => s.fontFamily))
    add(
      'font',
      <PanelButton
        id="font"
        label={b.font}
        face={<span className="max-w-28 truncate">{family === 'mixed' ? t.editor.fonts.mixed : family}</span>}
      />,
    )
  }
  if (kind === 'text') {
    const color = shared(texts.map((s) => s.color))
    const align = shared(target.props.map((pr) => (pr.align ?? 'start') as keyof typeof ALIGN_ICON))
    const list = shared(target.props.map((pr) => (pr.list ?? 'none') as string))
    const bolds = texts.map((s) => s.fontWeight >= BOLD)
    const bold = bolds.every(Boolean) ? true : bolds.some(Boolean) ? 'mixed' : false
    const italics = texts.map((s) => s.fontStyle === 'italic')
    const italic = italics.every(Boolean) ? true : italics.some(Boolean) ? 'mixed' : false
    // Bold on is each family's weight nearest Bold; off, its weight nearest Regular.
    const weightFor = (fontFamily: string, on: boolean) => {
      const weights = weightsOf(catalog.find((f) => f.family === fontFamily)).filter((w) => (on ? w >= BOLD : w < BOLD))
      return weights.length > 0 ? nearest(weights, on ? 700 : 400) : null
    }
    const canBold = texts.every((s) => weightFor(s.fontFamily, bold !== true) !== null)
    const toggleBold = () => {
      if (target.range) {
        const fontWeight = weightFor(target.range[0]?.fontFamily ?? '', bold !== true)
        if (fontWeight !== null) target.editor.styleTextSelection({ fontWeight })
        return
      }
      set(target, (now) => {
        const style = now.style as Style
        const fontWeight = weightFor(style.fontFamily, bold !== true)
        return fontWeight === null ? null : { style: { ...style, fontWeight } }
      })
    }
    const flag = (key: 'underline' | 'strikethrough') => textFlag(target, key)
    add('size', <SizeStepper target={target} />)
    add(
      'colour',
      <PanelButton
        id="colour"
        label={p.textColour}
        face={
          <span aria-hidden className="flex flex-col items-center font-display text-[13px] leading-none font-bold">
            {COLOUR_MARK}
            <span
              className="mt-0.5 h-[3px] w-3.5 rounded-full"
              style={{ background: color === 'mixed' ? MIXED_COLOUR : hexOf(color) }}
            />
          </span>
        }
      />,
    )
    add(
      'bold',
      <button
        type="button"
        data-bar-item
        aria-label={b.bold}
        title={b.bold}
        aria-pressed={bold}
        disabled={!canBold}
        onClick={toggleBold}
        data-testid="bar-bold"
        className={BAR_TOGGLE}
      >
        <TextBIcon size={16} weight="bold" aria-hidden />
      </button>,
    )
    add(
      'italic',
      <button
        type="button"
        data-bar-item
        aria-label={b.italic}
        title={b.italic}
        aria-pressed={italic}
        onClick={() => textStyle(target).setStyle('fontStyle', italic === true ? 'normal' : 'italic')}
        data-testid="bar-italic"
        className={BAR_TOGGLE}
      >
        <TextItalicIcon size={16} weight="bold" aria-hidden />
      </button>,
    )
    add(
      'underline',
      <button
        type="button"
        data-bar-item
        aria-label={b.underline}
        title={b.underline}
        aria-pressed={flag('underline')}
        onClick={() => setTextFlag(target, 'underline', flag('underline') !== true)}
        data-testid="bar-underline"
        className={BAR_TOGGLE}
      >
        <TextUnderlineIcon size={16} weight="bold" aria-hidden />
      </button>,
    )
    add(
      'strikethrough',
      <button
        type="button"
        data-bar-item
        aria-label={b.strikethrough}
        title={b.strikethrough}
        aria-pressed={flag('strikethrough')}
        onClick={() => setTextFlag(target, 'strikethrough', flag('strikethrough') !== true)}
        data-testid="bar-strikethrough"
        className={BAR_TOGGLE}
      >
        <TextStrikethroughIcon size={16} weight="bold" aria-hidden />
      </button>,
    )
    pop('align', b.align, popup('align'), { face: ALIGN_ICON[align === 'mixed' ? 'start' : align] })
    pop('list', b.list, popup('list'), {
      face: list === 'number' ? <ListNumbersIcon size={16} aria-hidden /> : <ListBulletsIcon size={16} aria-hidden />,
    })
    pop('case', b.textCase, popup('case'), {
      face: (
        <span aria-hidden className="text-[13px] font-semibold">
          {CASE_MARK}
        </span>
      ),
    })
    add('spacing', <PanelButton id="spacing" label={b.spacing} icon={<TextAaIcon size={16} aria-hidden />} />)
  }

  // A photo: its look and fit, replacing and cropping it, its corners and outline.
  const photo = kind === 'photo' ? imageFillOf(target) : null
  if (photo) {
    add('edit', <PanelButton id="edit" label={b.edit} icon={<FadersIcon size={15} aria-hidden />} />)
    add(
      'replace',
      <ImagePickerButton
        brandId={brandId}
        title={p.replaceImageTitle}
        testId="bar-replace"
        below
        open={open === 'replace'}
        onOpen={(to) => setOpen(to ? 'replace' : null)}
        className={BAR_BUTTON}
        onPick={(asset) => set(target, (now) => ({ fills: withImage((now.fills ?? []) as Paint[], asset.id) }))}
      >
        <ArrowsClockwiseIcon size={15} aria-hidden />
        <span aria-hidden>{b.replace}</span>
      </ImagePickerButton>,
    )
    if (!several)
      add(
        'crop',
        <button
          type="button"
          data-bar-item
          data-testid="bar-crop"
          onClick={() => target.editor.perform('editPoints')}
          className={BAR_BUTTON}
        >
          <CropIcon size={15} aria-hidden />
          {b.crop}
        </button>,
      )
    // A photo in a box keeps the box's own settings, whose Box pop-up holds its corners.
    if (!facts.boxes && facts.ownShape === 'rect')
      pop('corners', b.corners, popup('corners'), {
        icon: <CornersOutIcon size={16} aria-hidden />,
        className: 'w-72 p-2.5',
      })
    if (facts.boxes) {
      add('stack', <PanelButton id="stack" label={b.autoLayout} icon={<RowsIcon size={15} aria-hidden />} />)
      pop('box', b.box, popup('box'), { icon: <BoundingBoxIcon size={15} aria-hidden />, className: 'w-72 p-2.5' })
    }
    add('outline', <PanelButton id="outline" label={b.outline} />)
  }

  // Shapes and boxes together keep their colour and outline.
  if (kind === 'mixed' && target.types.every((type) => type === 'graphic' || type === 'box' || type === 'boolean')) {
    add('colour', <PanelButton id="colour" label={b.fill} face={<Dot colour="mixed" />} />)
    add('outline', <PanelButton id="outline" label={b.outline} />)
  }

  // A shape or a box: its colour, outline, and its shape's or box's own settings.
  if (kind === 'shape' || kind === 'box') {
    const colour = shared(
      target.props.map((pr) => {
        const fills = (pr.fills ?? []) as Paint[]
        const fill = fills[boundFillIndex(fills)]
        return fill?.type === 'solid' ? hexOf(fill.color) : null
      }),
    )
    if (!facts.lines) add('colour', <PanelButton id="colour" label={b.fill} face={<Dot colour={colour} />} />)
    add('outline', <PanelButton id="outline" label={b.outline} />)
    if (kind === 'shape' && facts.booleans && !several)
      pop('combine', p.combine, popup('combine'), {
        icon: <UniteSquareIcon size={15} aria-hidden />,
        className: 'w-72 p-2.5',
        testId: 'combine-op',
      })
    else if (kind === 'shape' && facts.ownShape)
      pop('shape', b.shape, popup('shape'), { icon: <StarIcon size={15} aria-hidden />, className: 'w-72 p-2.5' })
    if (kind === 'box') {
      add('stack', <PanelButton id="stack" label={b.autoLayout} icon={<RowsIcon size={15} aria-hidden />} />)
      pop('box', b.box, popup('box'), { icon: <BoundingBoxIcon size={15} aria-hidden />, className: 'w-72 p-2.5' })
    }
  }

  if (facts.masks)
    pop('mask', b.mask, popup('mask'), { icon: <MaskHappyIcon size={15} aria-hidden />, className: 'w-72 p-2.5' })

  // Every selection: its effects, how much it shows through, and where it is.
  divider()
  add('effects', <PanelButton id="effects" label={p.effects} icon={<SparkleIcon size={15} aria-hidden />} />)
  pop('transparency', b.transparency, popup('transparency'), {
    face: <CircleHalfIcon size={17} aria-hidden />,
    className: 'w-72 p-2.5',
  })
  add('position', <PanelButton id="position" label={b.position} />)

  // Several layers: lining them up and spreading them, combining shapes, and stacking them.
  if (several) {
    const act = (action: ShortcutAction) => target.editor.perform(action)
    divider()
    pop(
      'line-up',
      b.lineUp,
      <>
        <AlignRow editor={target.editor} />
        <div className={MENU_DIVIDER} />
        {DISTRIBUTE.map(({ action }) => (
          <button
            key={action}
            type="button"
            data-action={action}
            disabled={target.ids.length < 3}
            onClick={() => act(action)}
            className={MENU_ITEM}
          >
            {a[action]}
            <kbd className={MENU_KEY}>{keyOf(action)}</kbd>
          </button>
        ))}
      </>,
      { icon: <AlignLeftIcon size={15} aria-hidden />, className: 'min-w-56' },
    )
    if (kind === 'shape') {
      pop(
        'combine',
        b.combine,
        <>
          {COMBINE.map(({ action, icon: Icon }) => (
            <button key={action} type="button" data-action={action} onClick={() => act(action)} className={MENU_ITEM}>
              <span className="flex items-center gap-2">
                <Icon size={16} aria-hidden />
                {a[action]}
              </span>
              <kbd className={MENU_KEY}>{keyOf(action)}</kbd>
            </button>
          ))}
        </>,
        { icon: <UniteSquareIcon size={15} aria-hidden />, className: 'min-w-56' },
      )
    }
    add(
      'autoLayout',
      <button
        type="button"
        data-bar-item
        data-action="autoLayout"
        onClick={() => act('autoLayout')}
        className={BAR_BUTTON}
      >
        <RowsIcon size={15} aria-hidden />
        {kind === 'box' ? b.stackTogether : b.autoLayout}
      </button>,
    )
  }
  return items
}

/** A bar item that opens one of the edit panels, or closes it when it is open. */
export function PanelButton({
  id,
  label,
  icon,
  face,
}: {
  id: PanelId
  label: string
  icon?: ReactNode
  face?: ReactNode
}) {
  const { open } = useEditState()
  return (
    <button
      type="button"
      data-bar-item
      aria-expanded={open === id}
      aria-controls="edit-panel"
      aria-label={face ? label : undefined}
      title={face ? label : undefined}
      data-testid={`bar-${id}`}
      data-opens={id}
      onClick={() => setOpen(open === id ? null : id)}
      className={BAR_BUTTON}
    >
      {icon}
      {face ?? label}
    </button>
  )
}

/** A swatch on a bar button: the colour, or a rainbow where the layers have different ones. */
export function Dot({ colour }: { colour: string | null | 'mixed' }) {
  return (
    <span
      aria-hidden
      className="size-4 rounded-full border border-line-strong"
      style={{ background: colour === 'mixed' || colour === null ? MIXED_COLOUR : colour }}
    />
  )
}
