// renderPage v3: style vars on :root, the fixed backdrop layer, og:image fallback.
// Written from sections 3 and 5 of .claude/specs/v3-style-and-media.md before the code existed.
// Clients are built from a normalized v2 client plus hand-written normalized `background` / `style` values
// (spec section 1 "Normalized client"), so these tests do not depend on the validator.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderPage } from '../src/render.js'
import { validateClient } from '../src/validate.js'
import { STYLE, STYLE_KEYS } from '../src/style.js'
import { FAKE_FONTS, FAKE_LOOKS, OPTS, SITE, SITE_SUBPATH, rawClient } from './helpers.js'

const BASE = validateClient(rawClient({ logo: 'logo.svg', cover: 'cover.jpg' }), OPTS)
assert.equal(BASE.ok, true, BASE.errors.join('\n'))
const NO_STYLE = { buttonShape: null, buttonFill: null, linkLayout: null, align: null, logoShape: null, coverShape: null, spacing: null, shadow: null }

const make = (o = {}) => ({ ...BASE.client, ...o })
const page = (o = {}, site = SITE) => renderPage(make(o), site, { looks: FAKE_LOOKS, fonts: FAKE_FONTS })
const css = (html) => (html.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || ''
const rootOf = (html) => (css(html).match(/:root\{[^}]*\}/) || [''])[0]
const squash = (s) => s.replace(/\s+/g, '')
const withStyle = (s) => ({ style: { ...NO_STYLE, ...s } })

const GRAD = (stops, shape = 'linear', angle = 180) => ({ type: 'gradient', stops, shape, angle: shape === 'radial' ? null : angle })
const IMAGE = (o = {}) => ({ type: 'image', file: 'photo.png', blur: 0, dim: 40, focus: [50, 50], ...o })
const VIDEO = (o = {}) => ({ type: 'video', file: 'clip.mp4', poster: 'poster.jpg', blur: 0, dim: 40, focus: [50, 50], ...o })
const stop = (ref, hex) => ({ ref, hex })

// Spec section 3, copied out of the table.
const TABLE = {
  buttonShape: { square: '--btn-r:0', rounded: '--btn-r:14px', pill: '--btn-r:999px' },
  buttonFill: {
    solid: '--btn-bg:var(--ink);--btn-ink:var(--bg);--btn-line:transparent;--btn-blur:none',
    outline: '--btn-bg:transparent;--btn-ink:var(--ink);--btn-line:var(--ink);--btn-blur:none',
    soft: '--btn-bg:color-mix(in srgb,var(--ink) 10%,var(--bg));--btn-ink:var(--ink);--btn-line:transparent;--btn-blur:none',
    glass: '--btn-bg:color-mix(in srgb,var(--bg) 60%,transparent);--btn-ink:var(--ink);--btn-line:color-mix(in srgb,var(--ink) 16%,transparent);--btn-blur:blur(12px) saturate(1.3)',
  },
  linkLayout: { list: '--link-cols:1', grid: '--link-cols:2' },
  align: { left: '--align:left;--justify:flex-start', center: '--align:center;--justify:center' },
  logoShape: { square: '--logo-r:0', rounded: '--logo-r:22%', circle: '--logo-r:50%' },
  coverShape: {
    banner: '--cover-r:0;--cover-ratio:16/9;--cover-w:100%',
    rounded: '--cover-r:20px;--cover-ratio:16/10;--cover-w:100%',
    circle: '--cover-r:50%;--cover-ratio:1;--cover-w:168px',
  },
  spacing: { compact: '--gap:8px;--btn-h:52px', comfortable: '--gap:14px;--btn-h:62px' },
  shadow: { none: '--btn-shadow:none', soft: '--btn-shadow:0 8px 20px -10px color-mix(in srgb,#000 50%,transparent)', hard: '--btn-shadow:4px 4px 0 var(--ink)' },
}
const varsOf = (decls) => decls.split(';').map((d) => d.slice(0, d.indexOf(':')))

test('the style table in src/style.js is the spec table, and STYLE_KEYS its eight keys in order', () => {
  assert.deepEqual(STYLE, TABLE)
  assert.deepEqual(STYLE_KEYS, ['buttonShape', 'buttonFill', 'linkLayout', 'align', 'logoShape', 'coverShape', 'spacing', 'shadow'])
})

/* ---------------------------------------------------------------- unchanged when absent */

test('no background and no style keys: the page is exactly today\'s shell', () => {
  for (const html of [page(), page({ background: { type: 'color' }, style: NO_STYLE })]) {
    assert.match(html, /^<!doctype html><html lang="en"><head>/)
    assert.ok(!html.includes('data-bg'))
    assert.ok(!/class="kb/.test(html))
    assert.ok(!html.includes('.kb'))
    assert.ok(!html.includes('--btn-'))
    assert.ok(!html.includes('--link-cols') && !html.includes('--align') && !html.includes('--cover-') && !html.includes('--logo-r') && !html.includes('--gap'))
    assert.ok(!html.includes('prefers-reduced-motion'))
    assert.match(html, /<body><main>/)
  }
})

/* ---------------------------------------------------------------- style vars */

test('each style value emits its exact declarations on :root', () => {
  for (const [key, values] of Object.entries(TABLE)) {
    for (const [value, decls] of Object.entries(values)) {
      const root = rootOf(page(withStyle({ [key]: value })))
      assert.ok(root.includes(decls), `${key}=${value}: ${decls}\nin ${root}`)
    }
  }
})

test('a style key left null emits nothing: only the set key\'s variables appear', () => {
  for (const [key, values] of Object.entries(TABLE)) {
    const value = Object.keys(values)[0]
    const html = page(withStyle({ [key]: value }))
    const own = new Set(varsOf(values[value]))
    for (const [otherKey, otherValues] of Object.entries(TABLE)) {
      if (otherKey === key) continue
      for (const name of varsOf(Object.values(otherValues)[0])) {
        if (own.has(name)) continue
        assert.ok(!html.includes(`${name}:`), `${name} leaked with only ${key} set`)
      }
    }
  }
})

test('all eight keys together put every declaration on :root', () => {
  const html = page(withStyle({ buttonShape: 'pill', buttonFill: 'outline', linkLayout: 'grid', align: 'left', logoShape: 'circle', coverShape: 'banner', spacing: 'compact', shadow: 'hard' }))
  const root = rootOf(html)
  for (const [key, value] of [['buttonShape', 'pill'], ['buttonFill', 'outline'], ['linkLayout', 'grid'], ['align', 'left'], ['logoShape', 'circle'], ['coverShape', 'banner'], ['spacing', 'compact'], ['shadow', 'hard']]) {
    assert.ok(root.includes(TABLE[key][value]), `${key}=${value}`)
  }
  assert.ok(root.includes('--bg:') && root.includes('--accent:'), 'theme vars still there')
})

test('glass over a video swaps blur for a 72% bg and drops backdrop-filter work', () => {
  const root = rootOf(page({ background: VIDEO(), ...withStyle({ buttonFill: 'glass' }) }))
  assert.ok(root.includes('--btn-blur:none'), root)
  assert.ok(!root.includes('blur(12px)'), root)
  assert.ok(root.includes('--btn-bg:color-mix(in srgb,var(--bg) 72%,transparent)'), root)
  assert.ok(!root.includes('var(--bg) 60%'), root)
  assert.ok(root.includes('--btn-ink:var(--ink)'), root)
})

test('glass keeps its blur over image, gradient and colour backgrounds', () => {
  for (const background of [IMAGE(), GRAD([stop('bg', '#fff4e6'), stop('ink', '#3b1f14')]), { type: 'color' }]) {
    const root = rootOf(page({ background, ...withStyle({ buttonFill: 'glass' }) }))
    assert.ok(root.includes(TABLE.buttonFill.glass), `${background.type}: ${root}`)
  }
})

test('other fills over a video are untouched', () => {
  for (const fill of ['solid', 'outline', 'soft']) {
    const root = rootOf(page({ background: VIDEO(), ...withStyle({ buttonFill: fill }) }))
    assert.ok(root.includes(TABLE.buttonFill[fill]), fill)
  }
})

/* ---------------------------------------------------------------- backdrop markup */

test('gradient: data-bg on html, an empty aria-hidden kb layer first in body', () => {
  const html = page({ background: GRAD([stop('bg', '#fff4e6'), stop('accent', '#e8622d')]) })
  assert.match(html, /^<!doctype html><html lang="en" data-bg="gradient"><head>/)
  assert.ok(html.includes('<body><div class="kb" aria-hidden="true"></div><main>'), html.slice(html.indexOf('<body>'), html.indexOf('<body>') + 200))
  assert.ok(!html.includes('<img class="kb-m"') && !html.includes('<video'))
})

test('gradient css: refs stay variables, free hex stays hex, angle and stop order kept', () => {
  const html = page({ background: GRAD([stop('bg', '#fff4e6'), stop('accent', '#e8622d'), stop(null, '#abcdef')], 'linear', 135) })
  const grad = squash(css(html)).match(/linear-gradient\([^)]*\)/)
  assert.ok(grad, 'no linear-gradient in css')
  assert.equal(grad[0], 'linear-gradient(135deg,var(--bg),var(--accent),#abcdef)')
})

test('gradient css: default angle 180, two stops, ink ref', () => {
  const html = page({ background: GRAD([stop('ink', '#3b1f14'), stop('bg', '#fff4e6')]) })
  assert.equal(squash(css(html)).match(/linear-gradient\([^)]*\)/)[0], 'linear-gradient(180deg,var(--ink),var(--bg))')
})

test('radial gradient css', () => {
  const html = page({ background: GRAD([stop('bg', '#fff4e6'), stop(null, '#112233')], 'radial') })
  const g = squash(css(html)).match(/radial-gradient\([^)]*\)/)
  assert.ok(g, 'no radial-gradient in css')
  assert.equal(g[0], 'radial-gradient(130%90%at50%0%,var(--bg),#112233)')
  assert.ok(!squash(css(html)).includes('linear-gradient'))
})

test('gradient has no dim overlay', () => {
  assert.ok(!css(page({ background: GRAD([stop('bg', '#fff4e6'), stop('ink', '#3b1f14')]) })).includes('.kb::after'))
})

test('image markup is exactly the spec, first child of body', () => {
  const html = page({ background: IMAGE() })
  assert.match(html, /^<!doctype html><html lang="en" data-bg="image"><head>/)
  assert.ok(
    html.includes('<body><div class="kb" aria-hidden="true"><img class="kb-m" src="/creamy-creations/photo.png" alt="" decoding="async"></div><main>'),
    html.slice(html.indexOf('<body>'), html.indexOf('<body>') + 220),
  )
  assert.ok(!html.includes('<video'))
})

test('image src follows the site base', () => {
  const html = page({ background: IMAGE() }, SITE_SUBPATH)
  assert.ok(html.includes('<img class="kb-m" src="/khybrio-tap/creamy-creations/photo.png" alt="" decoding="async">'))
})

test('video markup is exactly the spec: poster img first, then the muted looping video', () => {
  const html = page({ background: VIDEO() })
  assert.match(html, /^<!doctype html><html lang="en" data-bg="video"><head>/)
  const want =
    '<body><div class="kb" aria-hidden="true">' +
    '<img class="kb-m" src="/creamy-creations/poster.jpg" alt="" decoding="async">' +
    '<video class="kb-m kb-v" autoplay muted loop playsinline disablepictureinpicture disableremoteplayback tabindex="-1" poster="/creamy-creations/poster.jpg">' +
    '<source src="/creamy-creations/clip.mp4" type="video/mp4" media="(prefers-reduced-motion: no-preference)">' +
    '</video></div><main>'
  assert.ok(html.includes(want), html.slice(html.indexOf('<body>'), html.indexOf('<body>') + 700))
})

test('video markup under a sub-path site', () => {
  const html = page({ background: VIDEO() }, SITE_SUBPATH)
  assert.ok(html.includes('<source src="/khybrio-tap/creamy-creations/clip.mp4" type="video/mp4" media="(prefers-reduced-motion: no-preference)">'))
  assert.ok(html.includes('poster="/khybrio-tap/creamy-creations/poster.jpg"'))
})

test('the reduced-motion fallback rule is present for video', () => {
  assert.ok(css(page({ background: VIDEO() })).includes('@media (prefers-reduced-motion:reduce){.kb-v{display:none}}'))
})

/* ---------------------------------------------------------------- backdrop css */

test('core backdrop css is the exact spec text', () => {
  for (const background of [IMAGE(), VIDEO(), GRAD([stop('bg', '#fff4e6'), stop('ink', '#3b1f14')])]) {
    const c = css(page({ background }))
    assert.ok(c.includes('html[data-bg]{background:var(--bg)}html[data-bg] body{background:transparent}'), background.type)
    assert.ok(c.includes('.kb{position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;z-index:-1;overflow:hidden;pointer-events:none}'), background.type)
    assert.equal(c.split('.kb{position:fixed').length - 1, 1, 'emitted once')
  }
})

test('.kb-m: cover fit with the focus point; blur adds filter and a scale that hides the edge', () => {
  const plain = css(page({ background: IMAGE({ focus: [30, 70] }) }))
  assert.ok(plain.includes('.kb-m{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:30% 70%}'), plain)
  assert.ok(!plain.includes('filter:blur'))
  const blurred = css(page({ background: VIDEO({ blur: 6 }) }))
  assert.ok(blurred.includes('.kb-m{filter:blur(6px);transform:scale(1.12)}'), blurred)
  assert.ok(css(page({ background: IMAGE({ blur: 24 }) })).includes('.kb-m{filter:blur(24px);transform:scale(1.12)}'))
})

test('.kb::after dim overlay uses the theme bg at dim/100 opacity', () => {
  for (const [dim, opacity] of [[40, '0.4'], [5, '0.05'], [80, '0.8'], [0, '0']]) {
    for (const background of [IMAGE({ dim }), VIDEO({ dim })]) {
      assert.ok(css(page({ background })).includes(`.kb::after{content:"";position:absolute;inset:0;background:var(--bg);opacity:${opacity}}`), `${background.type} dim ${dim}`)
    }
  }
})

test('backdrop css comes after the look css', () => {
  const c = css(page({ background: VIDEO() }))
  const look = c.indexOf('main{display:block}')
  assert.ok(look >= 0, 'look css missing')
  for (const marker of ['html[data-bg]{', '.kb{position:fixed', '.kb-m{position:absolute', '.kb::after', '@media (prefers-reduced-motion:reduce)']) {
    assert.ok(c.indexOf(marker) > look, `${marker} must follow the look css`)
  }
})

/* ---------------------------------------------------------------- og:image */

const ogImage = (html) => (html.match(/<meta property="og:image" content="([^"]*)">/) || [])[1]
const ORIGIN = 'https://tap.khybrio.com/creamy-creations/'

test('og:image: cover first, then logo, then the background image, then the video poster', () => {
  assert.equal(ogImage(page({ background: IMAGE() })), ORIGIN + 'cover.jpg')
  assert.equal(ogImage(page({ cover: null, background: IMAGE() })), ORIGIN + 'logo.svg')
  assert.equal(ogImage(page({ cover: null, logo: null, background: IMAGE() })), ORIGIN + 'photo.png')
  assert.equal(ogImage(page({ cover: null, logo: null, background: VIDEO() })), ORIGIN + 'poster.jpg')
})

test('og:image: a gradient or colour page with no logo or cover has none', () => {
  assert.equal(ogImage(page({ cover: null, logo: null, background: GRAD([stop('bg', '#fff4e6'), stop('ink', '#3b1f14')]) })), undefined)
  assert.equal(ogImage(page({ cover: null, logo: null })), undefined)
})

/* ---------------------------------------------------------------- hard rules */

test('no <script> and exactly one <style> with every background type and all style keys', () => {
  const all = withStyle({ buttonShape: 'pill', buttonFill: 'glass', linkLayout: 'grid', align: 'left', logoShape: 'circle', coverShape: 'circle', spacing: 'compact', shadow: 'soft' })
  for (const background of [{ type: 'color' }, GRAD([stop('bg', '#fff4e6'), stop('ink', '#3b1f14')]), IMAGE({ blur: 8 }), VIDEO({ blur: 4 })]) {
    const html = page({ background, ...all })
    assert.ok(!/<script/i.test(html), background.type)
    assert.equal((html.match(/<style/g) || []).length, 1, background.type)
  }
})

test('a max-limit page with a video background and all style keys stays under 30 KB', () => {
  const blocks = []
  for (let i = 0; i < 20; i++) blocks.push({ type: 'link', kind: 'custom', url: `https://example.com/${i}?q=${'x'.repeat(30)}`, label: 'x'.repeat(40), primary: i === 0 })
  for (let i = 0; i < 3; i++) blocks.push({ type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', provider: 'youtube', id: 'dQw4w9WgXcQ', vertical: false, src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' })
  for (let i = 0; i < 2; i++) blocks.push({ type: 'socials', items: Array.from({ length: 8 }, () => ({ kind: 'facebook', url: 'https://facebook.com/x', label: 'Facebook' })) })
  blocks.push({ type: 'heading', text: 'h'.repeat(60) }, { type: 'text', text: 't'.repeat(280) }, { type: 'text', text: 'e'.repeat(280) }, { type: 'heading', text: 'h'.repeat(60) }, { type: 'text', text: '&'.repeat(280) })
  assert.equal(blocks.length, 30)
  const html = page({
    blocks,
    tagline: 'x'.repeat(120),
    background: VIDEO({ blur: 12, dim: 80, focus: [100, 100] }),
    ...withStyle({ buttonShape: 'pill', buttonFill: 'glass', linkLayout: 'grid', align: 'left', logoShape: 'circle', coverShape: 'circle', spacing: 'compact', shadow: 'hard' }),
  })
  assert.ok(Buffer.byteLength(html) < 30 * 1024, `${Buffer.byteLength(html)} bytes`)
})
