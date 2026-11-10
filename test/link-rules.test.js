// Pure rules the studio uses when a link's kind changes (studio/link-rules.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { switchKind } from '../studio/link-rules.js'

const KINDS = [
  { id: 'website', label: 'Visit our website', scheme: 'https:' },
  { id: 'phone', label: 'Call us', scheme: 'tel:' },
  { id: 'email', label: 'Email us', scheme: 'mailto:' },
  { id: 'facebook', label: 'Facebook', scheme: 'https:' },
]
const sw = (link, to) => switchKind(link, to, KINDS)

test('an empty label or the previous default follows the new kind', () => {
  assert.equal(sw({ kind: 'website', label: '', url: '' }, 'facebook').label, 'Facebook')
  assert.equal(sw({ kind: 'website', label: 'Visit our website', url: '' }, 'facebook').label, 'Facebook')
})

test('a label the user typed is kept', () => {
  assert.equal(sw({ kind: 'website', label: 'Our shop', url: '' }, 'facebook').label, 'Our shop')
})

test('bare number becomes tel:, bare address becomes mailto:', () => {
  assert.equal(sw({ kind: 'website', label: '', url: '+63 912 345 6789' }, 'phone').url, 'tel:+639123456789')
  assert.equal(sw({ kind: 'website', label: '', url: 'a@b.co' }, 'email').url, 'mailto:a@b.co')
})

test('a url that cannot be converted stays and returns a format hint', () => {
  const r = sw({ kind: 'website', label: '', url: 'https://example.com' }, 'phone')
  assert.equal(r.url, 'https://example.com')
  assert.match(r.hint, /Phone links need a number like \+63 912 345 6789/)
  assert.match(sw({ kind: 'website', label: '', url: 'nope' }, 'email').hint, /Email links need an address/)
})

test('a url that already fits gets no hint; empty url gets none', () => {
  assert.equal(sw({ kind: 'website', label: '', url: 'tel:+639123456789' }, 'phone').hint, '')
  assert.equal(sw({ kind: 'website', label: '', url: '' }, 'phone').hint, '')
  assert.equal(sw({ kind: 'phone', label: '', url: 'tel:+63912' }, 'website').hint, 'This link needs an address starting with https://')
})

test('viber: bare number converts, wrong scheme gets the viber hint', () => {
  const K = [...KINDS, { id: 'viber', label: 'Message on Viber', scheme: 'viber:' }, { id: 'custom', label: '', scheme: 'https:' }]
  const sw2 = (link, to) => switchKind(link, to, K)
  assert.equal(sw2({ kind: 'website', label: '', url: '+63 912 345 6789' }, 'viber').url, 'viber://chat?number=%2B639123456789')
  assert.match(sw2({ kind: 'website', label: '', url: 'https://example.com' }, 'viber').hint, /viber:\/\/chat\?number=%2B639XXXXXXXXX/)
  assert.equal(sw2({ kind: 'website', label: '', url: 'viber://chat?number=%2B63912' }, 'viber').hint, '')
})

test('custom: label empties (no default) unless typed, and the result says a label is needed', () => {
  const K = [...KINDS, { id: 'custom', label: '', scheme: 'https:' }]
  const r = switchKind({ kind: 'website', label: 'Visit our website', url: '' }, 'custom', K)
  assert.equal(r.label, '')
  assert.equal(r.needsLabel, true)
  assert.equal(switchKind({ kind: 'website', label: 'Our shop', url: '' }, 'custom', K).label, 'Our shop')
  assert.equal(switchKind({ kind: 'website', label: '', url: '' }, 'facebook', K).needsLabel, false)
})
