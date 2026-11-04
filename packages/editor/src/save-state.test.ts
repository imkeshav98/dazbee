import { WebSocketStatus } from '@hocuspocus/provider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type SaveState, type SaveStateDeps, watchSaveState } from './save-state.ts'

/** A sync provider that only holds a connection status and unsynced changes, and says when they change. */
function fakeProvider(status = WebSocketStatus.Connected) {
  const listeners = new Map<string, Set<(event?: unknown) => void>>()
  const fake = {
    configuration: { websocketProvider: { status } },
    hasUnsyncedChanges: false,
    connects: 0,
    disconnects: 0,
    on(event: string, listener: (event?: unknown) => void) {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(listener))
      return fake
    },
    off(event: string, listener: (event?: unknown) => void) {
      listeners.get(event)?.delete(listener)
      return fake
    },
    connect() {
      fake.connects++
      return Promise.resolve()
    },
    disconnect() {
      fake.disconnects++
    },
    /** The connection going up or down, as the provider reports it. */
    status(next: WebSocketStatus) {
      fake.configuration.websocketProvider.status = next
      for (const listener of listeners.get('status') ?? []) listener({ status: next })
    },
    /** Edits waiting for the sync server, or none left. */
    unsynced(waiting: boolean) {
      fake.hasUnsyncedChanges = waiting
      for (const listener of listeners.get('unsyncedChanges') ?? []) listener()
    },
    listening: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
  }
  return fake
}

/** A save state on a fake provider, with every state it showed. */
function watched(status?: WebSocketStatus) {
  const provider = fakeProvider(status)
  const shown: SaveState[] = []
  const watch = watchSaveState({
    provider: provider as unknown as SaveStateDeps['provider'],
    onSaveState: (state) => shown.push(state),
  })
  return { provider, shown, watch }
}

let online = true
let browser = new EventTarget()

beforeEach(() => {
  vi.useFakeTimers()
  online = true
  browser = new EventTarget()
  vi.stubGlobal('navigator', {
    get onLine() {
      return online
    },
  })
  vi.stubGlobal(
    'window',
    Object.assign(browser, { setTimeout: (run: () => void, ms: number) => setTimeout(run, ms) as unknown as number }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('watchSaveState', () => {
  it('shows nothing until it starts, then where the edits are', () => {
    const { provider, shown, watch } = watched()
    provider.unsynced(true)
    expect(shown).toEqual([])
    watch.start()
    expect(shown).toEqual(['Saving'])
    provider.unsynced(false)
    expect(shown).toEqual(['Saving', 'Saved'])
  })

  it('shows a state once, not again while it holds', () => {
    const { provider, shown, watch } = watched()
    watch.start()
    provider.unsynced(false)
    provider.status(WebSocketStatus.Connected)
    expect(shown).toEqual(['Saved'])
  })

  it('reads Saving while the connection is gone, and Offline only after a moment', () => {
    const { provider, shown, watch } = watched()
    watch.start()
    provider.status(WebSocketStatus.Disconnected)
    expect(shown).toEqual(['Saved', 'Saving'])
    vi.advanceTimersByTime(1499)
    expect(shown).toEqual(['Saved', 'Saving'])
    vi.advanceTimersByTime(1)
    expect(shown).toEqual(['Saved', 'Saving', 'Offline'])
    // Still gone: it keeps reading Offline, not Saving.
    provider.status(WebSocketStatus.Connecting)
    expect(shown).toEqual(['Saved', 'Saving', 'Offline'])
    provider.status(WebSocketStatus.Connected)
    expect(shown).toEqual(['Saved', 'Saving', 'Offline', 'Saved'])
  })

  it('never flashes Offline for a reconnect that takes a blink', () => {
    const { provider, shown, watch } = watched()
    watch.start()
    provider.status(WebSocketStatus.Disconnected)
    vi.advanceTimersByTime(1000)
    provider.status(WebSocketStatus.Connected)
    vi.advanceTimersByTime(5000)
    expect(shown).toEqual(['Saved', 'Saving', 'Saved'])
  })

  it('reads Offline at once when the browser has no network', () => {
    const { provider, shown, watch } = watched()
    watch.start()
    online = false
    provider.status(WebSocketStatus.Disconnected)
    expect(shown).toEqual(['Saved', 'Offline'])
  })

  it('opens Offline when it starts without a connection and the browser has no network', () => {
    online = false
    const { shown, watch } = watched(WebSocketStatus.Disconnected)
    watch.start()
    expect(shown).toEqual(['Offline'])
  })

  it('drops the socket when the browser goes offline, and connects again when it is back', () => {
    const { provider, shown, watch } = watched()
    watch.start()
    online = false
    browser.dispatchEvent(new Event('offline'))
    expect(provider.disconnects).toBe(1)
    expect(watch.connected()).toBe(false)
    expect(shown).toEqual(['Saved', 'Offline'])
    online = true
    browser.dispatchEvent(new Event('online'))
    expect(provider.connects).toBe(1)
  })

  it('says whether the sync server is connected', () => {
    const { provider, watch } = watched(WebSocketStatus.Connecting)
    expect(watch.connected()).toBe(false)
    provider.status(WebSocketStatus.Connected)
    expect(watch.connected()).toBe(true)
    provider.status(WebSocketStatus.Disconnected)
    expect(watch.connected()).toBe(false)
  })

  it('stops listening and showing once destroyed', () => {
    const { provider, shown, watch } = watched()
    watch.start()
    provider.status(WebSocketStatus.Disconnected)
    watch.destroy()
    vi.advanceTimersByTime(5000)
    provider.status(WebSocketStatus.Connected)
    browser.dispatchEvent(new Event('offline'))
    browser.dispatchEvent(new Event('online'))
    expect(shown).toEqual(['Saved', 'Saving'])
    expect(provider.listening()).toBe(0)
    expect(provider.disconnects).toBe(0)
    expect(provider.connects).toBe(0)
  })
})
