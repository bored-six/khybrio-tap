// Rename + redirects, written from section 8 of .claude/specs/mvp-showcase.md before the code existed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyRename, validateRedirects } from '../src/redirects.js'

const fail = (res, status, error) => {
  assert.equal(res.ok, false, JSON.stringify(res))
  assert.equal(res.status, status)
  assert.equal(typeof res.error, 'string')
  if (error) assert.equal(res.error, error)
}

test('plain rename records old -> new', () => {
  const res = applyRename({}, 'alpha-cafe', 'beta-cafe', ['alpha-cafe'])
  assert.equal(res.ok, true)
  assert.deepEqual(res.redirects, { 'alpha-cafe': 'beta-cafe' })
})

test('other records are kept', () => {
  const res = applyRename({ 'old-one': 'gamma-bar' }, 'alpha-cafe', 'beta-cafe', ['alpha-cafe', 'gamma-bar'])
  assert.deepEqual(res.redirects, { 'old-one': 'gamma-bar', 'alpha-cafe': 'beta-cafe' })
})

test('never mutates the redirects it was given', () => {
  const input = Object.freeze({ 'old-one': 'alpha-cafe' })
  const res = applyRename(input, 'alpha-cafe', 'beta-cafe', ['alpha-cafe'])
  assert.deepEqual(input, { 'old-one': 'alpha-cafe' })
  assert.notEqual(res.redirects, input)
})

test('422: new address fails the slug rules, is reserved, or equals the old one', () => {
  const live = ['alpha-cafe']
  for (const bad of ['Bad_Slug', 'a', 'x'.repeat(41), '-lead', 'trail-', 'double--dash', 'has space', '', 'assets', 'fonts', '404', 'index', 'api', 'media']) {
    fail(applyRename({}, 'alpha-cafe', bad, live), 422)
  }
  fail(applyRename({}, 'alpha-cafe', 'alpha-cafe', live), 422)
  assert.equal(applyRename({}, 'alpha-cafe', 'ab', live).ok, true, '2 chars is the minimum')
  assert.equal(applyRename({}, 'alpha-cafe', 'x'.repeat(40), live).ok, true, '40 chars is the maximum')
})

test('404: the page being renamed is not live', () => {
  fail(applyRename({}, 'ghost-one', 'beta-cafe', ['alpha-cafe']), 404)
})

test('409: new address is already a live page', () => {
  fail(applyRename({}, 'alpha-cafe', 'beta-cafe', ['alpha-cafe', 'beta-cafe']), 409, 'address already used by a page')
})

test('409: new address is a redirect key that belongs to another page', () => {
  const res = applyRename({ 'old-name': 'beta-cafe' }, 'alpha-cafe', 'old-name', ['alpha-cafe', 'beta-cafe'])
  fail(res, 409, 'old cards for "beta-cafe" use this address')
})

test('A -> B -> C flattens: both old addresses point at C', () => {
  const step1 = applyRename({}, 'aaa-one', 'bbb-two', ['aaa-one'])
  const step2 = applyRename(step1.redirects, 'bbb-two', 'ccc-three', ['bbb-two'])
  assert.equal(step2.ok, true)
  assert.deepEqual(step2.redirects, { 'aaa-one': 'ccc-three', 'bbb-two': 'ccc-three' })
})

test('rename back: the page reclaims its old address, the record for it disappears', () => {
  const res = applyRename({ 'aaa-one': 'bbb-two' }, 'bbb-two', 'aaa-one', ['bbb-two'])
  assert.equal(res.ok, true)
  assert.deepEqual(res.redirects, { 'bbb-two': 'aaa-one' })
})

test('rename back after a chain: A:C B:C then C -> A leaves B:A C:A', () => {
  const res = applyRename({ 'aaa-one': 'ccc-three', 'bbb-two': 'ccc-three' }, 'ccc-three', 'aaa-one', ['ccc-three'])
  assert.equal(res.ok, true)
  assert.deepEqual(res.redirects, { 'bbb-two': 'aaa-one', 'ccc-three': 'aaa-one' })
})

test('the result is always flat: every value is the live page, no value is also a key', () => {
  let r = {}
  let live = 'one-aa'
  for (const next of ['two-bb', 'three-cc', 'one-aa', 'four-dd', 'two-bb']) {
    const res = applyRename(r, live, next, [live])
    assert.equal(res.ok, true, `${live} -> ${next}: ${res.error}`)
    r = res.redirects
    live = next
    for (const [k, v] of Object.entries(r)) {
      assert.equal(v, live, `${k} must point at the live page ${live}`)
      assert.notEqual(k, live)
    }
  }
})

// ---- validateRedirects ---------------------------------------------------------------------

test('validateRedirects: a clean file has no errors, an empty one too', () => {
  assert.deepEqual(validateRedirects({}, ['alpha-cafe']), [])
  assert.deepEqual(validateRedirects({ 'old-name': 'alpha-cafe' }, ['alpha-cafe']), [])
})

test('validateRedirects: each kind of problem is reported, prefixed redirects', () => {
  const live = ['alpha-cafe', 'beta-cafe']
  const cases = {
    'non-slug key': { 'Bad Key': 'alpha-cafe' },
    'non-slug value': { 'old-name': 'Bad Value' },
    'key is a live slug': { 'beta-cafe': 'alpha-cafe' },
    'value is not live': { 'old-name': 'ghost-one' },
  }
  for (const [what, file] of Object.entries(cases)) {
    const errs = validateRedirects(file, live)
    assert.ok(errs.length >= 1, what)
    for (const e of errs) assert.ok(e.startsWith('redirects'), `${what}: ${e}`)
  }
})

test('validateRedirects: reports every problem, not just the first', () => {
  const errs = validateRedirects({ 'Bad Key': 'alpha-cafe', 'beta-cafe': 'alpha-cafe', 'old-name': 'ghost-one' }, ['alpha-cafe', 'beta-cafe'])
  assert.ok(errs.length >= 3, errs.join('\n'))
})
