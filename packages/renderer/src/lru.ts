/**
 * Values kept by key, at most `limit` of them: setting one more frees the least recently used,
 * where a set or a hit counts as a use. `free` releases a value as it leaves, and `clear` frees
 * them all. `set` is for a key not held.
 */
export function lru<K, V>(limit: number, free: (value: V) => void) {
  // The values by key; insertion order is use order, so a hit moves to the end and the front goes first.
  const entries = new Map<K, V>()

  function get(key: K): V | undefined {
    const hit = entries.get(key)
    if (hit !== undefined) {
      entries.delete(key)
      entries.set(key, hit)
    }
    return hit
  }

  function set(key: K, value: V) {
    entries.set(key, value)
    for (const [oldest, old] of entries) {
      if (entries.size <= limit) break
      entries.delete(oldest)
      free(old)
    }
  }

  function clear() {
    for (const value of entries.values()) free(value)
    entries.clear()
  }

  return { get, set, clear }
}
