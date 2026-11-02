'use client'

// Where the panels' and the bar's changes go when a design has more than one format: the format
// shown, as a canvas drag does, or every format. One choice for the header card's chip and the
// bar's menus, kept while the selection changes until nothing is selected.
import { useSyncExternalStore } from 'react'

let everyFormat = false
const listeners = new Set<() => void>()

export function setEveryFormat(every: boolean) {
  everyFormat = every
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useEveryFormat() {
  return useSyncExternalStore(subscribe, () => everyFormat, () => false)
}
