// Adversarial: validateClient, migrateRaw, LIMITS boundaries, hostile strings in every look (spec sections 1, 3, 4, 7).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateClient, LIMITS } from '../src/validate.js'
import { migrateRaw } from '../src/migrate.js'
import { looks } from '../src/looks/index.js'
import { fonts } from '../src/fonts.js'
import { renderPage } from '../src/render.js'
import { KINDS } from '../src/kinds.js'
import { SITE_SUBPATH } from './helpers.js'

const FOLDER = 'brk-test'
const OPTS = { folder: FOLDER, looks: Object.keys(looks), fonts: Object.keys(fonts), bodyFonts: Object.keys(fonts).filter((f) => fonts[f].body), files: ['logo.svg', 'cover.jpg'] }
const base = (o = {}) => ({ slug: FOLDER, name: 'Brk', look: 'card', theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#f2c14e' }, blocks: [{ type: 'link', kind: 'website', url: 'https://e.co' }], ...o })
const V = (o, opts = {}) => validateClient(base(o), { ...OPTS, ...opts })
const blk = (...b) => V({ blocks: b })
const link = (i = 0) => ({ type: 'link', kind: 'website', url: `https://e.co/${i}` })
const bad = (res, prefix) => {
  assert.equal(res.ok, false, 'expected failure')
  assert.ok(res.errors.some((e) => e.startsWith(prefix)), `want "${prefix}" in ${JSON.stringify(res.errors)}`)
}
const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o) } return o }

// ---- LIMITS: exactly at and one over ----
test('LIMITS values are the spec numbers', () => {
  assert.deepEqual(LIMITS, { blocks: 30, links: 20, videos: 3, socials: 2, socialItems: 8, heading: 60, text: 280, label: 40, branches: 6, branchName: 40, branchAddress: 80, branchHours: 40 })
})
test('blocks: 30 ok, 31 error, 0 error', () => {
  assert.equal(V({ blocks: Array.from({ length: 30 }, (_, i) => (i < 20 ? link(i) : { type: 'heading', text: 'h' })) }).ok, true)
  bad(V({ blocks: Array.from({ length: 31 }, (_, i) => ({ type: 'heading', text: `h${i}` })) }), 'blocks')
  bad(V({ blocks: [] }), 'blocks')
})
test('link blocks: 20 ok, 21 error; videos 3 ok, 4 error; socials blocks 2 ok, 3 error', () => {
  const links = (n) => Array.from({ length: n }, (_, i) => link(i))
  assert.equal(blk(...links(20)).ok, true)
  bad(blk(...links(21)), 'blocks')
  const vid = { type: 'video', url: 'https://youtu.be/dQw4w9WgXcQ' }
  assert.equal(blk(link(), vid, vid, vid).ok, true)
  bad(blk(link(), vid, vid, vid, vid), 'blocks')
  const soc = { type: 'socials', items: [{ kind: 'facebook', url: 'https://f.co/x' }] }
  assert.equal(blk(soc, soc).ok, true)
  bad(blk(soc, soc, soc), 'blocks')
})
test('socials items: 8 ok, 9 and 0 error with blocks[i].items path', () => {
  const it = { kind: 'facebook', url: 'https://f.co/x' }
  assert.equal(blk({ type: 'socials', items: Array(8).fill(it) }).ok, true)
  bad(blk(link(), { type: 'socials', items: Array(9).fill(it) }), 'blocks[1].items')
  bad(blk({ type: 'socials', items: [] }), 'blocks[0].items')
})
test('heading: 60 ok, 61 error; trimmed before counting; inner newline error; whitespace-only error', () => {
  assert.equal(blk(link(), { type: 'heading', text: 'x'.repeat(60) }).ok, true)
  assert.equal(blk(link(), { type: 'heading', text: `  ${'x'.repeat(60)}  ` }).ok, true)
  bad(blk(link(), { type: 'heading', text: 'x'.repeat(61) }), 'blocks[1].text')
  bad(blk(link(), { type: 'heading', text: 'a\nb' }), 'blocks[1].text')
  bad(blk(link(), { type: 'heading', text: 'a\r\nb' }), 'blocks[1].text')
  bad(blk(link(), { type: 'heading', text: '   ' }), 'blocks[1].text')
  bad(blk(link(), { type: 'heading', text: '' }), 'blocks[1].text')
  assert.equal(blk(link(), { type: 'heading', text: '  hi  ' }).client.blocks[1].text, 'hi')
})
test('text: 280 ok, 281 error; counted after \\r\\n -> \\n; 4 newlines ok, 5 error; trailing newlines trimmed first', () => {
  const t = (text) => blk(link(), { type: 'text', text })
  assert.equal(t('x'.repeat(280)).ok, true)
  bad(t('x'.repeat(281)), 'blocks[1].text')
  assert.equal(t('a\nb\nc\nd\ne').ok, true)
  bad(t('a\nb\nc\nd\ne\nf'), 'blocks[1].text')
  const crlf = t('a\r\nb\r\nc\r\nd\r\ne')
  assert.equal(crlf.ok, true, JSON.stringify(crlf.errors))
  assert.equal(crlf.client.blocks[1].text, 'a\nb\nc\nd\ne')
  bad(t('a\r\nb\r\nc\r\nd\r\ne\r\nf'), 'blocks[1].text')
  assert.equal(t('a\n\n\n\n\n\n\n').client?.blocks[1].text, 'a', 'trailing newlines trimmed, not counted')
  assert.equal(t('a\n\n\n\n\nb').ok, false, '5 interior newlines')
  // 280 chars where every line break is CRLF in the raw input (raw length > 280, normalized length == 280)
  const body = `${'x'.repeat(137)}\r\n${'y'.repeat(140)}`
  assert.equal(body.replace(/\r\n/g, '\n').length, 278)
  assert.equal(t(`${'x'.repeat(139)}\r\n${'y'.repeat(140)}`).ok, true, 'normalized length 280')
  bad(t(`${'x'.repeat(140)}\r\n${'y'.repeat(140)}`), 'blocks[1].text')
  assert.equal(t('<b>&amp; <script>').ok, true, '< and & are allowed')
  bad(t('   \n  '), 'blocks[1].text')
})
test('custom link label: 40 ok, 41 error, whitespace-only error, required for custom', () => {
  const c = (label) => blk({ type: 'link', kind: 'custom', url: 'https://e.co', ...(label === undefined ? {} : { label }) })
  assert.equal(c('x'.repeat(40)).ok, true)
  bad(c('x'.repeat(41)), 'blocks[0].label')
  bad(c('   '), 'blocks[0].label')
  bad(c(''), 'blocks[0].label')
  bad(c(undefined), 'blocks[0].label')
  bad(c(5), 'blocks[0].label')
  bad(blk({ type: 'link', kind: 'website', url: 'https://e.co', label: 'x'.repeat(41) }), 'blocks[0].label')
})
test('name 60 ok / 61 error, tagline 120 ok / 121 error, branches LIMITS.branches ok / +1 error, slug 2 and 40', () => {
  assert.equal(V({ name: 'n'.repeat(60) }).ok, true)
  bad(V({ name: 'n'.repeat(61) }), 'name')
  assert.equal(V({ tagline: 't'.repeat(120) }).ok, true)
  bad(V({ tagline: 't'.repeat(121) }), 'tagline')
  const br = (n) => Array.from({ length: n }, (_, i) => ({ name: `b${i}` }))
  assert.equal(V({ branches: br(LIMITS.branches) }).ok, true)
  bad(V({ branches: br(LIMITS.branches + 1) }), 'branches')
  const one = (f, n) => V({ branches: [{ name: 'b', [f]: 'x'.repeat(n) }] })
  for (const [f, k] of [['name', 'branchName'], ['address', 'branchAddress'], ['hours', 'branchHours']]) {
    assert.equal(one(f, LIMITS[k]).ok, true, f)
    bad(one(f, LIMITS[k] + 1), `branches[0].${f}`)
  }
  for (const s of ['ab', 'a'.repeat(40)]) assert.equal(V({ slug: s }, { folder: s }).ok, true, s)
  for (const s of ['a', 'a'.repeat(41)]) bad(V({ slug: s }, { folder: s }), 'slug')
})
test('reserved slugs all rejected; slug must equal folder', () => {
  for (const s of ['assets', 'fonts', '404', 'index', 'api', 'media']) bad(V({ slug: s }, { folder: s }), 'slug')
  bad(V({ slug: 'other-name' }), 'slug')
})

// ---- hostile keys ----
test('__proto__ / constructor / prototype keys anywhere are unknown-key errors, never pollute', () => {
  const j = JSON.parse
  const cases = [
    j('{"__proto__":{"polluted":1},"slug":"brk-test"}'),
    { ...base(), ...j('{"__proto__":{"polluted":1}}') },
    base({ blocks: [{ ...link(), ...j('{"__proto__":{"polluted":1}}') }] }),
    base({ blocks: [link(), { type: 'socials', items: [j('{"kind":"facebook","url":"https://f.co","__proto__":{"polluted":1}}')] }] }),
    base({ font: j('{"__proto__":{"polluted":1}}') }),
    base({ theme: { ...base().theme, ...j('{"__proto__":{"polluted":1}}') } }),
    base({ constructor: { prototype: { polluted: 1 } } }),
    base({ blocks: [{ type: 'link', kind: 'constructor', url: 'https://e.co' }] }),
    base({ blocks: [{ type: 'link', kind: '__proto__', url: 'https://e.co' }] }),
    base({ blocks: [{ type: 'link', kind: 'toString', url: 'https://e.co' }] }),
    base({ blocks: [{ type: 'constructor' }] }),
    base({ blocks: [{ type: '__proto__' }] }),
    base({ look: '__proto__' }), base({ look: 'constructor' }),
    base({ font: { heading: 'constructor' } }), base({ font: { body: '__proto__' } }),
    base({ blocks: [link(), { type: 'socials', items: [{ kind: 'constructor', url: 'https://x.co' }] }] }),
  ]
  for (const raw of cases) {
    const res = validateClient(raw, OPTS)
    assert.equal(({}).polluted, undefined)
    assert.equal(Object.prototype.polluted, undefined)
    assert.equal(typeof res.ok, 'boolean')
    if (res.ok) assert.ok(!Object.keys(res.client).includes('__proto__'), 'ok client with own __proto__')
  }
  assert.equal(validateClient(cases[0], OPTS).ok, false)
  assert.equal(validateClient(cases[2], OPTS).ok, false)
  for (const i of [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) assert.equal(validateClient(cases[i], OPTS).ok, false, `case ${i}`)
})

test('migrateRaw: __proto__ in links entries and top level do not pollute', () => {
  const raw = JSON.parse('{"__proto__":{"polluted":1},"links":[{"kind":"website","url":"https://e.co","__proto__":{"polluted":2}}]}')
  const out = migrateRaw(raw)
  assert.equal(({}).polluted, undefined)
  assert.equal(Object.getPrototypeOf(out), Object.prototype)
})

// ---- wrong types everywhere: never throw ----
const WEIRD = [undefined, null, 0, -1, 1.5, NaN, Infinity, true, false, '', ' ', 'x', [], [1], [[]], {}, { a: 1 }, () => 1, Symbol.iterator, 10n, new Date(0), /x/]
test('every top-level field with every weird type: no throw, ok boolean, errors strings, warnings array', () => {
  for (const key of ['slug', 'name', 'tagline', 'look', 'theme', 'font', 'logo', 'cover', 'blocks', 'branches', 'credit']) {
    for (const w of WEIRD) {
      const raw = base({ [key]: w })
      let res
      assert.doesNotThrow(() => { res = validateClient(raw, OPTS) }, `${key}=${String(w)}`)
      assert.equal(typeof res.ok, 'boolean')
      assert.ok(Array.isArray(res.warnings) && Array.isArray(res.errors))
      assert.ok(res.errors.every((e) => typeof e === 'string'))
      if (res.ok) assert.ok(res.client && typeof res.client.name === 'string' && Array.isArray(res.client.blocks), `${key}=${String(w)} ok but malformed client`)
      else assert.equal(res.client, null)
    }
  }
})
test('every block field with every weird type: no throw', () => {
  const shapes = [
    (w) => ({ type: 'link', kind: w, url: 'https://e.co' }), (w) => ({ type: 'link', kind: 'website', url: w }), (w) => ({ type: 'link', kind: 'custom', url: 'https://e.co', label: w }),
    (w) => ({ type: 'heading', text: w }), (w) => ({ type: 'text', text: w }), (w) => ({ type: 'video', url: w }), (w) => ({ type: 'socials', items: w }),
    (w) => ({ type: 'socials', items: [w] }), (w) => ({ type: 'socials', items: [{ kind: w, url: 'https://f.co' }] }), (w) => ({ type: 'socials', items: [{ kind: 'facebook', url: w }] }), (w) => ({ type: w }), (w) => w,
  ]
  for (const sh of shapes) for (const w of WEIRD) {
    let res
    assert.doesNotThrow(() => { res = validateClient(base({ blocks: [link(), sh(w)] }), OPTS) }, `${sh.toString()} ${String(w)}`)
    assert.equal(typeof res.ok, 'boolean')
  }
})
test('branches fields with weird types: no throw', () => {
  for (const f of ['name', 'address', 'maps', 'hours']) for (const w of WEIRD) {
    assert.doesNotThrow(() => validateClient(base({ branches: [{ name: 'b', [f]: w }] }), OPTS), `${f}=${String(w)}`)
  }
  for (const w of WEIRD) assert.doesNotThrow(() => validateClient(base({ branches: [w] }), OPTS))
})
test('validateClient on non-object input never throws', () => {
  for (const w of WEIRD) assert.doesNotThrow(() => validateClient(w, OPTS))
  assert.doesNotThrow(() => validateClient(base(), undefined))
  assert.doesNotThrow(() => validateClient(base(), {}))
})
test('boolean-ish credit strings, numeric names and numeric text are rejected, not coerced', () => {
  bad(V({ credit: 'false' }), 'credit')
  bad(V({ credit: 0 }), 'credit')
  bad(V({ name: 123 }), 'name')
  bad(blk(link(), { type: 'text', text: 123 }), 'blocks[1].text')
  bad(blk(link(), { type: 'heading', text: ['a'] }), 'blocks[1].text')
})

// ---- URL schemes ----
test('every kind rejects a javascript:/data: url; viber and phone are scheme-locked', () => {
  for (const kind of Object.keys(KINDS)) {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'JaVaScRiPt:alert(1)', 'vbscript:x', 'file:///etc/passwd']) {
      const b = { type: 'link', kind, url, ...(kind === 'custom' ? { label: 'x' } : {}) }
      assert.equal(blk(b).ok, false, `${kind} ${url}`)
    }
  }
  bad(blk({ type: 'link', kind: 'viber', url: 'https://viber.com/x' }), 'blocks[0].url')
  bad(blk({ type: 'link', kind: 'phone', url: 'https://e.co' }), 'blocks[0].url')
  bad(blk({ type: 'link', kind: 'website', url: 'tel:+63917' }), 'blocks[0].url')
  bad(blk({ type: 'link', kind: 'website', url: 'http://e.co' }), 'blocks[0].url')
  bad(blk({ type: 'link', kind: 'website', url: 'https://e.co/a b' }), 'blocks[0].url')
  bad(blk({ type: 'link', kind: 'website', url: 'https://e.co/\n' }), 'blocks[0].url')
  bad(blk({ type: 'link', kind: 'website', url: 'https://' }), 'blocks[0].url')
  assert.equal(blk({ type: 'link', kind: 'viber', url: 'viber://chat?number=%2B639171234567' }).ok, true)
})
test('socials reject every non-social kind and report the item path', () => {
  for (const kind of Object.keys(KINDS).filter((k) => !KINDS[k].social)) {
    bad(blk(link(), { type: 'socials', items: [{ kind, url: 'https://e.co' }] }), 'blocks[1].items[0].kind')
  }
})
test('unknown keys: in a block, in a socials item, top-level, font', () => {
  bad(blk({ ...link(), extra: 1 }), 'blocks[0].extra: unknown key')
  bad(blk({ type: 'heading', text: 'h', url: 'x' }), 'blocks[0].url: unknown key')
  bad(blk(link(), { type: 'socials', items: [{ kind: 'facebook', url: 'https://f.co', label: 'hack' }] }), 'blocks[1].items[0].label')
  bad(V({ links: [] }), 'links')
  bad(V({ font: { weight: 'bold' } }), 'font.weight: unknown key')
})
test('primary lands on the first link block only, even after non-link blocks; zero links is valid', () => {
  const r = blk({ type: 'heading', text: 'h' }, { type: 'socials', items: [{ kind: 'facebook', url: 'https://f.co' }] }, link(1), link(2))
  assert.deepEqual(r.client.blocks.map((b) => b.primary), [undefined, undefined, true, false])
  assert.equal(blk({ type: 'heading', text: 'h' }).ok, true)
})
test('a client passing "primary: true" or other forged normalized fields on a block is an unknown key', () => {
  bad(blk({ ...link(), primary: true }), 'blocks[0].primary: unknown key')
  bad(blk(link(), { type: 'video', url: 'https://youtu.be/dQw4w9WgXcQ', src: 'https://evil/' }), 'blocks[1].src: unknown key')
})
test('video block: src comes from the id, not from the url', () => {
  const r = blk(link(), { type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=%22onload%3D' })
  assert.equal(r.client.blocks[1].src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  bad(blk(link(), { type: 'video', url: 'https://vm.tiktok.com/abc/' }), 'blocks[1].url: short TikTok link')
  bad(blk(link(), { type: 'video', url: 'https://evil.com/watch?v=dQw4w9WgXcQ' }), 'blocks[1].url: must be a YouTube or TikTok video link')
})
test('files: logo/cover traversal and extensions', () => {
  for (const f of ['../logo.svg', 'a/b.svg', '..\\x.png', 'logo.svg.exe', 'logo', '.svg', '.hidden.png', 'LOGO.SVG', 'missing.png', '', 5, [], 'logo.svg\n']) {
    assert.equal(V({ logo: f }).ok, false, JSON.stringify(f))
  }
  assert.equal(V({ logo: 'logo.svg', cover: 'cover.jpg' }).ok, true)
})
test('theme: odd colour strings are errors, never throws; contrast warnings stay warnings', () => {
  for (const c of ['red', '#12', '#12345', '#1234567', 'rgb(0,0,0)', '#ggg', 'url(x)', '#fff;}</style><script>', 5, null]) {
    const r = V({ theme: { bg: c, ink: '#000', accent: '#f00' } })
    assert.equal(r.ok, false, String(c))
  }
  const pale = V({ theme: { bg: '#ffffff', ink: '#eeeeee', accent: '#fefefe' } })
  assert.equal(pale.ok, true)
  assert.ok(pale.warnings.length >= 2)
  for (const w of pale.warnings) assert.match(w, /^theme\.(ink|accent): .*\d+\.\d\d:1/)
})
test('3-digit hex normalises and onAccent/contrast still computed', () => {
  const r = V({ theme: { bg: '#fff', ink: '#000', accent: '#0a0' } })
  assert.equal(r.ok, true, r.errors.join())
  assert.match(r.client.theme.bg, /^#[0-9a-f]{6}$/)
})

// ---- migrate ----
const clone = (o) => structuredClone(o)
test('migrate: never mutates input (deep-frozen), idempotent, on many shapes', () => {
  const shapes = [
    { links: [{ kind: 'menu', url: 'https://e.co' }, { kind: 'custom', url: 'https://e.co', label: 'L', extra: 1, type: 'heading', primary: true }] },
    { links: [] }, { links: [null, 'x', 5, [], { kind: 'menu' }] }, { links: [{ kind: 'menu', url: 'https://e.co' }], blocks: [link()] }, { links: {}, blocks: undefined },
    { links: [{ kind: 'menu', url: 'u' }], blocks: null },
    { font: { display: 'fraunces' } }, { font: { body: 'inter' } }, { font: { display: 'syne', body: 'inter' } }, { font: { display: 'a', heading: 'b' } }, { font: { display: 'a', tagline: 'b' } },
    { font: {} }, { font: null }, { font: 'x' }, { font: [] }, { font: { display: null } }, { font: { display: undefined, body: undefined } }, { font: { display: 'x', extra: 1 } },
    { links: [{ kind: 'menu', url: 'u' }], font: { display: 'syne' } }, { blocks: [link()] }, {},
  ]
  for (const s of shapes) {
    const before = clone(s)
    const input = deepFreeze(clone(s))
    let once
    assert.doesNotThrow(() => { once = migrateRaw(input) }, JSON.stringify(s))
    assert.deepEqual(input, before)
    assert.deepEqual(migrateRaw(once), once, `idempotent: ${JSON.stringify(s)}`)
  }
})
test('migrate: non-objects come back as-is', () => {
  for (const v of [null, undefined, 5, 'x', true, [], [1], NaN]) assert.ok(Object.is(migrateRaw(v), v) || (Number.isNaN(v) && Number.isNaN(migrateRaw(v))))
})
test('migrate: spec table, extra v1 keys dropped (including a forged type), label kept only when defined', () => {
  const out = migrateRaw({ slug: 'x', links: [{ kind: 'custom', url: 'u', label: 'L', type: 'heading', primary: true, junk: 1 }, { kind: 'menu', url: 'u2' }] })
  assert.deepEqual(out.blocks, [{ type: 'link', kind: 'custom', url: 'u', label: 'L' }, { type: 'link', kind: 'menu', url: 'u2' }])
  assert.ok(!('label' in out.blocks[1]))
  assert.ok(!('links' in out))
  assert.equal(out.slug, 'x')
})
test('migrate: font table', () => {
  assert.deepEqual(migrateRaw({ font: { display: 'syne' } }).font, { heading: 'syne', tagline: 'inter', body: 'inter' })
  assert.deepEqual(migrateRaw({ font: { body: 'lora' } }).font, { heading: 'fraunces', tagline: 'lora', body: 'lora' })
  assert.deepEqual(migrateRaw({ font: { display: 'syne', body: 'lora' } }).font, { heading: 'syne', tagline: 'lora', body: 'lora' })
  const both = { font: { display: 'syne', heading: 'anton' } }
  assert.deepEqual(migrateRaw(both), both, 'display next to heading is left alone')
})
test('migrate: error paths after migration keep the links index', () => {
  const r = validateClient({ ...base(), blocks: undefined, links: [{ kind: 'website', url: 'https://e.co' }, { kind: 'website', url: 'javascript:1' }, null] }, OPTS)
  bad(r, 'blocks[1].url')
  assert.ok(r.errors.some((e) => e.startsWith('blocks[2]')))
})
test('migrate: both links and blocks gives "links: v1 key, use blocks"; display next to heading gives its error', () => {
  bad(V({ links: [{ kind: 'website', url: 'https://e.co' }] }), 'links: v1 key, use blocks')
  bad(V({ font: { display: 'syne', heading: 'anton' } }), 'font.display: v1 key, use font.heading')
})
test('v1 link with a non-string kind/url (number, null) migrates to a clean error, not a throw', () => {
  const r = validateClient({ ...base(), blocks: undefined, links: [{ kind: 5, url: null }, { kind: {}, url: [] }] }, OPTS)
  assert.equal(r.ok, false)
})

// ---- hostile strings through every look ----
const MARK = '<zzmark onclick=zzx()>'
const BREAK = '"><zzmark>\'" zzattr="1'
const SHORT = '"><zzmark>\'"zzattr="1'
function hostileClient(lookId) {
  const res = validateClient(
    base({
      look: lookId,
      name: `${SHORT}</style>`,
      tagline: `${MARK}${BREAK}</title>`,
      logo: 'logo.svg', cover: 'cover.jpg',
      blocks: [
        { type: 'heading', text: SHORT },
        { type: 'link', kind: 'website', url: 'https://e.co/"><zzmark>?a=1&b=2&c=\'', label: SHORT },
        { type: 'link', kind: 'custom', url: 'https://e.co/x', label: SHORT },
        { type: 'text', text: `${MARK}\r\n${BREAK}\n&amp; &lt;zzmark&gt; \\" \\' ${'x'.repeat(40)}` },
        { type: 'socials', items: [{ kind: 'facebook', url: 'https://f.co/"><zzmark>' }, { kind: 'phone', url: 'tel:+63917"><zzmark>' }, { kind: 'email', url: 'mailto:a@b.co?subject="><zzmark>' }] },
        { type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&x="><zzmark>' },
      ],
      branches: [{ name: `${MARK}${BREAK}`.slice(0, LIMITS.branchName), address: `${MARK}${BREAK}`.slice(0, LIMITS.branchAddress), hours: `${MARK}${BREAK}`.slice(0, LIMITS.branchHours), maps: 'https://maps.co/"><zzmark>' }],
    }),
    OPTS,
  )
  return res
}
for (const lookId of Object.keys(looks)) {
  test(`look "${lookId}": hostile strings everywhere leave no raw tag, no attribute breakout, no handler`, () => {
    const res = hostileClient(lookId)
    assert.equal(res.ok, true, res.errors.join('\n'))
    const html = renderPage(res.client, SITE_SUBPATH, { looks, fonts })
    const style = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || ''
    assert.ok(!/zzmark|zzattr|zzx/.test(style), 'client text reached the stylesheet')
    const body = html.replace(/<style[\s\S]*?<\/style>/g, '')
    assert.ok(!/<zzmark/i.test(body), 'raw <zzmark> element')
    assert.ok(!/"\s*zzattr=/.test(body), 'attribute breakout with zzattr')
    assert.ok(!/<script/i.test(html))
    assert.equal((html.match(/<\/style>/g) || []).length, 1, 'client text closed the style element')
    assert.equal((html.match(/<title>/g) || []).length, 1)
    assert.equal((html.match(/<\/title>/g) || []).length, 1)
    // every tag in the document has only attributes whose names are plain
    for (const m of body.matchAll(/<([a-zA-Z][^\s>/]*)([^>]*)>/g)) {
      for (const a of m[2].matchAll(/\s([^\s=>"'/]+)(?:="[^"]*")?/g)) assert.ok(!/^on/i.test(a[1]) && !/^zz/.test(a[1]), `<${m[1]}> has attr ${a[1]}`)
    }
  })
  test(`look "${lookId}": text block with \\r\\n renders <br>, no stray \\r`, () => {
    const res = V({ look: lookId, blocks: [link(), { type: 'text', text: 'one\r\ntwo\r\nthree' }] })
    const html = renderPage(res.client, SITE_SUBPATH, { looks, fonts })
    const p = html.match(/<p[^>]*data-block="text"[^>]*>([\s\S]*?)<\/p>/)[1]
    assert.equal(p.replace(/<br>/g, '|'), 'one|two|three')
    assert.ok(!/\r/.test(html))
  })
}
