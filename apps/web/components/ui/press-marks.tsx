'use client'

import { useEffect } from 'react'

import { markPresses } from '@/lib/press.ts'

/** Marks what a finger or pen holds pressed, so it shows the pressed tint on phones too. */
export function PressMarks() {
  useEffect(() => markPresses(), [])
  return null
}
