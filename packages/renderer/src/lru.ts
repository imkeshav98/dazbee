/**
 * Values kept by key, at most `limit` of them: making one more frees the least recently used,
 * where making a value or handing it back counts as a use. `free` releases a value as it leaves,
 * and `clear` frees them all.
 */
export function lru<K, V>(limit: number, free: (value: V) => void) {
  // The values by key; insertion order is use order, so a hit moves to the end and the front goes first.
  const entries = new Map<K, V>()

  /** The value kept under `key`, or the one `make` gives, kept from then on. */
  function get(key: K, make: () => V): V {
    const hit = entries.get(key)
    if (hit !== undefined) {
      entries.delete(key)
      entries.set(key, hit)
      return hit
    }
    const made = make()
    entries.set(key, made)
    for (const [oldest, old] of entries) {
      if (entries.size <= limit) break
      entries.delete(oldest)
      free(old)
    }
    return made
  }

  function clear() {
    for (const value of entries.values()) free(value)
    entries.clear()
  }

  return { get, clear }
}
