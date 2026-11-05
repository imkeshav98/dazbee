'use client'

// The picked frame's Background panel: the kit's and the design's colours, which paint the frame's
// top fill that shows, + with any paint for it, then all its fills under Advanced. Each change is
// the frame's alone and one undo step; a kit colour paints as it is, with no binding.
import type { Editor } from '@dazbee/editor'
import { boundFillIndex, changeFill, type Design, type Paint, paintColour, showingFillIndex } from '@dazbee/schema'

import { useEditState } from '@/components/editor/edit-store.ts'
import { usePickedFrame } from '@/components/editor/editor-hooks.ts'
import { PaintEditor, PaintRow } from '@/components/editor/paint/paint-stack.tsx'
import { AddButton, ReorderList } from '@/components/editor/reorder-list.tsx'
import { FIELD_LABEL } from '@/components/editor/styles.ts'
import { useLiveDesign } from '@/components/editor/use-live-design.ts'
import { TOUCH_GAP } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { ColourChoices, FILL_ON_TOP, NEW_FILL } from './colour-panel.tsx'
import { PanelFrame } from './edit-panel.tsx'
import { PanelPart } from './fields.tsx'

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
  const paint = (hex: string) => writeFills((now) => changeFill(now, boundFillIndex(now), paintColour(hex), NEW_FILL))
  const pickFill = (to: (now: Paint) => Paint) =>
    writeFills((now) => changeFill(now, showingFillIndex(now), to, NEW_FILL))
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
            paint={fills[showingFillIndex(fills)] ?? NEW_FILL}
            brandId={brandId}
            editor={editor}
            p={p}
            onSet={pickFill}
          />
        }
      />
      <PanelPart id="background-card" title={b.advanced} strong>
        <div className={cn('flex flex-col gap-2', TOUCH_GAP)} data-testid="frame-fills">
          <div className={cn('flex items-center justify-between', FIELD_LABEL)}>
            {f.fills}
            <AddButton
              label={f.addFill}
              onClick={() =>
                writeFills((now) => [...now, now.length === 0 ? { type: 'solid', color: '#FFFFFFFF' } : FILL_ON_TOP])
              }
            />
          </div>
          <ReorderList
            items={fills}
            field="fills"
            topFirst
            removeLabel={(n) => format(p.remove, { name: f.fill, n })}
            onWrite={writeFills}
            render={(item, n, change) => (
              <PaintRow
                paint={item}
                name={format(f.fillName, { n })}
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
