import { useLayoutEffect, useState } from 'react'

/**
 * Under 640 px wide the editor is laid out for a phone: the edit panel is a sheet and the top bar
 * wraps into two rows. Read before the first paint, so a menu that opens on a phone, as the right-click menu
 * does, never shows a frame laid out for a wider screen first.
 */
export function usePhone() {
  const [phone, setPhone] = useState(false)
  useLayoutEffect(() => {
    const query = window.matchMedia('(max-width: 639px)')
    const update = () => setPhone(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return phone
}
