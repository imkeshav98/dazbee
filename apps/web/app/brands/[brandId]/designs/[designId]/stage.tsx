'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

import { type Editor, SHAPE_MENU_TOOLS, type ShapeMenuTool, startEditor, type Tool } from '@dazbee/editor'
import { isVectorAsset } from '@dazbee/schema'

import { ASSET_DRAG_TYPE, draggedAsset, VECTOR_DRAG_TYPE } from '@/components/editor/asset-drag.ts'
import { AddFramePanel, useFrameToolCard } from '@/components/editor/edit-panel/add-frame-panel.tsx'
import { BackgroundPanel } from '@/components/editor/edit-panel/background-panel.tsx'
import { EditPanel } from '@/components/editor/edit-panel/edit-panel.tsx'
import { useEditState } from '@/components/editor/edit-store.ts'
import { EmptyPageHint } from '@/components/editor/empty-page-hint.tsx'
import { AssetLibrary } from '@/components/editor/flyouts/asset-library.tsx'
import { BrandKitPanel } from '@/components/editor/flyouts/brand-kit-panel.tsx'
import { LayersPanel } from '@/components/editor/flyouts/layers-panel.tsx'
import { FrameRename } from '@/components/editor/frame-rename.tsx'
import { ShareMenu } from '@/components/editor/menus/share-menu.tsx'
import { ZoomControl } from '@/components/editor/menus/zoom-control.tsx'
import { PagesButton, PagesPanel } from '@/components/editor/pages-panel.tsx'
import { type ChromeInsets, EditorShell } from '@/components/editor/shell.tsx'
import { NoticeToast, UndoToast } from '@/components/editor/toasts.tsx'
import { HistoryButtons } from '@/components/editor/top-bar/history-buttons.tsx'
import { SmallMenu } from '@/components/editor/top-bar/small-menu.tsx'
import { hiddenAt, type HiddenLayers, StageMenu } from '@/components/editor/top-bar/stage-menu.tsx'
import { TopBar } from '@/components/editor/top-bar/top-bar.tsx'
import { carriesFiles, dragFills, dropAt, isAssetFile, placeDroppedFiles } from '@/lib/editor/drop-files.ts'
import { placeAsset } from '@/lib/editor/place-asset.ts'
import { useValue, type ValueStore, valueStore } from '@/lib/editor/value-store.ts'
import { frameName } from '@/lib/frame-name.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { fetchSyncToken, renameFromEditor } from './actions.ts'
import { assetBytes, brandKitVariables, fontLoader, keepForOffline } from './editor-io.ts'

declare global {
  interface Window {
    dazbee?: Editor
  }
}

/** The editor's tools that the dock shows as the one shape button. */
const isShapeMenuTool = (tool: Tool): tool is ShapeMenuTool => (SHAPE_MENU_TOOLS as readonly string[]).includes(tool)

export function EditorStage({
  designId,
  designName,
  brandId,
  brandName,
  everyBrand,
  syncUrl,
  account,
}: {
  designId: string
  designName: string
  brandId: string
  brandName: string
  /** How the workspace says "every brand", for a template's scope (#54). */
  everyBrand: string
  syncUrl: string
  /** The account avatar and its menu, at the top end after Share. */
  account?: ReactNode
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  // The name as last saved from the crumb, so it shows at once without reloading the page.
  const [name, setName] = useState(designName)
  // The save state and zoom change on every edit and zoom step; held outside this component's state,
  // they re-render the status and the zoom pill alone, not the whole editor.
  const [status] = useState(() => valueStore('Starting'))
  const [zoom] = useState(() => valueStore<number | null>(null))
  const [editor, setEditor] = useState<Editor | null>(null)
  const [removed, setRemoved] = useState<string | null>(null)
  // Why a gesture did nothing: auto layout decides where a layer in its flow goes.
  const notices = useMessages().editor.notices
  const svgParts = useMessages().editor.svgParts
  // The messages a frame drawn with the Frame tool is named from, as they are when it is drawn.
  const t = useMessages()
  const messages = useRef(t)
  useEffect(() => {
    messages.current = t
  }, [t])
  const locale = useLocale()
  const [notice, setNotice] = useState<{ text: string; at: number; lasting?: boolean } | null>(null)
  // A right-click on a layer: where, for the menu of its actions, and a count so each right-click opens its own.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; n: number; hidden: HiddenLayers | null } | null>(null)
  const dismissNotice = useCallback(() => setNotice(null), [])
  // Where the open sheet starts on a phone: the toasts sit above it.
  const { sheetTop } = useEditState()
  useEffect(() => {
    if (!editor) return
    const stop = editor.onNotice((n, parts) => {
      const listed = new Intl.ListFormat(locale, { type: 'conjunction' }).format(parts.map((part) => svgParts[part]))
      setNotice({ text: format(notices[n], { parts: listed }), at: Date.now() })
    })
    return () => {
      stop()
    }
  }, [editor, notices, svgParts, locale])
  // The dock follows the editor's tool: a key picks one, and drawing a shape goes back to select.
  const [tool, setEditorTool] = useState<Tool>('select')
  const [shape, setShape] = useState<ShapeMenuTool>('rect')
  // The image tool's picker shows until an image is picked; any other tool forgets the pick.
  const [imagePicked, setImagePicked] = useState(false)
  useEffect(() => {
    if (!editor) return
    const stop = editor.onTool((next) => {
      setEditorTool(next)
      if (next !== 'image') setImagePicked(false)
      if (isShapeMenuTool(next)) setShape(next)
    })
    return () => {
      stop()
    }
  }, [editor])
  const dockTool = isShapeMenuTool(tool) ? 'shape' : tool
  // The Frame tool opens Add a frame, and closing the card puts the tool down.
  useFrameToolCard(editor, tool)
  const dismissRemoved = useCallback(() => setRemoved(null), [])
  // A frame Delete deleted, by its key or its ⋯ menu, says so with its undo, as a deleted page does.
  const frameRemoved = t.editor.frames.removed
  useEffect(() => {
    if (!editor) return
    const stop = editor.onFrameDelete((frameName) => setRemoved(format(frameRemoved, { name: frameName })))
    return () => {
      stop()
    }
  }, [editor, frameRemoved])

  // Files dropped from the computer: the images upload into the library and go where they were
  // dropped. The notice says what was left out and stays while the rest upload, then says what was
  // left out, what didn't upload and what wasn't placed. The library, if open, shows the uploads.
  const dropped = useMessages().editor.droppedFiles
  const [uploaded, setUploaded] = useState(0)
  const dropFiles = (files: File[], client: { x: number; y: number }) => {
    if (!editor) return
    const list = (items: string[]) => new Intl.ListFormat(locale, { type: 'conjunction' }).format(items)
    const take = files.filter(isAssetFile)
    const left = files.filter((file) => !isAssetFile(file))
    const leftOut = left.length > 0 ? format(dropped.notImages, { names: list(left.map((file) => file.name)) }) : ''
    const at = Date.now()
    if (!take[0]) {
      if (leftOut) setNotice({ text: leftOut, at })
      return
    }
    const uploading =
      take.length === 1
        ? format(dropped.uploading, { name: take[0].name })
        : format(dropped.uploadingMany, { n: take.length })
    setNotice({ text: [leftOut, uploading].filter(Boolean).join(' '), at, lasting: true })
    void placeDroppedFiles(editor, brandId, take, dropAt(editor, client, files)).then(({ failed, unplaced }) => {
      setUploaded((n) => n + 1)
      const didntUpload =
        failed.length > 0
          ? format(dropped.failed, { files: list(failed.map((file) => format(dropped.failedFile, file))) })
          : ''
      const text = [leftOut, didntUpload, unplaced > 0 ? dropped.offPage : ''].filter(Boolean).join(' ')
      setNotice((now) => (text ? { text, at } : now?.at === at ? null : now))
    })
  }

  // The stage's edges the always-on chrome covers: the editor fits the ads between them. The
  // first time the editor and they are both known the design is fitted again, since it opened
  // fitted to the whole stage. The editor counts as ready only after that, so nothing set on its
  // camera (or read from it) before then is undone by the fit.
  const [chrome, setChrome] = useState<ChromeInsets | null>(null)
  const onInsets = useCallback((insets: ChromeInsets) => setChrome(insets), [])
  const [fittedTo, setFittedTo] = useState<Editor | null>(null)
  useEffect(() => {
    if (!editor || !chrome) return
    editor.setInsets(chrome)
    if (fittedTo !== editor) {
      editor.fitAll()
      setFittedTo(editor)
    }
  }, [editor, chrome, fittedTo])

  // Lets this page open again without a connection (#37): the worker keeps the page and what it
  // loaded, and the design itself is in IndexedDB.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // In development the worker would keep serving the chunks from before an edit, so it is
    // never used there, and one left from a production build is removed.
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then((all) => Promise.all(all.map((r) => r.unregister())))
      return
    }
    navigator.serviceWorker
      .register('/sw.js')
      .then(keepForOffline)
      .catch(() => {
        // Without the worker the editor still works online; only reopening offline is lost.
      })
  }, [])

  useEffect(() => {
    if (!canvas.current || !overlay.current) return
    let editor: Editor | undefined
    const unmounted = new AbortController()
    const [stage, layer] = [canvas.current, overlay.current]
    brandKitVariables(brandId)
      .then((variables) =>
        startEditor({
          canvas: stage,
          overlay: layer,
          designId,
          syncUrl,
          syncToken: () => fetchSyncToken(brandId, designId),
          assetBytes: (assetId) => assetBytes(brandId, assetId),
          fontFiles: fontLoader(brandId),
          ...(variables ? { variables } : {}),
          onStatus: status.set,
          onZoom: zoom.set,
          frameName: (width, height) => frameName(messages.current, width, height),
          signal: unmounted.signal,
        }),
      )
      .then((started) => {
        if (unmounted.signal.aborted) return started.destroy()
        editor = started
        window.dazbee = started
        setEditor(started)
        // CanvasKit and the fonts may have loaded before the worker was in charge.
        void keepForOffline()
      })
      .catch((error: unknown) => {
        if (!unmounted.signal.aborted) status.set(`Error: ${error instanceof Error ? error.message : String(error)}`)
      })
    return () => {
      unmounted.abort()
      editor?.destroy()
      delete window.dazbee
      setEditor(null)
      zoom.set(null)
    }
  }, [brandId, designId, syncUrl, status, zoom])

  return (
    <EditorShell
      brandId={brandId}
      brandName={brandName}
      designName={name}
      onRename={async (next) => setName(await renameFromEditor(brandId, designId, next))}
      status={status}
      history={editor ? <HistoryButtons editor={editor} /> : undefined}
      tool={dockTool}
      shape={shape}
      onToolChange={(tool, picked) => {
        setShape(picked)
        // Pressing the image tool again asks for another image.
        if (tool === 'image') {
          editor?.armImage(null)
          setImagePicked(false)
        }
        editor?.setTool(tool === 'shape' ? picked : tool)
      }}
      image={{
        picking: !imagePicked,
        onPick: (asset) => {
          // An SVG file goes on the frame in view at once, as layers; an image is placed by a click or a drag.
          if (isVectorAsset(asset)) {
            if (editor) placeAsset(editor, brandId, asset)
            return
          }
          editor?.armImage(asset)
          setImagePicked(true)
        },
      }}
      onInsets={onInsets}
      fitted={editor !== null && fittedTo === editor}
      actions={
        editor ? (
          <ShareMenu
            editor={editor}
            brandId={brandId}
            brandName={brandName}
            designName={name}
            everyBrand={everyBrand}
          />
        ) : undefined
      }
      account={account}
      flyouts={
        editor
          ? {
              layers: <LayersPanel editor={editor} />,
              assets: <AssetLibrary editor={editor} brandId={brandId} changed={uploaded} />,
              brand: <BrandKitPanel editor={editor} brandId={brandId} />,
            }
          : {}
      }
    >
      {/* The design is a picture, so it never mirrors: the stage stays left to right in Arabic too. */}
      {/* An asset dragged from the library lands where it is dropped (#52): into the shape it is
          dropped on, lit while it is over it, or as a new layer. Image files dropped from the
          computer upload first, then land the same way. */}
      <div
        dir="ltr"
        className="absolute inset-0"
        onContextMenu={(e) => {
          if (!editor || e.target !== canvas.current) return
          e.preventDefault()
          const client = { x: e.clientX, y: e.clientY }
          const ids = editor.selectAt(client)
          // On empty canvas, in a frame or outside every one, the menu only offers to show the hidden
          // layers of the frame there or nearest, when it has some.
          const hidden = ids.length > 0 ? null : hiddenAt(editor, client)
          const box = e.currentTarget.getBoundingClientRect()
          setMenuAt((now) =>
            ids.length > 0 || hidden
              ? { x: client.x - box.left, y: client.y - box.top, n: (now?.n ?? 0) + 1, hidden }
              : null,
          )
        }}
        onDragOver={(e) => {
          if (!editor) return
          if (!e.dataTransfer.types.includes(ASSET_DRAG_TYPE) && carriesFiles(e.dataTransfer)) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
            editor.imageTarget(dragFills(e.dataTransfer) ? { x: e.clientX, y: e.clientY } : null)
            return
          }
          if (!e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          // An SVG file becomes layers of its own, so no shape lights up to take it.
          if (!e.dataTransfer.types.includes(VECTOR_DRAG_TYPE)) editor.imageTarget({ x: e.clientX, y: e.clientY })
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) editor?.imageTarget(null)
        }}
        onDrop={(e) => {
          const asset = editor && draggedAsset(e)
          if (editor && !asset && carriesFiles(e.dataTransfer)) {
            e.preventDefault()
            editor.imageTarget(null)
            dropFiles([...e.dataTransfer.files], { x: e.clientX, y: e.clientY })
            return
          }
          if (!asset) return
          e.preventDefault()
          const at = { x: e.clientX, y: e.clientY }
          const into = isVectorAsset(asset) ? null : editor.imageTarget(at)
          if (!into || !editor.fillWithImage(into, asset)) placeAsset(editor, brandId, asset, at)
          editor.imageTarget(null)
        }}
      >
        <canvas ref={canvas} className="block size-full touch-none" data-testid="stage" />
        <div ref={overlay} className="stage-overlay pointer-events-none absolute inset-0 overflow-hidden" aria-hidden />
        {editor && <FrameRename editor={editor} />}
        {editor && menuAt && (
          <StageMenu
            key={menuAt.n}
            editor={editor}
            at={menuAt}
            hidden={menuAt.hidden}
            onClose={() => setMenuAt(null)}
          />
        )}
      </div>
      {/* The top bar, the small menu and the edit panel follow the page's direction, so they mirror in Arabic. */}
      {editor && <TopBar editor={editor} brandId={brandId} />}
      {editor && <SmallMenu editor={editor} rightClick={menuAt !== null} />}
      {editor && <EditPanel editor={editor} brandId={brandId} />}
      {editor && <BackgroundPanel editor={editor} brandId={brandId} />}
      {editor && <AddFramePanel editor={editor} />}
      {editor && <PagesPanel editor={editor} onRemoved={setRemoved} />}
      {editor && <EmptyPageHint editor={editor} />}
      <div
        data-toasts
        style={sheetTop === null ? undefined : { bottom: `calc(100% - ${sheetTop}px + 8px)` }}
        className="pointer-events-none absolute start-4 bottom-4 z-30"
      >
        {editor && removed && <UndoToast key={removed} editor={editor} message={removed} onDone={dismissRemoved} />}
        {!removed && notice && (
          <NoticeToast key={notice.at} message={notice.text} onDone={dismissNotice} lasting={notice.lasting ?? false} />
        )}
      </div>
      <StageZoom editor={editor} store={zoom} />
    </EditorShell>
  )
}

/** The zoom pill, reading the zoom from the store, and Pages beside it. */
function StageZoom({ editor, store }: { editor: Editor | null; store: ValueStore<number | null> }) {
  const zoom = useValue(store)
  return (
    <>
      <ZoomControl zoom={editor ? zoom : null} editor={editor} />
      <PagesButton editor={editor} />
    </>
  )
}
