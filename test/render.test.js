import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderPage, render404 } from '../src/render.js'
import { validateClient } from '../src/validate.js'
import { FAKE_FONTS, FAKE_LOOKS, OPTS, SITE, SITE_SUBPATH, rawClient, linkTags } from './helpers.js'

const RENDER_OPTS = { looks: FAKE_LOOKS, fonts: FAKE_FONTS }

function client(overrides = {}) {
  const res = validateClient(rawClient(overrides), OPTS)
  assert.equal(res.ok, true, res.errors.join('\n'))
  return res.client
}
const meta = (html, prop) => (html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`)) || [])[1]

test('document basics', () => {
  const html = renderPage(client(), SITE, RENDER_OPTS)
  assert.match(html, /^<!doctype html>/i)
  assert.match(html, /<html lang="en">/)
  assert.match(html, /<meta name="viewport"/)
  assert.match(html, /<title>Creamy Creations<\/title>/)
  assert.equal(meta(html, 'theme-color'), '#fff4e6')
})

test('canonical and og:url use origin + base + slug', () => {
  const a = renderPage(client(), SITE, RENDER_OPTS)
  assert.match(a, /<link rel="canonical" href="https:\/\/tap\.khybrio\.com\/creamy-creations\/">/)
  assert.equal(meta(a, 'og:url'), 'https://tap.khybrio.com/creamy-creations/')
  const b = renderPage(client(), SITE_SUBPATH, RENDER_OPTS)
  assert.equal(meta(b, 'og:url'), 'https://bored-six.github.io/khybrio-tap/creamy-creations/')
})

test('og:description uses the tagline, else a default built from the name', () => {
  assert.equal(meta(renderPage(client({ tagline: 'Shakes, three branches' }), SITE, RENDER_OPTS), 'og:description'), 'Shakes, three branches')
  assert.equal(meta(renderPage(client(), SITE, RENDER_OPTS), 'og:description'), 'Creamy Creations: links, location and contact')
})

test('og:image prefers cover, then logo, absolute; omitted when neither', () => {
  const both = renderPage(client({ logo: 'logo.svg', cover: 'cover.jpg' }), SITE_SUBPATH, RENDER_OPTS)
  assert.equal(meta(both, 'og:image'), 'https://bored-six.github.io/khybrio-tap/creamy-creations/cover.jpg')
  const logoOnly = renderPage(client({ logo: 'logo.svg' }), SITE, RENDER_OPTS)
  assert.equal(meta(logoOnly, 'og:image'), 'https://tap.khybrio.com/creamy-creations/logo.svg')
  assert.equal(meta(renderPage(client(), SITE, RENDER_OPTS), 'og:image'), undefined)
})

test('asset() paths carry the base', () => {
  const html = renderPage(client({ logo: 'logo.svg' }), SITE_SUBPATH, RENDER_OPTS)
  assert.match(html, /src="\/khybrio-tap\/creamy-creations\/logo\.svg"/)
})

test('client strings are escaped in head and body', () => {
  const html = renderPage(client({ name: '<script>alert(1)</script>', tagline: 'Say "hi" & <b>' }), SITE, RENDER_OPTS)
  assert.ok(!html.includes('<script'), 'raw script tag leaked')
  assert.ok(!html.includes('<b>'), 'raw tag from tagline leaked')
  assert.match(html, /&lt;script&gt;/)
  assert.equal(meta(html, 'og:description'), 'Say &quot;hi&quot; &amp; &lt;b&gt;')
})

test('no JavaScript, one inline style, no external stylesheet', () => {
  const html = renderPage(client(), SITE, RENDER_OPTS)
  assert.ok(!/<script/i.test(html))
  assert.equal((html.match(/<style/g) || []).length, 1)
  assert.ok(!/<link[^>]+rel="stylesheet"/.test(html))
})

test('theme custom properties are on :root', () => {
  const html = renderPage(client(), SITE, RENDER_OPTS)
  const root = (html.match(/:root\s*\{([^}]*)\}/) || [])[1] || ''
  assert.match(root, /--bg:\s*#fff4e6/)
  assert.match(root, /--ink:\s*#3b1f14/)
  assert.match(root, /--accent:\s*#e8622d/)
  assert.match(root, /--on-accent:\s*#[0-9a-f]{6}/)
  assert.match(root, /--font-heading:[^;]*Fraunces/)
  assert.match(root, /--font-tagline:[^;]*Inter/)
  assert.match(root, /--font-body:[^;]*Inter/)
  assert.match(root, /--heading-weight:\s*600/)
  assert.ok(!root.includes('--font-display'), '--font-display was removed in v2')
})

test('--heading-weight follows the heading font, each var follows its own font', () => {
  const html = renderPage(client({ font: { heading: 'mono', tagline: 'fraunces', body: 'inter' } }), SITE, RENDER_OPTS)
  const root = (html.match(/:root\s*\{([^}]*)\}/) || [])[1] || ''
  assert.match(root, /--font-heading:[^;]*Mono/)
  assert.match(root, /--font-tagline:[^;]*Fraunces/)
  assert.match(root, /--font-body:[^;]*Inter/)
  assert.match(root, /--heading-weight:\s*400/)
})

test('@font-face only for fonts the client uses, served from base/fonts', () => {
  const html = renderPage(client(), SITE_SUBPATH, RENDER_OPTS)
  assert.match(html, /url\(["']?\/khybrio-tap\/fonts\/fraunces\.woff2/)
  assert.match(html, /url\(["']?\/khybrio-tap\/fonts\/inter-400\.woff2/)
  assert.ok(!html.includes('mono.woff2'), 'unused font was emitted')
  assert.equal((html.match(/@font-face/g) || []).length, 2, 'heading fraunces, tagline+body inter: deduped to two')
})

test('@font-face covers heading, tagline and body when all three differ', () => {
  const html = renderPage(client({ font: { heading: 'mono', tagline: 'fraunces', body: 'inter' } }), SITE, RENDER_OPTS)
  assert.equal((html.match(/@font-face/g) || []).length, 3)
  for (const f of ['mono.woff2', 'fraunces.woff2', 'inter-400.woff2']) assert.ok(html.includes(f), f)
})

test('link blocks come through the look in order with the primary marked', () => {
  const html = renderPage(client(), SITE, RENDER_OPTS)
  const tags = linkTags(html)
  assert.deepEqual(tags.map((t) => t.kind), ['menu', 'messenger'])
  assert.deepEqual(tags.map((t) => t.primary), [true, false])
})

test('page stays under 30 KB without images and fonts', () => {
  const blocks = Array.from({ length: 20 }, (_, i) => ({ type: 'link', kind: 'website', url: `https://example.com/${i}`, label: 'x'.repeat(40) }))
  const html = renderPage(client({ blocks, tagline: 'x'.repeat(120) }), SITE, RENDER_OPTS)
  assert.ok(Buffer.byteLength(html) < 30 * 1024, `${Buffer.byteLength(html)} bytes`)
})

test('render404 is a valid script-free page that links home', () => {
  const html = render404(SITE, { fonts: FAKE_FONTS })
  assert.match(html, /^<!doctype html>/i)
  assert.ok(!/<script/i.test(html))
  assert.ok(html.includes('href="https://khybrio.com/"'))
})
