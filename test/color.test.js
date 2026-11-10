// src/color.js v3: contrast of text over a dimmed photo or video. Spec section 2.
// Every visible pixel is d*bg + (1-d)*p for an unknown pixel p, so the worst case is exact.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { worstContrast, minDim, contrastRatio } from '../src/color.js'

const PAIRS = [
  ['#3b1f14', '#fff4e6'], // dark text on cream
  ['#f5f7f6', '#1c4d4a'], // light text on teal
  ['#0f2b29', '#f5f7f6'],
  ['#000000', '#ffffff'],
  ['#555555', '#ffffff'],
]
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`)

test('worstContrast at dim 0 is exactly 1: the picture can have any pixel', () => {
  for (const [ink, bg] of PAIRS) assert.equal(worstContrast(ink, bg, 0), 1, `${ink} on ${bg}`)
})

test('worstContrast at dim 100 is the plain contrast of ink against bg', () => {
  near(worstContrast('#000000', '#ffffff', 100), 21)
  near(worstContrast('#ffffff', '#000000', 100), 21)
  for (const [ink, bg] of PAIRS) near(worstContrast(ink, bg, 100), contrastRatio(ink, bg))
})

test('worstContrast never goes down as dim goes up', () => {
  for (const [ink, bg] of PAIRS) {
    let prev = worstContrast(ink, bg, 0)
    for (let d = 1; d <= 100; d++) {
      const r = worstContrast(ink, bg, d)
      assert.ok(r >= prev - 1e-12, `${ink} on ${bg}: dim ${d} gave ${r}, dim ${d - 1} gave ${prev}`)
      prev = r
    }
  }
})

test('worstContrast known values (hand-computed from the spec formula)', () => {
  near(Number(worstContrast('#3b1f14', '#fff4e6', 40).toFixed(2)), 2.48)
  near(Number(worstContrast('#3b1f14', '#fff4e6', 80).toFixed(2)), 8.68)
  assert.ok(worstContrast('#000000', '#ffffff', 46) >= 4.5 && worstContrast('#000000', '#ffffff', 45) < 4.5)
})

test('minDim: the result d reaches the target and d-1 does not', () => {
  for (const [ink, bg] of PAIRS) {
    const d = minDim(ink, bg)
    assert.ok(Number.isInteger(d) && d >= 1 && d <= 100, `${ink} on ${bg}: ${d}`)
    assert.ok(worstContrast(ink, bg, d) >= 4.5, `f(${d}) for ${ink} on ${bg}`)
    assert.ok(worstContrast(ink, bg, d - 1) < 4.5, `f(${d - 1}) for ${ink} on ${bg}`)
  }
})

test('minDim known values, and a lower target needs less dim', () => {
  assert.equal(minDim('#3b1f14', '#fff4e6'), 58)
  assert.equal(minDim('#f5f7f6', '#1c4d4a'), 76)
  assert.equal(minDim('#000000', '#ffffff'), 46)
  assert.equal(minDim('#666666', '#ffffff'), 90)
  for (const [ink, bg] of PAIRS) {
    const d3 = minDim(ink, bg, 3)
    assert.ok(worstContrast(ink, bg, d3) >= 3)
    assert.ok(d3 < minDim(ink, bg, 4.5), `${ink} on ${bg}`)
  }
})
