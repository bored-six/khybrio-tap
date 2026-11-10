// validateClient v3: `background` and `style` keys. Written from sections 1 and 2 of
// .claude/specs/v3-style-and-media.md before the code existed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateClient } from '../src/validate.js'
import { OPTS, rawClient } from './helpers.js'

const FILES = [...OPTS.files, 'clip.mp4', 'poster.jpg', 'photo.png', 'shot.webp', 'wide.jpeg', 'logo2.svg']
const run = (extra = {}, opts = {}) => validateClient(rawClient(extra), { ...OPTS, files: FILES, ...opts })
const bg = (background, extra = {}) => run({ background, ...extra })
const style = (s, extra = {}) => run({ style: s, ...extra })
const hasErr = (res, msg) => assert.ok(res.errors.includes(msg), `wanted "${msg}" in ${JSON.stringify(res.errors)}`)
const noErrAt = (res, prefix) => assert.ok(!res.errors.some((e) => e.startsWith(prefix)), `unexpected ${prefix} error in ${JSON.stringify(res.errors)}`)
const warnsAt = (res, prefix) => res.warnings.filter((w) => w.startsWith(prefix))

const ALL_NULL_STYLE = { buttonShape: null, buttonFill: null, linkLayout: null, align: null, logoShape: null, coverShape: null, spacing: null, shadow: null }
const IMG = { type: 'image', file: 'photo.png' }
const VID = { type: 'video', file: 'clip.mp4', poster: 'poster.jpg' }

/* ---------------------------------------------------------------- defaults and shapes */

test('absent background and style normalize to color + eight null style keys, no errors', () => {
  const res = run()
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.deepEqual(res.client.background, { type: 'color' })
  assert.deepEqual(res.client.style, ALL_NULL_STYLE)
})

test('background {type:"color"} is the same as absent', () => {
  const res = bg({ type: 'color' })
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.deepEqual(res.client.background, { type: 'color' })
})

test('background and style are allowed top-level keys', () => {
  const res = run({ background: { type: 'color' }, style: {} })
  assert.ok(!res.errors.some((e) => /unknown key/.test(e)), res.errors.join('\n'))
  assert.deepEqual(res.client.style, ALL_NULL_STYLE)
})

test('gradient normalizes: refs and free hex resolved lowercase, shape linear and angle 180 by default', () => {
  const res = bg({ type: 'gradient', stops: ['bg', 'accent', '#ABCDEF'] })
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.deepEqual(res.client.background, {
    type: 'gradient',
    stops: [
      { ref: 'bg', hex: '#fff4e6' },
      { ref: 'accent', hex: '#e8622d' },
      { ref: null, hex: '#abcdef' },
    ],
    shape: 'linear',
    angle: 180,
  })
})

test('gradient: ink ref resolves, radial normalizes angle to null, explicit angle is kept for linear', () => {
  const radial = bg({ type: 'gradient', stops: ['ink', 'bg'], shape: 'radial' })
  assert.equal(radial.ok, true, radial.errors.join('\n'))
  assert.deepEqual(radial.client.background, {
    type: 'gradient',
    stops: [{ ref: 'ink', hex: '#3b1f14' }, { ref: 'bg', hex: '#fff4e6' }],
    shape: 'radial',
    angle: null,
  })
  const lin = bg({ type: 'gradient', stops: ['bg', 'bg'], shape: 'linear', angle: 45 })
  assert.equal(lin.client.background.angle, 45)
  assert.equal(bg({ type: 'gradient', stops: ['bg', 'bg'], angle: 0 }).client.background.angle, 0)
  assert.equal(bg({ type: 'gradient', stops: ['bg', 'bg'], angle: 359 }).client.background.angle, 359)
})

test('image normalizes with defaults blur 0, dim 40, focus [50,50]', () => {
  const res = bg(IMG)
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.deepEqual(res.client.background, { type: 'image', file: 'photo.png', blur: 0, dim: 40, focus: [50, 50] })
})

test('video normalizes with the same defaults plus poster', () => {
  const res = bg(VID)
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.deepEqual(res.client.background, { type: 'video', file: 'clip.mp4', poster: 'poster.jpg', blur: 0, dim: 40, focus: [50, 50] })
})

test('explicit blur, dim and focus are kept; boundaries are valid', () => {
  const a = bg({ ...IMG, blur: 24, dim: 80, focus: [0, 100] })
  assert.equal(a.ok, true, a.errors.join('\n'))
  assert.deepEqual(a.client.background, { type: 'image', file: 'photo.png', blur: 24, dim: 80, focus: [0, 100] })
  const b = bg({ ...VID, blur: 12, dim: 0, focus: [100, 0] })
  assert.equal(b.ok, true, b.errors.join('\n'))
  assert.deepEqual([b.client.background.blur, b.client.background.dim, b.client.background.focus], [12, 0, [100, 0]])
  for (const f of ['photo.png', 'wide.jpeg', 'shot.webp']) assert.equal(bg({ type: 'image', file: f }).ok, true, f)
})

test('style keeps set values and fills the rest with null', () => {
  const res = style({ buttonShape: 'pill', shadow: 'hard' })
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.deepEqual(res.client.style, { ...ALL_NULL_STYLE, buttonShape: 'pill', shadow: 'hard' })
})

test('every style value in the table is accepted', () => {
  const table = {
    buttonShape: ['square', 'rounded', 'pill'],
    buttonFill: ['solid', 'outline', 'soft', 'glass'],
    linkLayout: ['list', 'grid'],
    align: ['left', 'center'],
    logoShape: ['square', 'rounded', 'circle'],
    coverShape: ['banner', 'rounded', 'circle'],
    spacing: ['compact', 'comfortable'],
    shadow: ['none', 'soft', 'hard'],
  }
  for (const [k, values] of Object.entries(table)) {
    for (const v of values) {
      const res = style({ [k]: v })
      assert.equal(res.ok, true, `${k}=${v}: ${res.errors.join('\n')}`)
      assert.equal(res.client.style[k], v)
    }
  }
})

/* ---------------------------------------------------------------- errors, section 1 table */

test('background must be an object with a type', () => {
  for (const bad of ['red', 7, [], {}, true]) hasErr(bg(bad), 'background: must be an object with a type')
})

test('background.type must be one of color, gradient, image, video', () => {
  for (const bad of ['pattern', 'Image', '', 5, null]) {
    const res = bg({ type: bad })
    hasErr(res, 'background.type: must be one of color, gradient, image, video')
    assert.equal(res.ok, false)
  }
})

test('gradient stops: 2 or 3 colours', () => {
  for (const stops of [undefined, [], ['bg'], ['bg', 'ink', 'accent', '#fff'], 'bg,ink', { 0: 'bg', 1: 'ink' }]) {
    hasErr(bg({ type: 'gradient', stops }), 'background.stops: need 2 or 3 colours')
  }
})

test('gradient stops: each one is bg, ink, accent or a hex colour, error names the index', () => {
  const res = bg({ type: 'gradient', stops: ['bg', 'red', '#12'] })
  hasErr(res, 'background.stops[1]: must be bg, ink, accent or a hex colour')
  hasErr(res, 'background.stops[2]: must be bg, ink, accent or a hex colour')
  assert.ok(!res.errors.some((e) => e.startsWith('background.stops[0]')))
  hasErr(bg({ type: 'gradient', stops: ['BG', 'ink'] }), 'background.stops[0]: must be bg, ink, accent or a hex colour')
  hasErr(bg({ type: 'gradient', stops: ['bg', 5] }), 'background.stops[1]: must be bg, ink, accent or a hex colour')
})

test('gradient shape: linear or radial', () => {
  for (const shape of ['conic', 'Linear', '', 3]) hasErr(bg({ type: 'gradient', stops: ['bg', 'ink'], shape }), 'background.shape: must be linear or radial')
})

test('gradient angle: whole number 0-359', () => {
  for (const angle of [360, -1, 1.5, '90', null, NaN, 720]) {
    hasErr(bg({ type: 'gradient', stops: ['bg', 'ink'], angle }), 'background.angle: must be a whole number 0-359')
  }
})

test('gradient angle with radial: only used with shape linear', () => {
  hasErr(bg({ type: 'gradient', stops: ['bg', 'ink'], shape: 'radial', angle: 90 }), 'background.angle: only used with shape linear')
  hasErr(bg({ type: 'gradient', stops: ['bg', 'ink'], shape: 'radial', angle: 0 }), 'background.angle: only used with shape linear')
})

test('image file: png, jpg, jpeg or webp only, never svg, never a path', () => {
  const want = 'background.file: must be a png, jpg, jpeg or webp file name'
  for (const file of ['logo2.svg', 'clip.mp4', 'photo', '../photo.png', 'a/photo.png', 'PHOTO PNG', 5, undefined, '']) {
    hasErr(bg({ type: 'image', file }), want)
  }
})

test('video file: an .mp4 name only', () => {
  const want = 'background.file: must be an .mp4 file name'
  for (const file of ['clip.mov', 'photo.png', 'clip.webm', '../clip.mp4', 'clip', 5, undefined]) {
    hasErr(bg({ type: 'video', file, poster: 'poster.jpg' }), want)
  }
})

test('file must exist in the client folder (image and video)', () => {
  hasErr(bg({ type: 'image', file: 'gone.png' }), 'background.file: file "gone.png" not found in the client folder')
  hasErr(bg({ type: 'video', file: 'gone.mp4', poster: 'poster.jpg' }), 'background.file: file "gone.mp4" not found in the client folder')
  assert.equal(bg({ type: 'image', file: 'gone.png' }).ok, false)
})

test('video poster is required, an image name, and must exist', () => {
  hasErr(bg({ type: 'video', file: 'clip.mp4' }), 'background.poster: required for a video background')
  for (const poster of ['logo2.svg', 'clip.mp4', '../poster.jpg', 'poster']) {
    hasErr(bg({ type: 'video', file: 'clip.mp4', poster }), 'background.poster: must be a png, jpg, jpeg or webp file name')
  }
  hasErr(bg({ type: 'video', file: 'clip.mp4', poster: 'missing.jpg' }), 'background.poster: file "missing.jpg" not found in the client folder')
})

test('blur: image 0-24, video 0-12, whole numbers', () => {
  for (const blur of [25, -1, 1.5, '3', null]) hasErr(bg({ ...IMG, blur }), 'background.blur: must be a whole number 0-24')
  for (const blur of [13, -1, 2.5, 24]) hasErr(bg({ ...VID, blur }), 'background.blur: must be a whole number 0-12')
  noErrAt(bg({ ...IMG, blur: 24 }), 'background.blur')
  noErrAt(bg({ ...VID, blur: 12 }), 'background.blur')
})

test('dim: whole number 0-80', () => {
  for (const dim of [81, -1, 40.5, '40', 100, null]) {
    hasErr(bg({ ...IMG, dim }), 'background.dim: must be a whole number 0-80')
    hasErr(bg({ ...VID, dim }), 'background.dim: must be a whole number 0-80')
  }
  noErrAt(bg({ ...IMG, dim: 0 }), 'background.dim')
  noErrAt(bg({ ...IMG, dim: 80 }), 'background.dim')
})

test('focus: [x, y] of whole numbers 0-100', () => {
  const want = 'background.focus: must be [x, y] with whole numbers 0-100'
  for (const focus of [[101, 0], [0, -1], [1], [1, 2, 3], 'center', [1.5, 2], ['1', '2'], {}, null]) hasErr(bg({ ...IMG, focus }), want)
  noErrAt(bg({ ...IMG, focus: [0, 0] }), 'background.focus')
  noErrAt(bg({ ...IMG, focus: [100, 100] }), 'background.focus')
})

test('unknown background keys are named, per type', () => {
  hasErr(bg({ type: 'color', blur: 3 }), 'background.blur: unknown key')
  hasErr(bg({ type: 'color', file: 'photo.png' }), 'background.file: unknown key')
  hasErr(bg({ type: 'gradient', stops: ['bg', 'ink'], file: 'photo.png' }), 'background.file: unknown key')
  hasErr(bg({ type: 'gradient', stops: ['bg', 'ink'], dim: 20 }), 'background.dim: unknown key')
  hasErr(bg({ ...IMG, stops: ['bg', 'ink'] }), 'background.stops: unknown key')
  hasErr(bg({ ...IMG, poster: 'poster.jpg' }), 'background.poster: unknown key')
  hasErr(bg({ ...IMG, shape: 'linear' }), 'background.shape: unknown key')
  hasErr(bg({ ...VID, stops: ['bg', 'ink'] }), 'background.stops: unknown key')
  hasErr(bg({ ...VID, angle: 10 }), 'background.angle: unknown key')
  hasErr(bg({ ...IMG, wobble: 1 }), 'background.wobble: unknown key')
})

test('style must be an object', () => {
  for (const bad of ['pill', 5, [], true]) hasErr(style(bad), 'style: must be an object')
})

test('style values: error names the key and lists the options', () => {
  const want = {
    buttonShape: 'square, rounded, pill',
    buttonFill: 'solid, outline, soft, glass',
    linkLayout: 'list, grid',
    align: 'left, center',
    logoShape: 'square, rounded, circle',
    coverShape: 'banner, rounded, circle',
    spacing: 'compact, comfortable',
    shadow: 'none, soft, hard',
  }
  for (const [k, list] of Object.entries(want)) {
    for (const bad of ['blob', 7, '']) hasErr(style({ [k]: bad }), `style.${k}: must be one of ${list}`)
  }
})

test('unknown style keys are named', () => {
  hasErr(style({ coverShape: 'none' }), 'style.coverShape: must be one of banner, rounded, circle')
  hasErr(style({ fit: 'cover' }), 'style.fit: unknown key')
  hasErr(style({ buttonColour: 'red' }), 'style.buttonColour: unknown key')
})

test('bad background and bad style errors are collected together with the rest', () => {
  const res = run({ name: '', background: { type: 'nope' }, style: { shadow: 'x' } })
  assert.equal(res.ok, false)
  assert.ok(res.errors.some((e) => e.startsWith('name')))
  hasErr(res, 'background.type: must be one of color, gradient, image, video')
  hasErr(res, 'style.shadow: must be one of none, soft, hard')
})

/* ---------------------------------------------------------------- warnings, section 2 */
// Default theme: ink #3b1f14 on bg #fff4e6. Worst-case contrast at dim d: 1.00 at 0, 2.48 at 40, 8.68 at 80.
// Smallest dim that keeps 4.5:1 is 58.

test('image: dim below the safe minimum warns with the worst-case ratio and the dim that fixes it', () => {
  const res = bg({ ...IMG, dim: 40 })
  assert.equal(res.ok, true, 'warnings never block')
  assert.deepEqual(warnsAt(res, 'background.dim'), [
    'background.dim: text can drop to 2.48:1 over the busiest part of the picture, dim 58% or more keeps 4.5:1',
  ])
})

test('the default dim (absent) is 40 and warns the same way on a default theme', () => {
  const res = bg(IMG)
  assert.deepEqual(warnsAt(res, 'background.dim'), [
    'background.dim: text can drop to 2.48:1 over the busiest part of the picture, dim 58% or more keeps 4.5:1',
  ])
})

test('video is held to the same rule as image', () => {
  const res = bg({ ...VID, dim: 0 })
  assert.deepEqual(warnsAt(res, 'background.dim'), [
    'background.dim: text can drop to 1.00:1 over the busiest part of the picture, dim 58% or more keeps 4.5:1',
  ])
})

test('boundary: dim 58 is quiet, dim 57 warns', () => {
  assert.deepEqual(warnsAt(bg({ ...IMG, dim: 58 }), 'background.dim'), [])
  const w = warnsAt(bg({ ...IMG, dim: 57 }), 'background.dim')
  assert.equal(w.length, 1)
  assert.match(w[0], /^background\.dim: text can drop to \d\.\d\d:1 over the busiest part of the picture, dim 58% or more keeps 4\.5:1$/)
  assert.deepEqual(warnsAt(bg({ ...IMG, dim: 80 }), 'background.dim'), [])
})

test('a theme that cannot reach 4.5:1 even at 80% dim says so', () => {
  const theme = { bg: '#ffffff', ink: '#666666', accent: '#e8622d' } // needs 90% dim
  const res = bg({ ...IMG, dim: 80 }, { theme })
  assert.equal(res.ok, true)
  assert.deepEqual(warnsAt(res, 'background.dim'), [
    'background.dim: text can drop to 3.58:1 over the busiest part of the picture, even 80% dim cannot guarantee 4.5:1 with these colours',
  ])
})

test('colour and gradient backgrounds never raise the dim warning', () => {
  assert.deepEqual(warnsAt(run(), 'background.dim'), [])
  const g = bg({ type: 'gradient', stops: ['bg', 'ink'] })
  assert.equal(g.ok, true, g.errors.join('\n'))
  assert.deepEqual(warnsAt(g, 'background.dim'), [])
})

test('gradient: ink against a stop that is ink itself drops to 1.00:1', () => {
  const res = bg({ type: 'gradient', stops: ['ink', 'bg'] })
  assert.equal(res.ok, true)
  assert.deepEqual(warnsAt(res, 'background.stops'), ['background.stops: text contrast drops to 1.00:1 on part of the gradient, 4.5:1 recommended'])
})

test('gradient: three stops are sampled across both segments', () => {
  const res = bg({ type: 'gradient', stops: ['bg', 'bg', 'ink'], shape: 'radial' })
  assert.deepEqual(warnsAt(res, 'background.stops'), ['background.stops: text contrast drops to 1.00:1 on part of the gradient, 4.5:1 recommended'])
})

test('gradient: a mid-gradient dip is caught even when both ends are fine', () => {
  // cream -> deep teal -> cream: ink #3b1f14 on the teal middle is well under 4.5
  const res = bg({ type: 'gradient', stops: ['bg', '#1c4d4a', 'bg'] })
  const w = warnsAt(res, 'background.stops')
  assert.equal(w.length, 1)
  assert.match(w[0], /^background\.stops: text contrast drops to \d\.\d\d:1 on part of the gradient, 4\.5:1 recommended$/)
})

test('gradient: all stops comfortable stays quiet', () => {
  for (const g of [bg({ type: 'gradient', stops: ['bg', '#ffffff'] }), bg({ type: 'gradient', stops: ['bg', 'bg', '#fff8f0'], angle: 90 })]) {
    assert.equal(g.ok, true, g.errors.join('\n'))
    assert.deepEqual(warnsAt(g, 'background.stops'), [])
  }
})

test('invalid backgrounds do not also produce contrast warnings', () => {
  const res = bg({ type: 'gradient', stops: ['bg'] })
  assert.equal(res.ok, false)
  assert.deepEqual(warnsAt(res, 'background.stops'), [])
})
