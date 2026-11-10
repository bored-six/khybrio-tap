import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHex, contrastRatio } from '../src/color.js'
import { esc } from '../src/html.js'

test('parseHex normalizes 3 and 6 digit hex to lowercase 6 digit', () => {
  assert.equal(parseHex('#ABC'), '#aabbcc')
  assert.equal(parseHex('#1C4D4A'), '#1c4d4a')
})

test('parseHex rejects anything that is not #rgb or #rrggbb', () => {
  for (const bad of ['abc', '#abcd', '#gggggg', '#1234567', ' #abc', 'red', '', null, undefined, 123]) {
    assert.equal(parseHex(bad), null, `expected null for ${JSON.stringify(bad)}`)
  }
})

test('contrastRatio matches WCAG reference values', () => {
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01)
  assert.ok(Math.abs(contrastRatio('#ffffff', '#000000') - 21) < 0.01, 'order must not matter')
  assert.ok(Math.abs(contrastRatio('#e8622d', '#e8622d') - 1) < 1e-9)
  // #767676 on white is the classic just-passes-AA grey (4.54), #777777 just fails (4.48).
  assert.ok(contrastRatio('#767676', '#ffffff') >= 4.5)
  assert.ok(contrastRatio('#777777', '#ffffff') < 4.5)
})

test('esc neutralises every character that can break out of text or an attribute', () => {
  const out = esc(`<a href="x" onload='y'>&`)
  assert.ok(!/[<>"']/.test(out), out)
  assert.ok(out.includes('&lt;') && out.includes('&gt;') && out.includes('&quot;') && out.includes('&amp;'))
  assert.equal(esc('plain text'), 'plain text')
  assert.equal(esc('&amp;'), '&amp;amp;', 'must not skip already-escaped input')
})
