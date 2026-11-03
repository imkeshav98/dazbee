// Every command, by the name a session runs it with.
import { designPlace, nodeDuplicate, nodeMove, nodeReorder } from './arrange.ts'
import { nodeAutoLayout } from './auto-layout.ts'
import { formatAdd, formatRemove, formatSetPrimary, formatUpdate } from './formats.ts'
import { nodeBoolean, nodeEnclose, nodeFrame, nodeGroup, nodeHug, nodeUngroup } from './groups.ts'
import {
  nodeBind,
  nodeCreate,
  nodeDelete,
  nodeLock,
  nodeMask,
  nodeRename,
  nodeUpdate,
  nodeVisibleEverywhere,
  overrideReset,
} from './layers.ts'
import { pageAdd, pageDelete, pageDuplicate, pageMove, pageUpdate } from './pages.ts'
import { nodeReshape } from './paths.ts'
import { textEdit, textFit } from './text.ts'

export const COMMANDS = {
  'node.create': nodeCreate,
  'node.update': nodeUpdate,
  'override.reset': overrideReset,
  'node.visibleEverywhere': nodeVisibleEverywhere,
  'node.move': nodeMove,
  'node.delete': nodeDelete,
  'node.lock': nodeLock,
  'node.rename': nodeRename,
  'node.mask': nodeMask,
  'node.bind': nodeBind,
  'node.reorder': nodeReorder,
  'node.duplicate': nodeDuplicate,
  'design.place': designPlace,
  'node.group': nodeGroup,
  'node.frame': nodeFrame,
  'node.enclose': nodeEnclose,
  'node.boolean': nodeBoolean,
  'node.ungroup': nodeUngroup,
  'node.hug': nodeHug,
  'node.reshape': nodeReshape,
  'node.autoLayout': nodeAutoLayout,
  'text.edit': textEdit,
  'text.fit': textFit,
  'page.add': pageAdd,
  'page.update': pageUpdate,
  'page.duplicate': pageDuplicate,
  'page.move': pageMove,
  'page.delete': pageDelete,
  'format.add': formatAdd,
  'format.update': formatUpdate,
  'format.remove': formatRemove,
  'format.setPrimary': formatSetPrimary,
} as const
export type CommandName = keyof typeof COMMANDS
