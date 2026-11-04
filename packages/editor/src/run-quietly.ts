import { CommandError } from '@dazbee/doc'

/**
 * Runs a command that edits from other tabs may have made impossible, such as typing into a layer
 * just deleted elsewhere: it is refused whole and nothing happens. Returns whether it ran.
 */
export function runQuietly(run: () => unknown) {
  try {
    run()
    return true
  } catch (error) {
    if (error instanceof CommandError) return false
    throw error
  }
}
