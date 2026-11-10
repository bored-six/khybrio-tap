// Adversarial v3 tests for render (injection, CSS shape, 30 KB budget) and build (videos, CI skip).
// Written against spec sections 3, 5, 6 and the User decisions block of .claude/specs/v3-style-and-media.md.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { looks } from '../src/looks/index.js'
import { fonts } from '../src/fonts.js'
import { icon } from '../src/icons.js'
import { KINDS } from '../src/kinds.js'
import { validateClient, validateSite, LIMITS } from '../src/validate.js'
import { renderPage } from '../src/render.js'
import { build } from '../src/build.js'
import { STYLE, STYLE_KEYS } from '../src/style.js'
import { SITE, SITE_SUBPATH } from './helpers.js'
import { ftyp, moov, mdat, mp4 } from './mp4-fixtures.js'

const LOOK_IDS = Object.keys(looks)
const THEME = { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#e8622d' }
const social = Object.keys(KINDS).filter((k) => KINDS[k].social)
const urlFor = (kind) => {
  const s = KINDS[kind].scheme
  if (s === 'tel:') return 'tel:+639171234567'
  if (s === 'mailto:') return 'mailto:a@b.co'
  if (s === 'viber:') return 'viber://chat?number=%2B639171234567'
  return `https://example.com/${kind}?a=1&b=2`
}
const BIG = ['x'.repeat(40) + '.svg', 'c.jpg', 'p'.repeat(40) + '.jpg', 'v'.repeat(40) + '.mp4', 'photo.png', 'vvvvv.mp4', 'ppppp.jpg']
const validate = (raw, files = BIG, folder = raw.slug) =>
  validateClient(raw, { folder, looks: LOOK_IDS, fonts: Object.keys(fonts), bodyFonts: Object.keys(fonts).filter((id) => fonts[id].body), files })
const page = (c, site = SITE) => renderPage(c, site, { looks, fonts, icon })
const styleOf = (html) => (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || ''
const ALL = { buttonShape: 'pill', buttonFill: 'glass', linkLayout: 'grid', align: 'left', logoShape: 'circle', coverShape: 'circle', spacing: 'comfortable', shadow: 'soft' }
const VIDEO = (n = 5) => ({ type: 'video', file: 'v'.repeat(n) + '.mp4', poster: 'p'.repeat(n) + '.jpg', blur: 12, dim: 80, focus: [100, 100] })

function maxBlocks(fill = 'x') {
  const blocks = []
  for (let i = 0; i < 20; i++) blocks.push({ type: 'link', kind: 'custom', url: `https://example.com/${i}?q=${'x'.repeat(30)}`, label: fill.repeat(40) })
  for (let i = 0; i < 3; i++) blocks.push({ type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
  for (let i = 0; i < 2; i++) blocks.push({ type: 'socials', items: social.slice(0, 8).map((kind) => ({ kind, url: urlFor(kind) })) })
  blocks.push({ type: 'heading', text: fill.repeat(60) }, { type: 'text', text: fill.repeat(280) }, { type: 'text', text: 'a\nb\nc\nd\n' + fill.repeat(200) }, { type: 'heading', text: fill.repeat(60) }, { type: 'text', text: fill.repeat(280) })
  return blocks
}
function worst(lookId, o = {}) {
  const slug = o.slug ?? 'a'.repeat(40)
  const raw = {
    slug, name: 'x'.repeat(60), tagline: 'x'.repeat(120), look: lookId,
    font: { heading: 'ibm-plex-mono', tagline: 'space-mono', body: 'bricolage-grotesque' },
    theme: THEME, logo: BIG[0], cover: BIG[1], blocks: maxBlocks(),
    branches: Array.from({ length: o.branches ?? 1 }, () => ({ name: 'x'.repeat(LIMITS.branchName), address: 'x'.repeat(LIMITS.branchAddress), maps: 'https://maps.app.goo.gl/x', hours: 'x'.repeat(LIMITS.branchHours) })),
    background: VIDEO(40), style: ALL, ...o.extra,
  }
  const res = validate(raw, BIG, slug)
  assert.equal(res.ok, true, res.errors.join('\n'))
  return res.client
}

/* ================================================================ 6. size budget */

for (const id of LOOK_IDS) {
  test(`size: look "${id}" with 3 long-named fonts, 40-char slug, 40-char file names, video bg and all 8 style keys stays under 30 KB`, () => {
    const bytes = Buffer.byteLength(page(worst(id)))
    assert.ok(bytes < 30 * 1024, `${bytes} of ${30 * 1024}`)
  })
}

for (const id of LOOK_IDS) {
  test(`size: look "${id}" with the 10 branches the validator allows, video bg and all 8 style keys stays under 30 KB (contract: page HTML < 30 KB)`, () => {
    const bytes = Buffer.byteLength(page(worst(id, { branches: LIMITS.branches, slug: 'demo-shop', extra: { background: VIDEO(5) } })))
    assert.ok(bytes < 30 * 1024, `${bytes} of ${30 * 1024}`)
  })
}

test('size: v3 itself (video + all style keys) adds under 1.5 KB to any look', () => {
  for (const id of LOOK_IDS) {
    const base = page(worst(id, { extra: { background: { type: 'color' }, style: {} } }))
    const v3 = page(worst(id))
    assert.ok(Buffer.byteLength(v3) - Buffer.byteLength(base) < 1536, `${id}: +${Buffer.byteLength(v3) - Buffer.byteLength(base)}`)
  }
})

/* ================================================================ 6. injection and CSS shape */

const HOSTILE = [
  '</style><script>alert(1)</script>',
  '</STYLE ><img src=x onerror=alert(1)>',
  '";}body{display:none}/*',
  "');}*{background:url(//evil.example/x)}/*",
  '\\00003c/style\\00003e',
  '<!--',
  '}</style',
]

for (const id of LOOK_IDS) {
  test(`inject: look "${id}": hostile text in name, tagline, labels, headings, text, branches never reaches the <style> block or breaks out of it`, () => {
    for (const bad of HOSTILE) {
      const raw = {
        slug: 'inj-test', name: bad.slice(0, 60), tagline: bad.slice(0, 120), look: id, theme: THEME, logo: BIG[0], cover: BIG[1],
        blocks: [
          { type: 'heading', text: bad.slice(0, 60) },
          { type: 'link', kind: 'custom', url: 'https://example.com/?q=%3C/style%3E', label: bad.slice(0, 40) },
          { type: 'text', text: bad },
        ],
        branches: [{ name: bad, address: bad, maps: 'https://maps.app.goo.gl/x?a=</style>', hours: bad }],
        background: { type: 'video', file: BIG[3], poster: BIG[2], blur: 3, dim: 50, focus: [10, 90] },
        style: ALL,
      }
      const res = validate(raw, BIG, 'inj-test')
      assert.equal(res.ok, true, res.errors.join('\n'))
      const html = page(res.client)
      assert.equal((html.match(/<style/gi) || []).length, 1, bad)
      assert.equal((html.match(/<\/style/gi) || []).length, 1, bad)
      assert.ok(!/<script/i.test(html), bad)
      assert.ok(!/<(img|svg|a)\b[^>]*\bonerror/i.test(html.replace(/<symbol[\s\S]*?<\/symbol>/g, '')), bad)
      const css = styleOf(html)
      for (const needle of ['alert', 'evil.example', 'onerror']) assert.ok(!css.includes(needle), `${needle} reached the CSS (${bad})`)
      const benign = page(validate({ ...raw, name: 'Name', tagline: 'Tag', blocks: [{ type: 'heading', text: 'H' }, { type: 'link', kind: 'custom', url: 'https://example.com/', label: 'L' }, { type: 'text', text: 'T' }], branches: [{ name: 'B', address: 'A', maps: 'https://maps.app.goo.gl/x', hours: 'H' }] }, BIG, 'inj-test').client)
      assert.equal(css, styleOf(benign), `user text changed the <style> (${bad})`)
    }
  })
}

test('inject: file names with quotes, parens, spaces, semicolons, braces, backslashes, percent, unicode or newlines never validate as bg/logo/cover', () => {
  const evil = ["a'b.png", 'a"b.png', 'a(b).png', 'a)b.png', 'a b.png', 'a;b.png', 'a}b.png', 'a\\b.png', 'a%22.png', 'é.png', 'a\n.png', 'a/b.png', '../a.png', 'a.png ', '.png', 'a<b>.png', 'a,b.png', 'a#b.png', 'a?b.png', 'a:b.png']
  for (const f of evil) {
    for (const field of ['logo', 'cover']) {
      const r = validate({ slug: 'inj-test', name: 'x', look: 'plain', theme: THEME, [field]: f, blocks: [{ type: 'link', kind: 'website', url: 'https://example.com' }] }, [f], 'inj-test')
      assert.equal(r.ok, false, `${field} accepted ${JSON.stringify(f)}`)
    }
    const img = validate({ slug: 'inj-test', name: 'x', look: 'plain', theme: THEME, background: { type: 'image', file: f }, blocks: [{ type: 'link', kind: 'website', url: 'https://example.com' }] }, [f], 'inj-test')
    assert.equal(img.ok, false, `image bg accepted ${JSON.stringify(f)}`)
    const vid = validate({ slug: 'inj-test', name: 'x', look: 'plain', theme: THEME, background: { type: 'video', file: f.replace(/\.png$/, '.mp4'), poster: f }, blocks: [{ type: 'link', kind: 'website', url: 'https://example.com' }] }, [f, f.replace(/\.png$/, '.mp4')], 'inj-test')
    assert.equal(vid.ok, false, `video bg accepted ${JSON.stringify(f)}`)
  }
})

test('inject: site base with CSS/HTML metacharacters is refused by validateSite (it lands unescaped in @font-face url())', () => {
  for (const base of ["/x')/", '/x)/', '/a b/', '/x"/', '/x;}/', '/x\\/', '/<x>/', '/x\n/']) {
    const r = validateSite({ ...SITE, base })
    assert.equal(r.ok, false, `accepted base ${JSON.stringify(base)}`)
  }
})

test('inject: a gradient stop that is not a plain hex never validates (only hex or bg/ink/accent can reach the <style>)', () => {
  for (const bad of ['#fff;}</style><script>', 'red', '#12345', '#1234567', 'expression(1)', 'var(--x)', '#ggg', '#fff url(x)', '\u0023fff\u2028']) {
    const r = validate({ slug: 'inj-test', name: 'x', look: 'plain', theme: THEME, background: { type: 'gradient', stops: ['bg', bad] }, blocks: [{ type: 'link', kind: 'website', url: 'https://example.com' }] }, [], 'inj-test')
    assert.equal(r.ok, false, JSON.stringify(bad))
  }
})

test('css: every dim 0..80 renders as a clean decimal opacity (at most 2 decimals), never 0.14500000000000002 or exponent form', () => {
  for (let dim = 0; dim <= 80; dim++) {
    const c = validate({ slug: 'dim-test', name: 'x', look: 'plain', theme: THEME, background: { type: 'image', file: 'photo.png', dim }, blocks: [{ type: 'link', kind: 'website', url: 'https://example.com' }] }, BIG, 'dim-test').client
    const m = /\.kb::after\{[^}]*opacity:([^;}]*)/.exec(styleOf(page(c)))
    assert.ok(m, `dim ${dim}: no opacity`)
    assert.match(m[1], /^(0|1|0\.\d{1,2})$/, `dim ${dim} -> ${m[1]}`)
    assert.ok(Math.abs(Number(m[1]) - dim / 100) < 1e-9, `dim ${dim} -> ${m[1]}`)
  }
})

test('css: focus, blur and angle corner values render exactly (0, 100, 359, blur 0 omits the filter, blur 1 keeps it)', () => {
  const mk = (background) => validate({ slug: 'dim-test', name: 'x', look: 'plain', theme: THEME, background, blocks: [{ type: 'link', kind: 'website', url: 'https://example.com' }] }, BIG, 'dim-test').client
  let css = styleOf(page(mk({ type: 'image', file: 'photo.png', focus: [0, 100], blur: 0 })))
  assert.ok(css.includes('object-position:0% 100%'))
  assert.ok(!css.includes('filter:blur'))
  css = styleOf(page(mk({ type: 'image', file: 'photo.png', blur: 1 })))
  assert.ok(css.includes('.kb-m{filter:blur(1px);transform:scale(1.12)}'))
  css = styleOf(page(mk({ type: 'gradient', stops: ['bg', 'ink'], angle: 359 })))
  assert.ok(css.includes('linear-gradient(359deg,var(--bg),var(--ink))'))
  css = styleOf(page(mk({ type: 'gradient', stops: ['bg', '#ABC', 'accent'], shape: 'radial' })))
  assert.ok(css.includes('radial-gradient(130% 90% at 50% 0%,var(--bg),#aabbcc,var(--accent))'), css.slice(-200))
  assert.ok(!/radial-gradient\([^)]*deg/.test(css))
})

test('css: braces and quotes balance in the whole <style> for every look x background x each style value', () => {
  const bgs = [{ type: 'color' }, { type: 'gradient', stops: ['bg', 'accent', '#abcdef'], shape: 'radial' }, { type: 'gradient', stops: ['ink', 'bg'], angle: 45 }, { type: 'image', file: 'photo.png', blur: 24, dim: 0, focus: [0, 0] }, VIDEO(5)]
  for (const id of LOOK_IDS) for (const background of bgs) {
    const combos = [ALL, {}, ...STYLE_KEYS.flatMap((k) => Object.keys(STYLE[k]).map((v) => ({ [k]: v })))]
    for (const style of combos) {
      const res = validate({ slug: 'css-test', name: 'x', look: id, theme: THEME, logo: BIG[0], cover: BIG[1], background, style, blocks: [{ type: 'link', kind: 'website', url: 'https://example.com' }, { type: 'link', kind: 'phone', url: 'tel:+639171234567' }] }, BIG, 'css-test')
      assert.equal(res.ok, true, res.errors.join())
      const css = styleOf(page(res.client)).replace(/\/\*[\s\S]*?\*\//g, '')
      let depth = 0
      for (const ch of css) { if (ch === '{') depth++; if (ch === '}') depth--; assert.ok(depth >= 0, `${id}/${background.type}/${JSON.stringify(style)}: stray }`) }
      assert.equal(depth, 0, `${id}/${background.type}/${JSON.stringify(style)}: unbalanced`)
      assert.equal((css.match(/"/g) || []).length % 2, 0, `${id}: odd quotes`)
      assert.equal((css.match(/\(/g) || []).length, (css.match(/\)/g) || []).length, `${id}/${background.type}/${JSON.stringify(style)}: parens`)
      assert.ok(!/;;|\{;/.test(css), `${id}: empty declaration`)
    }
  }
})

test('css: the :root block holds each non-null style key exactly once, in STYLE_KEYS order, on every look (look defaults never duplicate a declaration the client set)', () => {
  for (const id of LOOK_IDS) {
    const res = validate({ slug: 'css-test', name: 'x', look: id, theme: THEME, style: { buttonShape: 'square', shadow: 'hard' }, blocks: [{ type: 'link', kind: 'website', url: 'https://example.com' }] }, BIG, 'css-test')
    const root = (styleOf(page(res.client)).match(/:root\{[^}]*\}/) || [''])[0]
    assert.equal((root.match(/--btn-r:/g) || []).length, 1, `${id}: --btn-r duplicated in ${root}`)
    assert.ok(root.includes('--btn-r:0'), id)
    assert.equal((root.match(/--btn-shadow:/g) || []).length, 1, id)
    assert.ok(root.includes('--btn-shadow:4px 4px 0 var(--ink)'), id)
  }
})

test('css: glass over video: no backdrop blur anywhere in :root and tint raised to 72%; glass over image keeps blur(12px)', () => {
  for (const id of LOOK_IDS) {
    const mk = (background) => validate({ slug: 'css-test', name: 'x', look: id, theme: THEME, background, style: { buttonFill: 'glass' }, blocks: [{ type: 'link', kind: 'website', url: 'https://example.com' }] }, BIG, 'css-test').client
    const v = (styleOf(page(mk(VIDEO(5)))).match(/:root\{[^}]*\}/) || [''])[0]
    assert.ok(!v.includes('blur('), `${id}: ${v}`)
    assert.ok(v.includes('--btn-blur:none'), id)
    assert.ok(v.includes('var(--bg) 72%') && !v.includes('var(--bg) 60%'), id)
    const i = (styleOf(page(mk({ type: 'image', file: 'photo.png' }))).match(/:root\{[^}]*\}/) || [''])[0]
    assert.ok(i.includes('blur(12px) saturate(1.3)') && i.includes('var(--bg) 60%'), id)
  }
})

test('markup: exactly one backdrop, as the first child of <body>, with no <script, on every look and type; none for colour', () => {
  for (const id of LOOK_IDS) for (const background of [{ type: 'color' }, { type: 'gradient', stops: ['bg', 'ink'] }, { type: 'image', file: 'photo.png' }, VIDEO(5)]) {
    const res = validate({ slug: 'css-test', name: 'x', look: id, theme: THEME, background, blocks: [{ type: 'link', kind: 'website', url: 'https://example.com' }] }, BIG, 'css-test')
    const html = page(res.client)
    const n = (html.match(/class="kb"/g) || []).length
    assert.equal(n, background.type === 'color' ? 0 : 1, `${id}/${background.type}`)
    if (n) assert.ok(html.includes('<body><div class="kb" aria-hidden="true">'))
    assert.equal(html.startsWith('<!doctype html><html lang="en" data-bg='), n === 1)
    assert.equal((html.match(/<video/g) || []).length, background.type === 'video' ? 1 : 0)
    assert.ok(!/<script/i.test(html))
  }
})

test('markup: video poster appears in both <img> and <video poster>, the .mp4 is only inside <source>, and og:image is the poster never the mp4', () => {
  const res = validate({ slug: 'css-test', name: 'x', look: 'plain', theme: THEME, background: VIDEO(5), blocks: [{ type: 'link', kind: 'website', url: 'https://example.com' }] }, BIG, 'css-test')
  const html = page(res.client, SITE_SUBPATH)
  assert.equal((html.match(/ppppp\.jpg/g) || []).length, 3)
  assert.equal((html.match(/vvvvv\.mp4/g) || []).length, 1)
  assert.match(html, /<source src="\/khybrio-tap\/css-test\/vvvvv\.mp4" type="video\/mp4" media="\(prefers-reduced-motion: no-preference\)">/)
  assert.match(html, /<meta property="og:image" content="https:\/\/bored-six\.github\.io\/khybrio-tap\/css-test\/ppppp\.jpg">/)
})

/* ================================================================ 7. build */

let dir
const fontsFx = () => ({
  fraunces: { family: 'Fraunces', fallback: 'serif', group: 'serif', body: true, headingWeight: 600, files: [{ file: 'f.woff2', weight: '100 900', style: 'normal', path: join(dir, 'f.woff2') }] },
  inter: { family: 'Inter', fallback: 'sans-serif', group: 'sans', body: true, headingWeight: 700, files: [{ file: 'i.woff2', weight: '400', style: 'normal', path: join(dir, 'i.woff2') }] },
})
const exists = (p) => access(p).then(() => true, () => false)
const MIB = 1024 * 1024
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'khybrio-breakbuild-'))
  await writeFile(join(dir, 'f.woff2'), 'F')
  await writeFile(join(dir, 'i.woff2'), 'I')
  await mkdir(join(dir, 'clients'))
})
afterEach(async () => {
  delete process.env.KHYBRIO_ALLOW_MISSING_MP4
  await rm(dir, { recursive: true, force: true })
})
async function addClient(slug, extra, files = {}) {
  const d = join(dir, 'clients', slug)
  await mkdir(d, { recursive: true })
  const data = { slug, name: slug, look: 'plain', theme: THEME, blocks: [{ type: 'link', kind: 'website', url: 'https://example.com' }], ...extra }
  await writeFile(join(d, 'client.js'), `export default ${JSON.stringify(data)}\n`)
  for (const [n, b] of Object.entries(files)) await writeFile(join(d, n), b)
  // build.js cache-busts the client.js import with Date.now() alone, so a rewrite inside the same millisecond is served stale
  await new Promise((r) => setTimeout(r, 5))
}
const run = (opts = {}) => build({ root: dir, outDir: join(dir, 'dist'), site: SITE, looks, fonts: fontsFx(), ...opts })
const VID = { type: 'video', file: 'clip.mp4', poster: 'poster.jpg' }
const mp4Of = (total) => Buffer.concat([ftyp(), moov(['avc1']), mdat(total - ftyp().length - moov().length - 8)])

test('build: a video background with no poster key is refused on background.poster', async () => {
  await addClient('vid', { background: { type: 'video', file: 'clip.mp4' } }, { 'clip.mp4': mp4() })
  await assert.rejects(run(), /background\.poster: required for a video background/)
})

test('build: a video background whose poster file is missing is refused, even with the CI skip on', async () => {
  await addClient('vid', { background: VID }, { 'clip.mp4': mp4() })
  await assert.rejects(run(), /background\.poster: file "poster\.jpg" not found/)
  await assert.rejects(run({ allowMissingVideos: true }), /background\.poster: file "poster\.jpg" not found/)
  process.env.KHYBRIO_ALLOW_MISSING_MP4 = '1'
  await assert.rejects(run({ allowMissingVideos: undefined }), /background\.poster: file "poster\.jpg" not found/)
})

test('build: an mp4 of exactly 15 MiB builds; one byte over is refused on background.file', async () => {
  await addClient('vid', { background: VID }, { 'clip.mp4': mp4Of(15 * MIB), 'poster.jpg': 'P' })
  const r = await run()
  assert.deepEqual(r.pages, ['vid'])
  assert.ok(await exists(join(dir, 'dist', 'vid', 'clip.mp4')))
  await addClient('vid', { background: VID }, { 'clip.mp4': Buffer.concat([mp4Of(15 * MIB), Buffer.alloc(1)]), 'poster.jpg': 'P' })
  await assert.rejects(run(), /background\.file: File is over 15 MB/)
})

test('build: the over-cap video is refused even when the CI skip is on (skip is only for ABSENT files)', async () => {
  await addClient('vid', { background: VID }, { 'clip.mp4': Buffer.concat([mp4Of(15 * MIB), Buffer.alloc(1)]), 'poster.jpg': 'P' })
  await assert.rejects(run({ allowMissingVideos: true }), /background\.file: File is over 15 MB/)
})

test('build: zero-byte, HEVC and JPEG-in-.mp4 files are refused on background.file, with the CI skip on too', async () => {
  for (const [bytes, msg] of [[Buffer.alloc(0), /not a valid MP4 file/], [mp4({ codecs: ['hvc1'] }), /HEVC/], [Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]), /not an MP4 file/]]) {
    await addClient('vid', { background: VID }, { 'clip.mp4': bytes, 'poster.jpg': 'P' })
    await assert.rejects(run(), msg)
    await assert.rejects(run({ allowMissingVideos: true }), msg)
  }
})

test('build: CI skip (option and env var) lets an ABSENT mp4 through with a warning, page still renders, mp4 not copied, poster still copied', async () => {
  await addClient('vid', { background: VID }, { 'poster.jpg': 'P' })
  await assert.rejects(run(), /background\.file: file "clip\.mp4" not found/)
  for (const set of [() => run({ allowMissingVideos: true }), () => { process.env.KHYBRIO_ALLOW_MISSING_MP4 = '1'; return run({ allowMissingVideos: undefined }) }]) {
    const r = await set()
    assert.deepEqual(r.pages, ['vid'])
    assert.ok(r.warnings.vid.some((w) => w.includes('clip.mp4')), JSON.stringify(r.warnings))
    assert.ok(!(await exists(join(dir, 'dist', 'vid', 'clip.mp4'))))
    assert.ok(await exists(join(dir, 'dist', 'vid', 'poster.jpg')))
    assert.ok((await readFile(join(dir, 'dist', 'vid', 'index.html'), 'utf8')).includes('clip.mp4'))
  }
})

test('build: the env var is only honoured when it is exactly "1"', async () => {
  await addClient('vid', { background: VID }, { 'poster.jpg': 'P' })
  for (const v of ['0', 'true', '', 'yes']) {
    process.env.KHYBRIO_ALLOW_MISSING_MP4 = v
    await assert.rejects(run({ allowMissingVideos: undefined }), /clip\.mp4/, `env=${JSON.stringify(v)}`)
  }
})

test('build: the CI skip never forgives a missing IMAGE background, logo or cover', async () => {
  await addClient('img', { background: { type: 'image', file: 'photo.png' } })
  await assert.rejects(run({ allowMissingVideos: true }), /background\.file: file "photo\.png" not found/)
  await addClient('img', { logo: 'logo.png' })
  await assert.rejects(run({ allowMissingVideos: true }), /logo: file "logo\.png" not found/)
  await addClient('img', { cover: 'cover.jpg' })
  await assert.rejects(run({ allowMissingVideos: true }), /cover: file "cover\.jpg" not found/)
})

test('build: the CI skip with a video background AND a missing logo still fails on the logo', async () => {
  await addClient('vid', { background: VID, logo: 'logo.png' }, { 'poster.jpg': 'P' })
  await assert.rejects(run({ allowMissingVideos: true }), /logo: file "logo\.png" not found/)
})

test('build: the CI skip does not bypass name rules (upper case, path, wrong extension) for an absent mp4', async () => {
  for (const file of ['CLIP.MP4', '../clip.mp4', 'a/b.mp4', 'clip.mov', '.mp4', 'clip.mp4 ']) {
    await addClient('vid', { background: { type: 'video', file, poster: 'poster.jpg' } }, { 'poster.jpg': 'P' })
    await assert.rejects(run({ allowMissingVideos: true }), /background\.file/, file)
  }
})

test('build: unreferenced mp4/poster/image files and a colour background never get copied', async () => {
  await addClient('vid', { background: { type: 'color' } }, { 'old-12345678.mp4': mp4(), 'old-12345678-poster.jpg': 'P', 'photo.png': 'P' })
  await run()
  assert.deepEqual((await readdir(join(dir, 'dist', 'vid'))).sort(), ['index.html'])
})

test('build: a video poster shared with the logo is copied once without error; video + image siblings keep their own bytes', async () => {
  await addClient('vid', { background: VID, logo: 'poster.jpg' }, { 'clip.mp4': mp4(), 'poster.jpg': 'POSTER-BYTES' })
  await run()
  assert.equal(await readFile(join(dir, 'dist', 'vid', 'poster.jpg'), 'utf8'), 'POSTER-BYTES')
  assert.deepEqual(await readFile(join(dir, 'dist', 'vid', 'clip.mp4')), mp4())
})

test('build: a client with a refused video does not leave a half-built dist or tmp dir behind', async () => {
  await addClient('good', {})
  await addClient('vid', { background: VID }, { 'clip.mp4': mp4({ codecs: ['hvc1'] }), 'poster.jpg': 'P' })
  await assert.rejects(run())
  assert.ok(!(await exists(join(dir, 'dist'))))
  assert.deepEqual((await readdir(dir)).filter((f) => f.startsWith('dist')), [])
})

test('build: the mp4 is inspected in a real build of a non-faststart file (ok, just a slow-start file, not an error)', async () => {
  await addClient('vid', { background: VID }, { 'clip.mp4': mp4({ faststart: false }), 'poster.jpg': 'P' })
  const r = await run()
  assert.deepEqual(r.pages, ['vid'])
})
