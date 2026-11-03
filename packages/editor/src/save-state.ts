// Where the design's edits are: on the sync server, on their way, or only on this device.
import { type HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider'

/** Where the design's edits are, once it is open. */
export type SaveState = 'Saved' | 'Saving' | 'Offline'
export const SAVE_STATES: readonly string[] = ['Saved', 'Saving', 'Offline'] satisfies SaveState[]

export interface SaveStateDeps {
  provider: Pick<HocuspocusProvider, 'configuration' | 'hasUnsyncedChanges' | 'on' | 'off' | 'connect' | 'disconnect'>
  /** Told each time the shown save state changes. */
  onSaveState: (state: SaveState) => void
}

/** The provider's connection and the save state shown for it. */
export interface SaveStateWatch {
  /** Whether the sync server is connected now. */
  connected(): boolean
  /** Shows the save state from now on, and follows the browser's network: called once the editor is open. */
  start(): void
  destroy(): void
}

/** How long the connection can be gone before the save state reads Offline. */
const OFFLINE_AFTER_MS = 1500

export function watchSaveState({ provider, onSaveState: status }: SaveStateDeps): SaveStateWatch {
  /** The provider's connection, as it last said. */
  let connection = provider.configuration.websocketProvider.status
  /** The save state shown, null until `start`. */
  let shown: SaveState | null = null
  /** Turns a lost connection into Offline once it has been gone a moment. */
  let offlineTimer = 0
  // Removes the browser's network listeners, on destroy.
  const listening = new AbortController()
  const on = { signal: listening.signal }

  const connected = () => connection === WebSocketStatus.Connected

  /**
   * Shows where the edits are: on the sync server, on their way, or only on this device. A lost
   * connection reads Offline after a moment, so a reconnect that takes a blink doesn't flash it.
   */
  const saveState = () => {
    let next: SaveState
    if (connection === WebSocketStatus.Connected) {
      clearTimeout(offlineTimer)
      offlineTimer = 0
      next = provider.hasUnsyncedChanges ? 'Saving' : 'Saved'
    } else if (!navigator.onLine) {
      next = 'Offline'
    } else {
      if (!offlineTimer && shown !== 'Offline') {
        offlineTimer = window.setTimeout(() => {
          offlineTimer = 0
          if (connection !== WebSocketStatus.Connected) show('Offline')
        }, OFFLINE_AFTER_MS)
      }
      next = shown === 'Offline' ? 'Offline' : 'Saving'
    }
    show(next)
  }
  const show = (next: SaveState) => {
    if (next === shown) return
    shown = next
    status(next)
  }
  const onConnection = ({ status: next }: { status: WebSocketStatus }) => {
    connection = next
    if (shown) saveState()
  }
  const onUnsynced = () => {
    if (shown) saveState()
  }

  function start() {
    // The browser knows first when the network goes: drop the socket rather than wait for it to time
    // out, and connect again as soon as the network is back.
    window.addEventListener(
      'offline',
      () => {
        provider.disconnect()
        onConnection({ status: WebSocketStatus.Disconnected })
      },
      on,
    )
    window.addEventListener('online', () => void provider.connect(), on)
    saveState()
  }

  provider.on('status', onConnection)
  provider.on('unsyncedChanges', onUnsynced)

  function destroy() {
    provider.off('unsyncedChanges', onUnsynced)
    provider.off('status', onConnection)
    clearTimeout(offlineTimer)
    listening.abort()
  }

  return {
    connected,
    start,
    destroy,
  }
}
