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
