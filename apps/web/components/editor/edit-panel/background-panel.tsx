'use client'

// The picked frame's Background panel: the kit's and the design's colours, which paint the frame's
// top fill that shows, + with any paint for it, then its background layers under Advanced. Each
// change is the frame's alone and one undo step; a kit colour paints as it is, with no binding.
import type { Editor } from '@dazbee/editor'
import { boundFillIndex, type Design, type Paint } from '@dazbee/schema'

import { useEditState } from '@/components/editor/edit-store.ts'
import { usePickedFrame } from '@/components/editor/editor-hooks.ts'
import { PaintEditor, PaintRow } from '@/components/editor/paint-stack.tsx'
import { AddButton, ReorderList } from '@/components/editor/reorder-list.tsx'
import { FIELD_LABEL } from '@/components/editor/styles.ts'
import { useLiveDesign } from '@/components/editor/use-live-design.ts'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { ColourChoices, FILL_ON_TOP, NEW_FILL } from './colour-panel.tsx'
import { PanelFrame } from './edit-panel.tsx'
import { PanelPart } from './fields.tsx'

/** The topmost fill that shows, the one the picker edits, whatever its type. */
const showing = (fills: Paint[]) => fills.findLastIndex((f) => f.visible !== false)

/** The picked frame's Background panel, while its bar has it open. */
export function BackgroundPanel({ editor, brandId }: { editor: Editor; brandId: string }) {
  const { open } = useEditState()
  const picked = usePickedFrame(editor)
  if (open !== 'background' || !picked) return null
  return <FrameBackground key={picked} editor={editor} frameId={picked} brandId={brandId} />
}

/** The panel for one frame, under the frame's name; none once the frame is gone. */
function FrameBackground({ editor, frameId, brandId }: { editor: Editor; frameId: string; brandId: string }) {
  const t = useMessages()
  const { design } = useLiveDesign(editor)
  const frame = design.frames[frameId]
  if (!frame) return null
  return (
    <PanelFrame id="background" title={t.editor.frames.background} note={frame.name}>
      <BackgroundBody editor={editor} design={design} frameId={frameId} brandId={brandId} />
    </PanelFrame>
  )
}

function BackgroundBody({
  editor,
  design,
  frameId,
  brandId,
}: {
  editor: Editor
  design: Design
  frameId: string
  brandId: string
}) {
  const t = useMessages()
  const p = t.editor.props
  const b = t.editor.bar
  const f = t.editor.frames
  const fills = design.frames[frameId]?.fills ?? []
  // Each change runs on the frame's fills as the document holds them then, and leaves a frame
  // another tab deleted a moment ago be.
  const writeFills = (to: (now: Paint[]) => Paint[]) => {
    const now = editor.design().frames[frameId]
    if (now) editor.session.run('frame.update', { frameId, fills: to(now.fills) })
  }
  const bound = fills[boundFillIndex(fills)]
  const paint = (hex: string) =>
    writeFills((now) => {
      const i = boundFillIndex(now)
      const solid: Paint = { type: 'solid', color: `${hex.toUpperCase()}FF` }
      return i < 0
        ? [...now, solid]
        : now.map((fill, j) => (j === i ? (fill.type === 'solid' ? { ...fill, color: solid.color } : solid) : fill))
    })
  const pickFill = (to: (now: Paint) => Paint) =>
    writeFills((now) => {
      const i = showing(now)
      return i < 0 ? [...now, to(NEW_FILL)] : now.map((fill, j) => (j === i ? to(fill) : fill))
    })
  return (
    <>
      <ColourChoices
        design={design}
        brandId={brandId}
        p={p}
        b={b}
        current={bound?.type === 'solid' ? bound.color : undefined}
        paint={paint}
        picker={
          <PaintEditor
            paint={fills[showing(fills)] ?? NEW_FILL}
            brandId={brandId}
            editor={editor}
            p={p}
            onSet={pickFill}
          />
        }
      />
      <PanelPart id="background-card" title={b.advanced} strong>
        <div className="flex flex-col gap-2" data-testid="frame-fills">
          <div className={cn('flex items-center justify-between', FIELD_LABEL)}>
            {f.layers}
            <AddButton
              label={f.addLayer}
              onClick={() =>
                writeFills((now) => [...now, now.length === 0 ? { type: 'solid', color: '#FFFFFFFF' } : FILL_ON_TOP])
              }
            />
          </div>
          <ReorderList
            items={fills}
            field="fills"
            topFirst
            removeLabel={(n) => format(p.remove, { name: f.layer, n })}
            onWrite={writeFills}
            render={(item, n, change) => (
              <PaintRow
                paint={item}
                name={format(f.layerName, { n })}
                brandId={brandId}
                editor={editor}
                p={p}
                onSet={change}
              />
            )}
          />
        </div>
      </PanelPart>
    </>
  )
}
