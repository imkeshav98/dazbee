// Every command, by the name a session runs it with.
import { designPlace, nodeDuplicate, nodeMove, nodeReorder } from './arrange.ts'
import { nodeAutoLayout } from './auto-layout.ts'
import { frameAdd, frameAddSize, frameDelete, frameDuplicate, frameUpdate } from './frames.ts'
import { nodeBoolean, nodeBox, nodeEnclose, nodeGroup, nodeHug, nodeUngroup } from './groups.ts'
import { nodeBind, nodeCreate, nodeDelete, nodeLock, nodeMask, nodeRename, nodeUpdate } from './layers.ts'
import { pageAdd, pageDelete, pageDuplicate, pageMove, pageUpdate } from './pages.ts'
import { nodeReshape } from './paths.ts'
import { textEdit, textFit } from './text.ts'

export const COMMANDS = {
  'node.create': nodeCreate,
  'node.update': nodeUpdate,
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
  'node.box': nodeBox,
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
  'frame.add': frameAdd,
  'frame.update': frameUpdate,
  'frame.duplicate': frameDuplicate,
  'frame.addSize': frameAddSize,
  'frame.delete': frameDelete,
} as const
export type CommandName = keyof typeof COMMANDS
