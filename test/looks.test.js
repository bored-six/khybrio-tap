// Integration: the REAL looks, fonts and icons, plus the real clients/ folder.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { looks } from '../src/looks/index.js'
import { fonts } from '../src/fonts.js'
import { icon } from '../src/icons.js'
import { KINDS } from '../src/kinds.js'
import { validateClient } from '../src/validate.js'
import { renderPage } from '../src/render.js'
import { build } from '../src/build.js'
import { SITE, SITE_SUBPATH, linkTags } from './helpers.js'
import { esc } from '../src/html.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

test('at least two looks, each with label, render and css', () => {
  assert.ok(Object.keys(looks).length >= 2)
  for (const [id, look] of Object.entries(looks)) {
    assert.equal(typeof look.label, 'string', id)
    assert.equal(typeof look.render, 'function', id)
    assert.equal(typeof look.css, 'function', id)
  }
})

test('every font file in the registry exists on disk', async () => {
  for (const [id, f] of Object.entries(fonts)) {
    assert.ok(f.family && f.fallback && f.files.length, id)
    for (const file of f.files) await access(file.path).catch(() => assert.fail(`${id}: ${file.path} missing`))
  }
})

test('every kind has an inline, decorative SVG icon', () => {
  for (const kind of Object.keys(KINDS)) {
    const svg = icon(kind)
    assert.match(svg, /^<svg\b/, kind)
    assert.match(svg, /aria-hidden="true"/, kind)
  }
})

const SITE_PATH = SITE_SUBPATH // base '/khybrio-tap/', so asset() prefixes are visible
const THEME = { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#e8622d' }
const FILES = ['logo.svg', 'cover.jpg']

function v2(lookId, raw) {
  const res = validateClient(
    { slug: 'hostile-test', name: `<script>alert("x")</script> O'Neil & Co`, look: lookId, theme: THEME, ...raw },
    { folder: 'hostile-test', looks: Object.keys(looks), fonts: Object.keys(fonts), files: FILES },
  )
  assert.equal(res.ok, true, res.errors.join('\n'))
  return res.client
}

const urlFor = (kind) => {
  const scheme = KINDS[kind].scheme
  if (scheme === 'tel:') return 'tel:+639171234567'
  if (scheme === 'mailto:') return 'mailto:a@b.co'
  if (scheme === 'viber:') return 'viber://chat?number=%2B639171234567'
  return `https://example.com/${kind}?a=1&b=2`
}
const kindsWhere = (pred) => Object.keys(KINDS).filter((k) => pred(KINDS[k]))

// All five block types, hostile strings everywhere, logo + cover + tagline + branches + credit.
function everything(lookId, credit = true) {
  return v2(lookId, {
    tagline: `"quoted" <i>tag</i>`,
    logo: 'logo.svg',
    cover: 'cover.jpg',
    blocks: [
      { type: 'heading', text: `<b>Heading</b> & "more"` },
      { type: 'link', kind: 'website', url: 'https://example.com/a?x=1&y=2', label: `<b>First</b> link` },
      { type: 'text', text: `line one <u>raw</u>\nline two & "three"` },
      { type: 'socials', items: [{ kind: 'facebook', url: 'https://facebook.com/x?a=1&b=2' }, { kind: 'phone', url: 'tel:+639171234567' }, { kind: 'viber', url: 'viber://chat?number=%2B639171234567' }] },
      { type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      { type: 'link', kind: 'custom', url: 'https://example.com/b', label: `<i>Second</i>` },
      { type: 'video', url: 'https://www.tiktok.com/@a/video/7234567890123456789' },
    ],
    branches: [{ name: '<u>Branch</u>', address: 'Pasonanca & co', maps: 'https://maps.app.goo.gl/x', hours: '9-9' }],
    credit,
  })
}

const stripStyle = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '')
const styleOf = (html) => (html.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || ''
const dataBlocks = (html) => [...stripStyle(html).matchAll(/\bdata-block="([^"]*)"/g)].map((m) => m[1])

for (const lookId of Object.keys(looks)) {
  const render = (c) => renderPage(c, SITE_PATH, { looks, fonts })

  test(`look "${lookId}": escapes everything and ships no script`, () => {
    const html = render(everything(lookId))
    assert.ok(!/<script/i.test(html))
    assert.ok(!/<(b|i|u)>/.test(html), 'a raw tag from client data leaked')
    assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/)
    assert.match(html, /&lt;b&gt;Heading&lt;\/b&gt; &amp; &quot;more&quot;/)
  })

  test(`look "${lookId}": one data-block per block, same count and order`, () => {
    const c = everything(lookId)
    assert.deepEqual(dataBlocks(render(c)), c.blocks.map((b) => b.type))
  })

  test(`look "${lookId}": block markup follows the look interface`, () => {
    const html = stripStyle(render(everything(lookId)))
    assert.match(html, /<h2\b[^>]*data-block="heading"[^>]*>/)
    assert.match(html, /<p\b[^>]*data-block="text"[^>]*>[^]*?line one &lt;u&gt;raw&lt;\/u&gt;<br>line two/)
    assert.match(html, /<a\b[^>]*data-block="link"[^>]*>/)
    assert.equal((html.match(/<iframe\b/g) || []).length, 2)
    assert.equal((html.match(/data-block="video"/g) || []).length, 2)
    const segs = html.split(/(?=<[a-z0-9]+\b[^>]*\bdata-block=")/).filter((x) => /^<[a-z0-9]+\b[^>]*\bdata-block=/.test(x))
    for (const seg of segs) {
      const type = seg.match(/data-block="([^"]*)"/)[1]
      assert.equal(/<iframe\b/.test(seg), type === 'video', `iframe only inside video blocks (${type})`)
    }
  })

  test(`look "${lookId}": data-primary appears exactly once, on the first link`, () => {
    const html = render(everything(lookId))
    assert.equal((stripStyle(html).match(/\sdata-primary(?=[\s>=])/g) || []).length, 1)
    const tags = linkTags(html).filter((t) => t.kind === 'website' || t.kind === 'custom')
    assert.deepEqual(tags.map((t) => t.primary), [true, false])
  })

  test(`look "${lookId}": data-kind only on link-block and socials anchors`, () => {
    const c = everything(lookId)
    const html = stripStyle(render(c))
    const tags = [...html.matchAll(/<([a-z0-9]+)\b[^>]*\bdata-kind="[^"]*"[^>]*>/g)].map((m) => m[1])
    assert.ok(tags.every((t) => t === 'a'), `data-kind on ${tags}`)
    const links = c.blocks.filter((b) => b.type === 'link').length
    const social = c.blocks.filter((b) => b.type === 'socials').reduce((n, b) => n + b.items.length, 0)
    assert.equal(tags.length, links + social)
  })

  test(`look "${lookId}": socials are icon-only anchors with an aria-label`, () => {
    const c = everything(lookId)
    const html = stripStyle(render(c))
    const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].filter((m) => !/data-block="link"/.test(m[1]) && /data-kind=/.test(m[1]))
    const items = c.blocks.find((b) => b.type === 'socials').items
    assert.equal(anchors.length, items.length)
    anchors.forEach((m, i) => {
      assert.equal((m[1].match(/\bhref="([^"]*)"/) || [])[1], esc(items[i].url))
      assert.equal((m[1].match(/\bdata-kind="([^"]*)"/) || [])[1], items[i].kind)
      assert.equal((m[1].match(/\baria-label="([^"]*)"/) || [])[1], esc(items[i].label))
      assert.equal(m[2].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim(), '', 'socials show no visible text')
      assert.match(m[2], /<svg\b/)
    })
  })

  test(`look "${lookId}": link blocks keep order, href and label`, () => {
    const c = everything(lookId)
    const html = render(c)
    const hrefs = linkTags(html).filter((t) => t.kind === 'website' || t.kind === 'custom')
    assert.deepEqual(hrefs.map((t) => t.href), c.blocks.filter((b) => b.type === 'link').map((b) => esc(b.url)))
    assert.ok(html.includes('&lt;b&gt;First&lt;/b&gt; link'))
  })

  test(`look "${lookId}": logo, cover, tagline, branches render`, () => {
    const html = render(everything(lookId))
    assert.ok(html.includes('src="/khybrio-tap/hostile-test/logo.svg"'), 'logo src')
    assert.ok(html.includes('src="/khybrio-tap/hostile-test/cover.jpg"'), 'cover src')
    assert.ok(html.includes('&quot;quoted&quot; &lt;i&gt;tag&lt;/i&gt;'), 'tagline')
    assert.ok(html.includes('&lt;u&gt;Branch&lt;/u&gt;'), 'branch name')
    const bare = render(v2(lookId, { blocks: [{ type: 'heading', text: 'Only' }] }))
    assert.ok(!bare.includes('logo.svg') && !bare.includes('cover.jpg'), 'no logo/cover when unset')
  })

  test(`look "${lookId}": credit link follows the credit flag`, () => {
    const credit = /<a\b[^>]*href="https:\/\/khybrio\.com\/"[^>]*>[\s\S]*?Khybrio[\s\S]*?<\/a>/
    assert.match(render(everything(lookId, true)), credit)
    assert.doesNotMatch(render(everything(lookId, false)), /href="https:\/\/khybrio\.com\/"/)
  })

  test(`look "${lookId}": colour only from theme vars, hex/rgb only as #000/#fff inside color-mix`, () => {
    const css = styleOf(render(everything(lookId)))
      .replace(/:root\s*\{[^}]*\}/, '')
      .replace(/color-mix\((?:[^()]|\([^()]*\))*\)/g, '')
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), `hex literal in look CSS: ${css.match(/#[0-9a-fA-F]{3,8}\b/)}`)
    assert.ok(!/\b(rgb|rgba|hsl|hsla)\(/i.test(css), 'rgb/hsl literal in look CSS')
  })

  test(`look "${lookId}": every block, in order, still escapes with every link kind`, () => {
    const c = v2(lookId, {
      blocks: [
        ...Object.keys(KINDS).filter((kind) => kind !== 'custom').map((kind) => ({
          type: 'link',
          kind,
          url: urlFor(kind),
          label: `<b>${kind}</b>`,
        })),
        { type: 'socials', items: kindsWhere((k) => k.social).slice(0, 8).map((kind) => ({ kind, url: urlFor(kind) })) },
        { type: 'socials', items: kindsWhere((k) => k.social).slice(8).map((kind) => ({ kind, url: urlFor(kind) })) },
      ],
    })
    const html = render(c)
    assert.ok(!/<(b|i|u)>/.test(html))
    assert.deepEqual(dataBlocks(html), c.blocks.map((b) => b.type))
    const linkKinds = linkTags(html).slice(0, c.blocks.filter((b) => b.type === 'link').length).map((t) => t.kind)
    assert.deepEqual(linkKinds, c.blocks.filter((b) => b.type === 'link').map((b) => b.kind))
  })

  test(`look "${lookId}": a max-limit page stays under 30 KB`, () => {
    const blocks = []
    for (let i = 0; i < 20; i++) blocks.push({ type: 'link', kind: 'custom', url: `https://example.com/${i}?q=${'x'.repeat(30)}`, label: 'x'.repeat(40) })
    for (let i = 0; i < 3; i++) blocks.push({ type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    for (let i = 0; i < 2; i++) blocks.push({ type: 'socials', items: kindsWhere((k) => k.social).slice(0, 8).map((kind) => ({ kind, url: urlFor(kind) })) })
    blocks.push({ type: 'heading', text: 'h'.repeat(60) }, { type: 'text', text: 't'.repeat(280) }, { type: 'text', text: 'a\nb\nc\nd\n' + 'e'.repeat(200) }, { type: 'heading', text: 'h'.repeat(60) }, { type: 'text', text: '&'.repeat(280) })
    assert.equal(blocks.length, 30)
    const c = v2(lookId, { tagline: 'x'.repeat(120), logo: 'logo.svg', cover: 'cover.jpg', blocks, branches: [{ name: 'B', address: 'x'.repeat(100), maps: 'https://maps.app.goo.gl/x', hours: '9-9' }] })
    const html = render(c)
    assert.ok(Buffer.byteLength(html) < 30 * 1024, `${Buffer.byteLength(html)} bytes`)
  })
}

test('the real clients/ folder builds', async () => {
  const out = await mkdtemp(join(tmpdir(), 'khybrio-tap-real-'))
  try {
    const res = await build({ root: ROOT, outDir: out, site: SITE })
    assert.ok(res.pages.includes('khybrio'), res.pages.join(','))
  } finally {
    await rm(out, { recursive: true, force: true })
  }
})

test('card look draws the cover image when one is set, and not otherwise', () => {
  const base = { slug: 'x-cafe', name: 'X Cafe', look: 'card', theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#e8622d' }, blocks: [{ type: 'link', kind: 'website', url: 'https://example.com' }] }
  const withCover = validateClient({ ...base, cover: 'cover.jpg' }, { folder: 'x-cafe', looks: Object.keys(looks), fonts: Object.keys(fonts), files: ['cover.jpg'] })
  assert.ok(withCover.ok, JSON.stringify(withCover.errors))
  const html = renderPage(withCover.client, SITE, { looks, fonts, icon })
  assert.match(html, /<img[^>]+src="[^"]*x-cafe\/cover\.jpg"/)
  const none = validateClient(base, { folder: 'x-cafe', looks: Object.keys(looks), fonts: Object.keys(fonts), files: [] })
  assert.ok(!/cover\.jpg/.test(renderPage(none.client, SITE, { looks, fonts, icon })))
})
