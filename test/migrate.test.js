// v1 -> v2 migration, written from section 3 of .claude/specs/mvp-showcase.md before the code existed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateRaw } from '../src/migrate.js'
import { validateClient } from '../src/validate.js'
import { OPTS } from './helpers.js'

const deepFreeze = (o) => {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze)
    Object.freeze(o)
  }
  return o
}

const v1 = (extra = {}) => ({
  slug: 'creamy-creations',
  name: 'Creamy Creations',
  look: 'plain',
  theme: { bg: '#FFF4E6', ink: '#3B1F14', accent: '#E8622D' },
  links: [
    { kind: 'menu', url: 'https://example.com/menu' },
    { kind: 'messenger', url: 'https://m.me/creamy', label: 'Message us' },
  ],
  ...extra,
})

test('links become link blocks in the same order, links key removed', () => {
  const out = migrateRaw(v1())
  assert.equal('links' in out, false)
  assert.deepEqual(out.blocks, [
    { type: 'link', kind: 'menu', url: 'https://example.com/menu' },
    { type: 'link', kind: 'messenger', url: 'https://m.me/creamy', label: 'Message us' },
  ])
})

test('a link without a label gets no label key at all', () => {
  const out = migrateRaw(v1())
  assert.equal('label' in out.blocks[0], false)
})

test('extra v1 link keys are dropped', () => {
  const out = migrateRaw(v1({ links: [{ kind: 'menu', url: 'https://x.co', primary: true, junk: 1 }] }))
  assert.deepEqual(out.blocks, [{ type: 'link', kind: 'menu', url: 'https://x.co' }])
})

test('non-object link entries are carried over as-is so validate can name them', () => {
  const out = migrateRaw(v1({ links: ['nope', null, { kind: 'menu', url: 'https://x.co' }] }))
  assert.deepEqual(out.blocks, ['nope', null, { type: 'link', kind: 'menu', url: 'https://x.co' }])
})

test('other top-level keys are untouched', () => {
  const out = migrateRaw(v1({ tagline: 'hi', credit: false }))
  assert.equal(out.slug, 'creamy-creations')
  assert.equal(out.tagline, 'hi')
  assert.equal(out.credit, false)
  assert.deepEqual(out.theme, v1().theme)
})

test('font display + body -> heading/tagline/body', () => {
  assert.deepEqual(migrateRaw(v1({ font: { display: 'mono', body: 'inter' } })).font, { heading: 'mono', tagline: 'inter', body: 'inter' })
})

test('font display only -> tagline and body default to inter', () => {
  assert.deepEqual(migrateRaw(v1({ font: { display: 'mono' } })).font, { heading: 'mono', tagline: 'inter', body: 'inter' })
})

test('font body only -> heading defaults to fraunces, tagline follows body', () => {
  assert.deepEqual(migrateRaw(v1({ font: { body: 'mono' } })).font, { heading: 'fraunces', tagline: 'mono', body: 'mono' })
})

test('font already v2 is untouched', () => {
  const font = { heading: 'mono', tagline: 'fraunces', body: 'inter' }
  assert.deepEqual(migrateRaw(v1({ font })).font, font)
  assert.deepEqual(migrateRaw(v1({ font: { tagline: 'mono' } })).font, { tagline: 'mono' })
})

test('a client with no font key gets none added', () => {
  assert.equal('font' in migrateRaw(v1()), false)
})

test('a v2 client (blocks, no links) comes back deep-equal', () => {
  const v2 = { slug: 'x-y', name: 'X', look: 'plain', theme: v1().theme, blocks: [{ type: 'heading', text: 'Hi' }] }
  assert.deepEqual(migrateRaw(v2), v2)
})

test('both links and blocks present: untouched, validate reports the v1 key', () => {
  const both = v1({ blocks: [{ type: 'heading', text: 'Hi' }] })
  const out = migrateRaw(both)
  assert.deepEqual(out, both)
  const res = validateClient(both, OPTS)
  assert.equal(res.ok, false)
  assert.ok(res.errors.includes('links: v1 key, use blocks'), res.errors.join('\n'))
})

test('font.display next to font.heading: untouched, validate reports the v1 key', () => {
  const mixed = v1({ links: undefined, blocks: [{ type: 'heading', text: 'Hi' }], font: { display: 'mono', heading: 'fraunces' } })
  delete mixed.links
  assert.deepEqual(migrateRaw(mixed).font, { display: 'mono', heading: 'fraunces' })
  const res = validateClient(mixed, OPTS)
  assert.equal(res.ok, false)
  assert.ok(res.errors.includes('font.display: v1 key, use font.heading'), res.errors.join('\n'))
})

test('non-objects are returned as-is and nothing throws', () => {
  for (const x of [null, undefined, 'a string', 42, true]) assert.equal(migrateRaw(x), x)
  assert.doesNotThrow(() => migrateRaw({ links: 'nope', font: null }))
  assert.equal(migrateRaw({ links: 'nope' }).links, 'nope', 'links that is not an array is left for validate')
  assert.doesNotThrow(() => migrateRaw({ font: 'nope' }))
  assert.doesNotThrow(() => migrateRaw({ links: [], font: { display: 5 } }))
})

test('never mutates its input', () => {
  const input = deepFreeze(v1({ font: { display: 'mono', body: 'inter' } }))
  assert.doesNotThrow(() => migrateRaw(input))
  const snapshot = JSON.stringify(input)
  const out = migrateRaw(input)
  assert.equal(JSON.stringify(input), snapshot)
  assert.notEqual(out, input)
})

test('idempotent: migrating twice equals migrating once', () => {
  const cases = [
    v1(),
    v1({ font: { display: 'mono', body: 'inter' } }),
    v1({ font: { display: 'mono' } }),
    v1({ font: { body: 'mono' } }),
    v1({ blocks: [{ type: 'heading', text: 'Hi' }] }),
    v1({ links: ['nope', null] }),
    { slug: 'x-y' },
  ]
  for (const c of cases) {
    const once = migrateRaw(c)
    assert.deepEqual(migrateRaw(once), once, JSON.stringify(c))
  }
})

test('a v1 client validates ok after migration, blocks keep their order and index', () => {
  const res = validateClient(v1({ font: { display: 'fraunces', body: 'inter' } }), OPTS)
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.deepEqual(res.client.blocks.map((b) => b.kind), ['menu', 'messenger'])
  assert.equal('links' in res.client, false)
  assert.deepEqual(res.client.font, { heading: 'fraunces', tagline: 'inter', body: 'inter' })
})

test('error paths after migration use blocks[i] with the same index as links[i]', () => {
  const res = validateClient(
    v1({ links: [{ kind: 'menu', url: 'https://ok.example' }, { kind: 'website', url: 'http://not-https.example' }] }),
    OPTS,
  )
  assert.equal(res.ok, false)
  assert.ok(res.errors.some((e) => e.startsWith('blocks[1].url')), res.errors.join('\n'))
  assert.ok(!res.errors.some((e) => e.startsWith('links')))
})
