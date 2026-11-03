import { SCHEMA_VERSION } from './migrate.ts'

/** The smallest valid design: one page, one format, one rectangle. */
export const minimal = () => ({
  meta: { schemaVersion: SCHEMA_VERSION, designId: 'd1', name: 'Minimal', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    r1: {
      type: 'graphic',
      parentId: 'p1',
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
  overrides: {},
})
