// Pure rules for preparing a photo before upload (studio/image-prep.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { targetSize, outputName, qualitySteps, shouldReencode, isHeic, MAX_SIDE, TARGET_BYTES } from '../studio/image-prep.js'

test('limits: cover 2000, logo 800, target about 1.5 MB', () => {
  assert.equal(MAX_SIDE.cover, 2000)
  assert.equal(MAX_SIDE.logo, 800)
  assert.equal(TARGET_BYTES, 1.5 * 1024 * 1024)
})

test('targetSize scales the long side down and keeps the ratio', () => {
  assert.deepEqual(targetSize(4000, 3000, 2000), { width: 2000, height: 1500 })
  assert.deepEqual(targetSize(3000, 4000, 2000), { width: 1500, height: 2000 })
  assert.deepEqual(targetSize(4000, 1000, 800), { width: 800, height: 200 })
})

test('targetSize never upscales', () => {
  assert.deepEqual(targetSize(640, 480, 2000), { width: 640, height: 480 })
  assert.deepEqual(targetSize(2000, 2000, 2000), { width: 2000, height: 2000 })
})

test('targetSize never returns a zero side and rejects junk', () => {
  assert.deepEqual(targetSize(10000, 1, 2000), { width: 2000, height: 1 })
  assert.throws(() => targetSize(0, 100, 2000))
  assert.throws(() => targetSize(NaN, 100, 2000))
  assert.throws(() => targetSize(100, 100, 0))
})

test('outputName sanitises the base name and swaps the extension', () => {
  assert.equal(outputName('IMG 1234.HEIC', 'webp'), 'img-1234.webp')
  assert.equal(outputName('My Photo (final).jpeg', 'jpg'), 'my-photo-final.jpg')
  assert.equal(outputName('shop.logo.v2.PNG', 'webp'), 'shop.logo.v2.webp')
})

test('outputName falls back when nothing usable is left, and passes the server name rule', () => {
  const re = /^[a-z0-9][a-z0-9._-]*\.(svg|png|jpe?g|webp)$/i
  for (const n of ['.jpg', '___.png', 'écran.jpg', '日本.jpg', '']) {
    const out = outputName(n, 'webp')
    assert.match(out, re, n)
    assert.ok(!out.includes('..'))
  }
  assert.equal(outputName('', 'webp'), 'photo.webp')
})

test('qualitySteps starts near 0.82, only goes down, stays in range', () => {
  const s = qualitySteps()
  assert.equal(s[0], 0.82)
  for (let i = 1; i < s.length; i++) assert.ok(s[i] < s[i - 1])
  assert.ok(s.at(-1) >= 0.3 && s.at(-1) < 0.82)
})

test('shouldReencode: rasters yes, SVG no, by MIME or extension', () => {
  assert.equal(shouldReencode({ name: 'a.jpg', type: 'image/jpeg' }), true)
  assert.equal(shouldReencode({ name: 'a.png', type: 'image/png' }), true)
  assert.equal(shouldReencode({ name: 'a.heic', type: '' }), true)
  assert.equal(shouldReencode({ name: 'a.HEIF', type: 'image/heif' }), true)
  assert.equal(shouldReencode({ name: 'a.avif', type: 'image/avif' }), true)
  assert.equal(shouldReencode({ name: 'a.svg', type: 'image/svg+xml' }), false)
  assert.equal(shouldReencode({ name: 'a.SVG', type: '' }), false)
  assert.equal(shouldReencode({ name: 'notes.pdf', type: 'application/pdf' }), false)
  assert.equal(shouldReencode({ name: 'mystery', type: '' }), false)
})

test('isHeic by MIME or extension', () => {
  assert.equal(isHeic({ name: 'a.heic', type: '' }), true)
  assert.equal(isHeic({ name: 'a.jpg', type: 'image/heif' }), true)
  assert.equal(isHeic({ name: 'a.jpg', type: 'image/jpeg' }), false)
})
