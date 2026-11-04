// Filling the app's fields as a person does: typing a value and pressing Enter, and picking from the
// app's own dropdowns (components/ui/select.tsx) by opening the field, then pressing the option. The
// list is drawn over the page, outside the field.
import type { Locator } from '@playwright/test'

export async function choose(field: Locator, value: string) {
  await field.click()
  await field.page().locator(`[role="listbox"] [role="option"][data-value="${value}"]`).click()
}

/** Types a value into a field and presses Enter. */
export const enter = async (field: Locator, value: string) => {
  await field.fill(value)
  await field.press('Enter')
}
