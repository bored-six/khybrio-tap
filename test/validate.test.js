import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateClient, validateSite } from '../src/validate.js'
import { KINDS } from '../src/kinds.js'
import { OPTS, SITE, SITE_SUBPATH, rawClient } from './helpers.js'

const check = (overrides, opts = {}) => validateClient(rawClient(overrides), { ...OPTS, ...opts })
const hasError = (res, path) => res.errors.some((e) => e.startsWith(path))

test('a minimal valid client normalizes with defaults', () => {
  const res = check({})
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.deepEqual(res.errors, [])
  const c = res.client
  assert.equal(c.slug, 'creamy-creations')
  assert.equal(c.tagline, null)
  assert.deepEqual(c.font, { display: 'fraunces', body: 'inter' })
  assert.equal(c.logo, null)
  assert.equal(c.cover, null)
  assert.deepEqual(c.branches, [])
  assert.equal(c.credit, true)
  assert.equal(c.theme.bg, '#fff4e6')
  assert.equal(c.theme.ink, '#3b1f14')
  assert.equal(c.links[0].label, KINDS.menu.label)
  assert.equal(c.links[1].kind, 'messenger')
})

test('KINDS covers the v1 kinds with the right schemes', () => {
  const expected = ['review', 'maps', 'menu', 'booking', 'order', 'website', 'messenger', 'facebook', 'instagram', 'tiktok', 'phone', 'email']
  assert.deepEqual(Object.keys(KINDS).sort(), [...expected].sort())
  for (const k of expected) {
    assert.ok(typeof KINDS[k].label === 'string' && KINDS[k].label.trim(), `${k} label`)
    const want = k === 'phone' ? 'tel:' : k === 'email' ? 'mailto:' : 'https:'
    assert.equal(KINDS[k].scheme, want, k)
  }
})

test('all errors are collected, each prefixed with its field path', () => {
  const res = check({ slug: 'Bad Slug', name: '', look: 'nope', links: [] })
  assert.equal(res.ok, false)
  for (const p of ['slug', 'name', 'look', 'links']) assert.ok(hasError(res, p), `missing ${p} in ${res.errors}`)
})

test('unknown top-level keys are rejected (typo guard)', () => {
  const res = check({ colour: '#fff' })
  assert.equal(res.ok, false)
  assert.ok(hasError(res, 'colour'))
})

test('slug rules', () => {
  for (const bad of ['Bad_Slug', 'a', 'x'.repeat(41), '-lead', 'trail-', 'double--dash', 'fonts', 'assets', '404', 'index']) {
    assert.ok(hasError(check({ slug: bad }, { folder: bad }), 'slug'), `slug ${bad} should fail`)
  }
  assert.ok(hasError(check({ slug: 'other-name' }), 'slug'), 'slug must match folder')
  assert.equal(check({ slug: 'ab' }, { folder: 'ab' }).ok, true)
})

test('name is trimmed, required and capped', () => {
  assert.equal(check({ name: '  Creamy  ' }).client.name, 'Creamy')
  assert.ok(hasError(check({ name: '   ' }), 'name'))
  assert.ok(hasError(check({ name: 'x'.repeat(61) }), 'name'))
  assert.ok(hasError(check({ tagline: 'x'.repeat(121) }), 'tagline'))
})

test('ink must reach 4.5:1 on bg (boundary)', () => {
  const t = (ink) => check({ theme: { bg: '#ffffff', ink, accent: '#000000' } })
  assert.ok(hasError(t('#777777'), 'theme.ink'), '#777 on white is 4.48, must fail')
  assert.ok(!hasError(t('#767676'), 'theme.ink'), '#767676 on white is 4.54, must pass')
})

test('onAccent picks whichever of ink / bg contrasts more with the accent', () => {
  const res = check({ theme: { bg: '#ffffff', ink: '#111111', accent: '#e8622d' } })
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.equal(res.client.theme.onAccent, '#111111')
  const dark = check({ theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#e8622d' } })
  assert.equal(dark.ok, true, dark.errors.join('\n'))
  assert.equal(dark.client.theme.onAccent, '#f5f7f6')
})

test('an accent that is weak against both ink and bg is rejected', () => {
  // white / #6b6b6b passes 4.5, but #ababab sits ~2.3:1 from both.
  const res = check({ theme: { bg: '#ffffff', ink: '#6b6b6b', accent: '#ababab' } })
  assert.ok(hasError(res, 'theme.accent'), res.errors.join('\n'))
})

test('bad or missing theme colours are rejected', () => {
  assert.ok(hasError(check({ theme: { bg: 'white', ink: '#000', accent: '#f00' } }), 'theme.bg'))
  assert.ok(hasError(check({ theme: { bg: '#fff', ink: '#000' } }), 'theme.accent'))
  assert.ok(hasError(check({ theme: undefined }), 'theme'))
})

test('fonts must exist in the registry', () => {
  assert.ok(hasError(check({ font: { display: 'comic-sans' } }), 'font.display'))
  assert.equal(check({ font: { display: 'mono' } }).client.font.body, 'inter')
})

test('logo / cover file names are checked for shape, traversal and presence', () => {
  for (const bad of ['../logo.svg', 'logo.gif', '.hidden.svg', 'a/b.svg', 'missing.svg']) {
    assert.ok(hasError(check({ logo: bad }), 'logo'), `logo ${bad} should fail`)
  }
  assert.equal(check({ logo: 'logo.svg', cover: 'cover.jpg' }).ok, true)
})

test('links: count limits and unknown kinds', () => {
  assert.ok(hasError(check({ links: [] }), 'links'))
  const many = Array.from({ length: 13 }, () => ({ kind: 'website', url: 'https://example.com' }))
  assert.ok(hasError(check({ links: many }), 'links'))
  assert.ok(hasError(check({ links: [{ kind: 'myspace', url: 'https://x.com' }] }), 'links[0].kind'))
})

test('links: url scheme must match the kind', () => {
  const one = (kind, url) => check({ links: [{ kind, url }] })
  assert.ok(hasError(one('website', 'javascript:alert(1)'), 'links[0].url'))
  assert.ok(hasError(one('website', 'http://example.com'), 'links[0].url'))
  assert.ok(hasError(one('website', 'data:text/html,hi'), 'links[0].url'))
  assert.ok(hasError(one('website', 'https://exa mple.com'), 'links[0].url'))
  assert.ok(hasError(one('website', 'not a url'), 'links[0].url'))
  assert.ok(hasError(one('phone', 'https://example.com'), 'links[0].url'))
  assert.ok(hasError(one('email', 'tel:+639171234567'), 'links[0].url'))
  assert.equal(one('phone', 'tel:+639171234567').ok, true)
  assert.equal(one('email', 'mailto:hello@example.com').ok, true)
})

test('links: label default, override and cap; order kept', () => {
  const res = check({
    links: [
      { kind: 'review', url: 'https://g.page/r/x', label: 'Rate us' },
      { kind: 'maps', url: 'https://maps.app.goo.gl/x' },
    ],
  })
  assert.equal(res.client.links[0].label, 'Rate us')
  assert.equal(res.client.links[1].label, KINDS.maps.label)
  assert.deepEqual(res.client.links.map((l) => l.kind), ['review', 'maps'])
  assert.ok(hasError(check({ links: [{ kind: 'menu', url: 'https://x.com', label: 'x'.repeat(41) }] }), 'links[0].label'))
})

test('branches: name required, maps must be https, missing fields become null', () => {
  assert.ok(hasError(check({ branches: [{ address: 'Somewhere' }] }), 'branches[0].name'))
  assert.ok(hasError(check({ branches: [{ name: 'A', maps: 'http://maps.example.com' }] }), 'branches[0].maps'))
  const res = check({ branches: [{ name: 'Branch 1' }] })
  assert.deepEqual(res.client.branches, [{ name: 'Branch 1', address: null, maps: null, hours: null }])
})

test('credit must be boolean', () => {
  assert.ok(hasError(check({ credit: 'yes' }), 'credit'))
  assert.equal(check({ credit: false }).client.credit, false)
})

test('validateSite', () => {
  assert.equal(validateSite(SITE).ok, true)
  assert.equal(validateSite(SITE_SUBPATH).ok, true)
  assert.equal(validateSite({ ...SITE, origin: 'https://tap.khybrio.com/' }).ok, false)
  assert.equal(validateSite({ ...SITE, origin: 'http://tap.khybrio.com' }).ok, false)
  assert.equal(validateSite({ ...SITE, base: 'tap/' }).ok, false)
  assert.equal(validateSite({ ...SITE, base: '/tap' }).ok, false)
  assert.equal(validateSite({ ...SITE, mainSite: 'http://khybrio.com/' }).ok, false)
})
