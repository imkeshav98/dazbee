// The fonts and images the editor draws with: the bytes it has, decoded once, and the ones still
// coming, which the screen draws in placeholders until they arrive.
import type { CanvasKit, Image } from '@dazbee/canvaskit'
import { FONT_FACES } from '@dazbee/fonts'
import { type renderDesign, type ResourceCache, type Resources } from '@dazbee/renderer'
import { type Design, fontFamilies, imageAssetIds, type Variables } from '@dazbee/schema'

/** Where fonts and images come from, beside the fonts we ship. */
export interface ResourceSources {
  /** The stored bytes of an image asset (#35); designs with image fills need it. */
  assetBytes?: (assetId: string) => Promise<Uint8Array>
  /** The font files of the named families, from our storage (#50). */
  fontFiles?: (families: string[]) => Promise<{ family: string; bytes: Uint8Array }[]>
}

export interface ResourcesDeps {
  ck: CanvasKit
  cache: ResourceCache
  /** The bytes the design opened with. */
  first: Parameters<typeof renderDesign>[4]
  sources: ResourceSources
  /** Whether the sync server is connected: a font or image that fails offline waits for it. */
  connected: () => boolean
  /** Says what went wrong, as the loading steps do. */
  status: (status: string) => void
  /** Aborted when the editor is destroyed: what arrives after that is dropped. */
  signal: AbortSignal
}

export interface EditorResources {
  /** The bytes the editor has: fonts, images and the brand kit's values. */
  bytes(): Parameters<typeof renderDesign>[4]
  /** The bytes decoded, from the cache. */
  resources(): Resources
  /**
   * What the screen draws a design with: asks for its families and images not asked for yet, and
   * draws an image still coming clear.
   */
  screen(current: Design): Resources
  /**
   * Asks for the files of the families not asked for yet. Each family's load, settled when its
   * files are here or failed to come; undefined for a family that never loads (shipped, or no way
   * to load it).
   */
  loadFamilies(families: string[]): (Promise<void> | undefined)[]
  /** Settles once the fonts and images asked for so far are here or failed to come. */
  loaded(): Promise<undefined>
  /** The families whose files the editor has, shipped ones included (#50). */
  families(): string[]
  /** Gives bound properties new values; the brand kit's families load as the screen asks for them. */
  setVariables(variables: Variables): void
  /** Calls back when fonts or images arrive: `fonts` when they were fonts. */
  onArrive(listener: (fonts: boolean) => void): () => boolean
  destroy(): void
}

/** The families we ship are loaded already; the rest come from the catalog, when the editor was given a way. */
export const SHIPPED_FAMILIES = new Set(FONT_FACES.map((f) => f.family))

/** The fonts we ship, from the app's `/vendor/fonts/`. */
export function shippedFonts() {
  return Promise.all(FONT_FACES.map(async (f) => ({ family: f.family, bytes: await bytes(`/vendor/fonts/${f.file}`) })))
}

export async function loadImages(ids: string[], options: ResourceSources): Promise<Record<string, Uint8Array>> {
  if (ids.length === 0) return {}
  const { assetBytes } = options
  if (!assetBytes) throw new Error('the design has images, but the editor was given no way to load them')
  return Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await assetBytes(id)] as const)))
}

export async function loadFonts(
  families: string[],
  options: ResourceSources,
): Promise<{ family: string; bytes: Uint8Array }[]> {
  const wanted = families.filter((family) => !SHIPPED_FAMILIES.has(family))
  if (wanted.length === 0 || !options.fontFiles) return []
  return options.fontFiles(wanted)
}

export function editorResources({
  ck,
  cache,
  first,
  sources: options,
  connected,
  status,
  signal,
}: ResourcesDeps): EditorResources {
  let resourceBytes = first
  let resources = cache.resources(resourceBytes)
  const loading = new Set<string>()
  /** The last resources with placeholders, kept while the same images are missing so pictures stay. */
  let placeholders: { for: Resources; missing: string; resources: Resources } | null = null
  // Families text names after the design opened (a pick in the font menu, another tab) load in the
  // background (#50); until then that text draws in the fallback fonts. Exports wait for them.
  const fontsAsked = new Set([...SHIPPED_FAMILIES, ...resourceBytes.fonts.map((f) => f.family)])
  let fontsLoading: Promise<void> = Promise.resolve()
  /** Each family asked for after the design opened, settled when its files are here or failed to come. */
  const familyLoads = new Map<string, Promise<void>>()
  /** Images a design named after it opened (one placed from the asset library, #52); exports wait for them too. */
  let imagesLoading: Promise<void> = Promise.resolve()
  /** Told when fonts or images arrive. */
  const arriveListeners = new Set<(fonts: boolean) => void>()

  // Images that arrive after the design (another tab added them) load in the background; until
  // then the screen draws them clear. Exports never do: they throw until every image is loaded.
  const maybeClear = ck.MakeImage(
    {
      width: 1,
      height: 1,
      alphaType: ck.AlphaType.Premul,
      colorType: ck.ColorType.RGBA_8888,
      colorSpace: ck.ColorSpace.SRGB,
    },
    new Uint8Array(4),
    4,
  )
  if (!maybeClear) throw new Error('could not make the image placeholder')
  const clear: Image = maybeClear

  function loadNewFonts(current: Design) {
    loadFamilies(fontFamilies(current, resourceBytes.variables))
  }
  /** Asks for the files of the families not asked for yet; `fontsLoading` settles when they are here. */
  function loadFamilies(families: string[]) {
    if (!options.fontFiles) return
    const fresh = families.filter((family) => !fontsAsked.has(family))
    if (fresh.length === 0) return
    for (const family of fresh) fontsAsked.add(family)
    const loading = loadFonts(fresh, options).then(
      (fonts) => {
        if (signal.aborted || fonts.length === 0) return
        resourceBytes = { ...resourceBytes, fonts: [...resourceBytes.fonts, ...fonts] }
        resources = cache.resources(resourceBytes)
        // Auto layout measures text in its font, so every frame's scene is made again, not only its picture.
        for (const listener of arriveListeners) listener(true)
      },
      (error: unknown) => {
        // Offline, a family waits for the connection; the next redraw asks for it again.
        if (!connected()) {
          for (const family of fresh) fontsAsked.delete(family)
          return
        }
        status(`Error: a font did not load (${error instanceof Error ? error.message : String(error)})`)
      },
    )
    for (const family of fresh) familyLoads.set(family, loading)
    fontsLoading = Promise.all([fontsLoading, loading]).then(() => undefined)
  }

  function screenResources(current: Design): Resources {
    loadNewFonts(current)
    const missing = imageAssetIds(current).filter((id) => !resources.images.has(id))
    if (missing.length === 0) return resources
    const fresh = missing.filter((id) => !loading.has(id))
    if (fresh.length > 0 && options.assetBytes) {
      for (const id of fresh) loading.add(id)
      const arriving = loadImages(fresh, options)
        .then(
          (images) => {
            if (signal.aborted) return
            resourceBytes = { ...resourceBytes, images: { ...resourceBytes.images, ...images } }
            resources = cache.resources(resourceBytes)
            for (const listener of arriveListeners) listener(false)
          },
          (error: unknown) => {
            // Offline, an image waits for the connection; the next redraw asks for it again.
            if (!connected()) return
            status(`Error: an image did not load (${error instanceof Error ? error.message : String(error)})`)
          },
        )
        .finally(() => {
          for (const id of fresh) loading.delete(id)
        })
      imagesLoading = Promise.all([imagesLoading, arriving]).then(() => undefined)
    }
    const key = missing.join('\n')
    if (placeholders?.for === resources && placeholders.missing === key) return placeholders.resources
    const images = new Map(resources.images)
    for (const id of missing) images.set(id, clear)
    placeholders = { for: resources, missing: key, resources: { ...resources, images } }
    return placeholders.resources
  }

  function onArrive(listener: (fonts: boolean) => void) {
    arriveListeners.add(listener)
    return () => arriveListeners.delete(listener)
  }

  return {
    bytes: () => resourceBytes,
    resources: () => resources,
    screen: screenResources,
    loadFamilies: (families: string[]) => {
      loadFamilies(families)
      return families.map((family) => familyLoads.get(family))
    },
    loaded: () => Promise.all([fontsLoading, imagesLoading]).then(() => undefined),
    families: () => [...new Set(resourceBytes.fonts.map((f) => f.family))],
    setVariables: (variables: Variables) => {
      resourceBytes = { ...resourceBytes, variables }
    },
    onArrive,
    destroy: () => {
      arriveListeners.clear()
      clear.delete()
    },
  }
}

async function bytes(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}
