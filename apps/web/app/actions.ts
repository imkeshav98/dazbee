'use server'

import { redirect } from 'next/navigation'

import { brandFromForm } from '@/lib/brand-start.ts'
import { createBrand } from '@/lib/server/api.ts'

/** Adds a brand from its website or name (#203), and opens its home. */
export async function addBrand(form: FormData) {
  const brand = brandFromForm(form)
  if (!brand) return
  const made = await createBrand(brand.name, brand.website)
  redirect(`/brands/${made.id}`)
}
