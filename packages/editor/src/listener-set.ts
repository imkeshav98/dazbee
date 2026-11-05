/**
 * The listeners to one of the Editor's events: `on` adds one and returns what takes it out again,
 * `emit` tells each of them, and `next` resolves the next time they are told.
 */
export function listenerSet<A extends unknown[]>() {
  const listeners = new Set<(...args: A) => void>()
  const on = (listener: (...args: A) => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const emit = (...args: A) => {
    for (const listener of listeners) listener(...args)
  }
  const next = () =>
    new Promise<void>((resolve) => {
      const off = on(() => {
        off()
        resolve()
      })
    })
  return { on, emit, next, clear: () => listeners.clear() }
}
