export { CommandError, defineCommand, type Command } from './commands/define.ts'
export { ancestorsOf, childrenOf, descendants, isInside } from './children.ts'
export { COMMANDS, type CommandName } from './commands/index.ts'
export {
  anchorOffset,
  loadDesign,
  readDesign,
  snapshot,
  textAnchor,
  type DesignDoc,
  type TextAnchor,
} from './design-doc.ts'
export { compact, COMPACTION } from './compact.ts'
export { migrateDoc } from './migrate.ts'
export { openSession, type Session } from './session.ts'
export { boundsOf, centreOf, cornersOf, normalAngle, round, turn, type Box, type Point } from './geometry.ts'
export { withFreshIds } from './fresh-ids.ts'
export { mergedProps } from './commands/placement.ts'
