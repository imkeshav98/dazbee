/** The smallest valid design: one page holding one frame, which holds one rectangle. */
export const minimal = () => ({
  meta: { designId: 'd1', name: 'Minimal' },
  pages: { p1: { name: 'Page 1', order: 'a0' } },
  frames: {
    sq: {
      pageId: 'p1',
      name: 'Feed square',
      width: 1080,
      height: 1080,
      x: 0,
      y: 0,
      fills: [{ type: 'solid', color: '#FFFFFFFF' }],
      order: 'a0',
    },
  },
  nodes: {
    r1: {
      type: 'graphic',
      parentId: 'sq',
      link: 'r1',
      index: 'a0',
      name: 'Box',
      props: {
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        shape: { kind: 'rect' },
        fills: [{ type: 'solid', color: '#FF5A36FF' }],
      },
    },
  },
})
