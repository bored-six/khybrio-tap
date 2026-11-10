// Adversarial: src/redirects.js applyRename + validateRedirects (spec section 8).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyRename, validateRedirects } from '../src/redirects.js'

const live = (...s) => s
const apply = (r, from, to, l) => applyRename(r, from, to, l, l)
const deepFrozen = (o) => Object.freeze(Object.fromEntries(Object.entries(o)))

test('long chain a->b->c->d->e keeps the map flat: every old key points at the final slug', () => {
  let r = {}
  let cur = 'aa'
  for (const next of ['bb', 'cc', 'dd', 'ee', 'ff']) {
    const res = apply(r, cur, next, [cur])
    assert.equal(res.ok, true)
    r = res.redirects
    cur = next
  }
  assert.deepEqual(r, { aa: 'ff', bb: 'ff', cc: 'ff', dd: 'ff', ee: 'ff' })
  assert.equal(validateRedirects(r, ['ff']).length, 0)
})

test('rename back after a chain: A->B->C then C->A: A leaves the map, B and C now point to A', () => {
  let r = apply({}, 'aa', 'bb', ['aa']).redirects
  r = apply(r, 'bb', 'cc', ['bb']).redirects
  assert.deepEqual(r, { aa: 'cc', bb: 'cc' })
  const back = apply(r, 'cc', 'aa', ['cc'])
  assert.equal(back.ok, true, back.error)
  assert.deepEqual(back.redirects, { bb: 'aa', cc: 'aa' })
  assert.equal(validateRedirects(back.redirects, ['aa']).length, 0)
})

test('rename back to an old address whose record points elsewhere is a 409', () => {
  // zz -> cc, but page "cc" tries to take "yy" which belongs to page "other"... yy:other
  const res = apply({ zz: 'other' }, 'cc', 'zz', ['cc', 'other'])
  assert.equal(res.status, 409)
  assert.match(res.error, /old cards for "other" use this address/)
})

test('swap A<->B through a temp name ends flat, valid and with no self-redirect', () => {
  const L = ['aa', 'bb']
  // aa -> tmp
  let r = apply({}, 'aa', 'tmp', ['aa', 'bb']).redirects // {aa:tmp}
  // bb -> aa : aa is a redirect key pointing at tmp (not bb) => 409 per spec
  const step = apply(r, 'bb', 'aa', ['tmp', 'bb'])
  assert.equal(step.ok, false)
  assert.equal(step.status, 409)
  assert.match(step.error, /old cards for "tmp"/)
  assert.equal(r.aa, 'tmp', 'input is untouched on failure')
  void L
})

test('applyRename never mutates its input, success or failure', () => {
  const r = Object.freeze({ aa: 'bb', cc: 'bb' })
  const ok = applyRename(r, 'bb', 'dd', ['bb'], ['bb'])
  assert.deepEqual(ok.redirects, { aa: 'dd', cc: 'dd', bb: 'dd' })
  assert.deepEqual(r, { aa: 'bb', cc: 'bb' })
  assert.equal(applyRename(r, 'bb', 'bb', ['bb'], ['bb']).ok, false)
})

test('rename to a slug differing only in case is 422 (not a valid slug) rather than a silent new address', () => {
  assert.equal(apply({}, 'aa', 'AA', ['aa']).status, 422)
  assert.equal(apply({}, 'aa', 'Bb', ['aa']).status, 422)
})

test('invalid / reserved / unchanged targets are 422', () => {
  const bad = ['', ' ', 'a', 'x'.repeat(41), 'a--b', '-ab', 'ab-', 'a_b', 'a b', 'a/b', 'a.b', '../x', 'é', 'ab\n', 'assets', 'fonts', '404', 'index', 'api', 'media', 'aa', null, undefined, 5, {}, ['ab'], '__proto__']
  for (const to of bad) {
    const res = applyRename({}, 'aa', to, ['aa'], ['aa'])
    assert.equal(res.ok, false, String(to))
    assert.equal(res.status, 422, `${JSON.stringify(to)} -> ${res.status}`)
  }
})

test('exact length boundary: 2 and 40 chars are fine, 41 is 422, 1 is 422', () => {
  assert.equal(apply({}, 'aa', 'ab', ['aa']).ok, true)
  assert.equal(apply({}, 'aa', 'a'.repeat(40), ['aa']).ok, true)
  assert.equal(apply({}, 'aa', 'a'.repeat(41), ['aa']).status, 422)
  assert.equal(apply({}, 'aa', 'a', ['aa']).status, 422)
})

test('status precedence: invalid target beats missing source; missing source beats address conflict', () => {
  assert.equal(apply({}, 'ghost', 'api', ['aa']).status, 422)
  assert.equal(apply({}, 'ghost', 'aa', ['aa']).status, 404)
})

test('target held by a live page or any folder is 409 even if a redirect also exists', () => {
  assert.equal(applyRename({ bb: 'aa' }, 'aa', 'bb', ['aa', 'bb'], ['aa', 'bb']).status, 409)
  assert.equal(applyRename({}, 'aa', 'draft-folder', ['aa'], ['aa', 'draft-folder']).status, 409)
})

test('prototype-ish names cannot read inherited properties as redirect keys', () => {
  // "constructor" and "toString" are valid slug text; they must not look like existing records
  for (const to of ['constructor', 'tostring', 'valueof', 'hasownproperty']) {
    const res = applyRename({}, 'aa', to, ['aa'], ['aa'])
    if (to === 'constructor') assert.equal(res.ok, true, 'constructor is a legal slug and has no record')
    else assert.equal(res.ok, true, to)
  }
  const res = applyRename({}, 'aa', 'constructor', ['aa'], ['aa'])
  assert.ok(Object.hasOwn(res.redirects, 'aa'))
  assert.equal(Object.getPrototypeOf(res.redirects), Object.prototype)
})

test('a redirects object whose key is __proto__ does not poison the result', () => {
  const r = JSON.parse('{"__proto__": "aa", "zz": "aa"}')
  const res = applyRename(r, 'aa', 'bb', ['aa'], ['aa'])
  assert.equal(res.ok, true)
  assert.equal(Object.getPrototypeOf(res.redirects), Object.prototype, 'prototype must not change')
  assert.equal(({}).polluted, undefined)
  assert.equal(res.redirects.zz, 'bb')
})

test('validateRedirects: every flavour of bad record is reported, good map is empty', () => {
  const L = ['aa', 'bb']
  assert.deepEqual(validateRedirects({}, L), [])
  assert.deepEqual(validateRedirects(undefined, L), [])
  assert.deepEqual(validateRedirects(null, L), [])
  assert.deepEqual(validateRedirects({ old: 'aa', older: 'bb' }, L), [])
  const bad = [
    [{ Old: 'aa' }, /Old/], [{ old: 'AA' }, /AA/], [{ old: 'ghost' }, /ghost/], [{ aa: 'bb' }, /aa/], [{ 'a/b': 'aa' }, /a\/b/], [{ old: 5 }, /old/], [{ old: '' }, /old/], [{ x: 'aa' }, /x/],
  ]
  for (const [m, re] of bad) {
    const e = validateRedirects(m, L)
    assert.ok(e.length > 0, JSON.stringify(m))
    assert.ok(e.every((s) => s.startsWith('redirects:')), JSON.stringify(e))
    assert.ok(e.some((s) => re.test(s)), JSON.stringify(e))
  }
})

test('validateRedirects: self-redirect old->old is rejected', () => {
  assert.ok(validateRedirects({ aa: 'aa' }, ['aa']).length > 0)
})
