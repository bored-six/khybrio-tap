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
import { SITE, linkTags } from './helpers.js'
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

for (const lookId of Object.keys(looks)) {
  const hostile = (credit) => {
    const res = validateClient(
      {
        slug: 'hostile-test',
        name: `<script>alert("x")</script> O'Neil & Co`,
        tagline: `"quoted" <i>tag</i>`,
        look: lookId,
        theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#e8622d' },
        links: Object.keys(KINDS).map((kind) => ({
          kind,
          url: kind === 'phone' ? 'tel:+639171234567' : kind === 'email' ? 'mailto:a@b.co' : `https://example.com/${kind}?a=1&b=2`,
          label: `<b>${kind}</b>`,
        })),
        branches: [{ name: '<u>Branch</u>', address: 'Pasonanca & co', maps: 'https://maps.app.goo.gl/x', hours: '9-9' }],
        credit,
      },
      { folder: 'hostile-test', looks: Object.keys(looks), fonts: Object.keys(fonts), files: [] },
    )
    assert.equal(res.ok, true, res.errors.join('\n'))
    return res.client
  }

  test(`look "${lookId}": escapes everything and ships no script`, () => {
    const html = renderPage(hostile(true), SITE, { looks, fonts })
    assert.ok(!/<script/i.test(html))
    assert.ok(!/<(b|i|u)>/.test(html), 'a raw tag from client data leaked')
  })

  test(`look "${lookId}": every link, in order, primary first`, () => {
    const c = hostile(true)
    const tags = linkTags(renderPage(c, SITE, { looks, fonts }))
    assert.deepEqual(tags.map((t) => t.kind), c.links.map((l) => l.kind))
    assert.deepEqual(tags.map((t) => t.href), c.links.map((l) => esc(l.url)))
    assert.deepEqual(tags.map((t) => t.primary), c.links.map((_, i) => i === 0))
  })

  test(`look "${lookId}": credit link follows the credit flag`, () => {
    const credit = /<a\b[^>]*href="https:\/\/khybrio\.com\/"[^>]*>[\s\S]*?Khybrio[\s\S]*?<\/a>/
    assert.match(renderPage(hostile(true), SITE, { looks, fonts }), credit)
    assert.doesNotMatch(renderPage(hostile(false), SITE, { looks, fonts }), /href="https:\/\/khybrio\.com\/"/)
  })

  test(`look "${lookId}": under 30 KB with every kind`, () => {
    const html = renderPage(hostile(true), SITE, { looks, fonts })
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
