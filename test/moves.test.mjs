// The tab model's moves, run from client.js's own source (the part between "-- the tree" and
// createStore). Run: node --test test/moves.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const a = src.indexOf('    // -- the tree'), b = src.indexOf('    function createStore()')
const lib = new Function('MAX_PANES', src.slice(a, b) + '\nreturn { M, fromSaved, freshDoc, normalize, sidsOf, cur, where, tabOf, clone }')(4)
const { M, fromSaved, freshDoc, normalize, sidsOf, cur, where, clone } = lib

/** Run a move as the store does: clone, move, normalize, commit unless false or a refusal. */
const run = (d, name, ...args) => { const c = clone(d); const r = M[name](c, ...args); if (r === false || r.keep) return d; normalize(c); return c }
const order = (d) => d.tabs.map((x) => sidsOf(x.root).join('+'))
const open = (...sids) => sids.reduce((d, s) => run(d, 'openSession', s), freshDoc())
const sidActive = (d) => sidsOf(cur(d).root).join('+')

test('a new tab goes at the end and becomes active; reopening an open one only activates it', () => {
  let d = open('a', 'b', 'c')
  assert.deepEqual(order(d), ['a', 'b', 'c'])
  assert.equal(sidActive(d), 'c')
  d = run(d, 'openSession', 'a')
  assert.deepEqual(order(d), ['a', 'b', 'c'])
  assert.equal(sidActive(d), 'a')
})

test('switching never moves a tab', () => {
  let d = open('a', 'b', 'c', 'd')
  d = run(d, 'nth', 2); d = run(d, 'next', 1); d = run(d, 'next', -1); d = run(d, 'nth', 9)
  assert.deepEqual(order(d), ['a', 'b', 'c', 'd'])
  assert.equal(sidActive(d), 'd')
})

test('closing activates the tab below, or above when it was last; ⌥⇧T reopens', () => {
  let d = open('a', 'b', 'c')
  d = run(d, 'nth', 2); d = run(d, 'closeTab', cur(d).id)
  assert.deepEqual(order(d), ['a', 'c']); assert.equal(sidActive(d), 'c')
  d = run(d, 'closeTab', cur(d).id)
  assert.equal(sidActive(d), 'a'); assert.equal(where(d, 'b'), 'drawer')
  d = run(d, 'reopen')
  assert.deepEqual(order(d), ['a', 'c'])
  d = run(d, 'reopen')
  assert.deepEqual(order(d), ['a', 'c', 'b'])
})

test('a split: join, move out (lands right after), separate, close one pane', () => {
  let d = open('a', 'b', 'c')
  d = run(d, 'nth', 1)
  const pane = cur(d).root.id
  d = run(d, 'join', pane, 'right', { src: 'tab', key: d.tabs[2].id })
  assert.deepEqual(order(d), ['a+c', 'b'])
  d = run(d, 'moveOut', 'c')
  assert.deepEqual(order(d), ['a', 'c', 'b'])
  d = run(d, 'nth', 1)
  d = run(d, 'join', cur(d).root.id, 'bottom', { src: 'session', key: 'b' })
  assert.deepEqual(order(d), ['a+b', 'c'])
  d = run(d, 'closeSession', 'b')
  assert.deepEqual(order(d), ['a', 'c'])
  d = run(d, 'join', cur(d).root.id, 'right', { src: 'session', key: 'c' })
  d = run(d, 'separate', cur(d).id)
  assert.deepEqual(order(d), ['a', 'c'])
})

test('replace: the replaced session takes the dragged tab\'s slot', () => {
  let d = open('a', 'b', 'c')
  d = run(d, 'nth', 1)
  d = run(d, 'replacePane', cur(d).root.id, { src: 'tab', key: d.tabs[2].id })
  assert.deepEqual(order(d), ['c', 'b', 'a'])
})

test('reorder on the strip and groups stay contiguous', () => {
  let d = open('a', 'b', 'c', 'd')
  d = run(d, 'toStrip', { src: 'tab', key: d.tabs[3].id }, 0, null)
  assert.deepEqual(order(d), ['d', 'a', 'b', 'c'])
  d = run(d, 'newGroup', d.tabs[1].id, 'g1')
  d = run(d, 'addToGroup', d.tabs[3].id, 'g1')
  assert.deepEqual(order(d), ['d', 'a', 'c', 'b'])
  d = run(d, 'toStrip', { src: 'group', key: 'g1' }, 4, null)
  assert.deepEqual(order(d), ['d', 'b', 'a', 'c'])
  d = run(d, 'toStrip', { src: 'tab', key: d.tabs[0].id }, 3, 'g1')
  assert.deepEqual(order(d), ['b', 'a', 'd', 'c'])
  assert.equal(d.tabs[2].group, 'g1')
  d = run(d, 'ungroupTab', d.tabs[1].id)
  assert.deepEqual(order(d), ['b', 'd', 'c', 'a'])
  d = run(d, 'closeGroup', 'g1')
  assert.deepEqual(order(d), ['b', 'a']); assert.equal(d.groups.length, 0)
})

test('group by project: singles get a group too; a split joins only when one project', () => {
  let d = open('a', 'b', 'c', 'd', 'e', 'f')
  d = run(d, 'nth', 4); d = run(d, 'join', cur(d).root.id, 'right', { src: 'session', key: 'e' })   // d+e: both x
  d = run(d, 'nth', 5); d = run(d, 'join', cur(d).root.id, 'right', { src: 'session', key: 'b' })   // f+b: z and y
  assert.deepEqual(order(d), ['a', 'c', 'd+e', 'f+b'])
  d = run(d, 'groupByProject', { a: 'x', b: 'y', c: 'w', d: 'x', e: 'x', f: 'z' })
  assert.deepEqual(order(d), ['a', 'd+e', 'c', 'f+b'])
  const name = (i) => d.groups.find((g) => g.id === d.tabs[i].group)?.name ?? null
  assert.deepEqual([0, 1, 2, 3].map(name), ['x', 'x', 'w', null])
})

test('the pane limit refuses, without a change', () => {
  let d = open('a', 'b', 'c', 'd', 'e')
  d = run(d, 'nth', 1)
  for (const k of ['b', 'c', 'd']) d = run(d, 'join', cur(d).root.type === 'pane' ? cur(d).root.id : cur(d).focus, 'right', { src: 'session', key: k })
  assert.deepEqual(order(d), ['a+b+c+d', 'e'])
  const r = M.join(clone(d), cur(d).focus, 'right', { src: 'session', key: 'e' })
  assert.equal(r.keep, true)
})

test('a saved doc loads checked: broken tabs and empty panes go, unknown keys drop', () => {
  const p = (id, sid) => ({ id, type: 'pane', sid })
  const saved = {
    version: 3, views: [], pileOpen: false, quiet: true, active: 't2', strip: { mode: 'horizontal' },
    groups: [{ id: 'g', name: 'x', color: 'blue', collapsed: false }],
    tabs: [
      { id: 't1', root: p('p1', 'a'), focus: 'p1', group: 'g' },
      { id: 't2', root: { id: 's', type: 'split', dir: 'row', children: [p('p2', 'b'), p('p3', null)], sizes: [0.5, 0.5] }, focus: 'p3', group: null },
      { id: 't3', root: p('p4', null), focus: 'p4' },
      { id: 't4', root: { id: 'bad', type: 'split' } },
    ],
  }
  const d = fromSaved(saved)
  assert.deepEqual(order(d), ['a', 'b'])
  assert.equal(sidActive(d), 'b'); assert.equal(cur(d).focus, 'p2')
  assert.equal(d.quiet, true); assert.equal(d.strip.mode, 'horizontal'); assert.equal(d.strip.width, 260)
  assert.equal('views' in d, false); assert.equal('pileOpen' in d, false)
  assert.deepEqual(fromSaved(JSON.parse(JSON.stringify(d))), d)
  assert.deepEqual(fromSaved({ version: 2, tabs: [] }), freshDoc())
})
