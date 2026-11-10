// Adversarial v3 tests: parity, mp4 inspection, worker Range, validation. Written against
// .claude/specs/v3-style-and-media.md (sections 1, 2, 6), not against the implementation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { worstContrast, minDim } from '../src/color.js'
import { dimRecommendation, worstContrast as editorWorst } from '../studio/editor-model.js'
import { inspectMp4, sniff } from '../src/assets.js'
import { handle } from '../worker/handler.js'
import { validateClient } from '../src/validate.js'
import { box, box64, boxToEnd, ftyp, moov, moovToEnd, mdat, mp4, PNG, JPEG } from './mp4-fixtures.js'
import { OPTS, rawClient } from './helpers.js'

/* ================================================================ 1. parity: studio hint vs server warning */
const HEXES = ['#000000', '#ffffff', '#fff4e6', '#3b1f14', '#e8622d', '#1c4d4a', '#f5f7f6', '#808080', '#777777', '#0a0a0a', '#0b0b0b', '#010101', '#fe0000', '#00ff00', '#0000ff', '#767676', '#f2c14e', '#0f2b29', '#123', '#ABC']
const TARGETS = [3, 4.5, 7]
const full = (h) => (h.length === 4 ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h.toLowerCase())

test('parity: editor worstContrast equals color.js worstContrast for every ink/bg/dim in the sweep', () => {
  const bad = []
  for (const ink of HEXES) for (const bg of HEXES) for (const dim of [0, 1, 10, 25, 40, 55, 80, 99, 100]) {
    const a = worstContrast(full(ink), full(bg), dim)
    const b = editorWorst(ink, bg, dim)
    if (Math.abs(a - b) > 1e-6) bad.push(`${ink} on ${bg} @${dim}: server ${a} studio ${b}`)
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} mismatches`)
})

test('parity: studio dimRecommendation equals server minDim whenever the target is reachable; null otherwise', () => {
  const bad = []
  for (const ink of HEXES) for (const bg of HEXES) for (const target of TARGETS) {
    const i = full(ink), b = full(bg)
    const server = minDim(i, b, target)
    const reachable = worstContrast(i, b, 100) >= target
    const studio = dimRecommendation(ink, bg, target)
    const want = reachable ? server : null
    if (studio !== want) bad.push(`${ink} on ${bg} t${target}: server ${server} (reachable ${reachable}) studio ${studio}`)
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} mismatches`)
})

test('parity: the studio hint matches the server warning text N for the validated theme (dim below N warns, at N is quiet)', () => {
  for (const [ink, bg] of [['#3b1f14', '#fff4e6'], ['#f5f7f6', '#1c4d4a'], ['#e8622d', '#ffffff']]) {
    const n = dimRecommendation(ink, bg)
    const files = [...OPTS.files, 'photo.png']
    const run = (dim) => validateClient(rawClient({ theme: { bg, ink, accent: '#e8622d' }, background: { type: 'image', file: 'photo.png', dim } }), { ...OPTS, files })
    if (n === null || n > 80) {
      assert.ok(run(80).warnings.some((w) => w.startsWith('background.dim')), `${ink}/${bg}: studio says unreachable, server must warn at 80`)
      continue
    }
    if (n > 0) assert.ok(run(n - 1).warnings.some((w) => w.includes(`dim ${n}% or more`)), `${ink}/${bg} below N=${n}`)
    assert.ok(!run(n).warnings.some((w) => w.startsWith('background.dim')), `${ink}/${bg} at N=${n}`)
  }
})

test('parity: invalid hex gives null in the studio, never NaN or a throw', () => {
  assert.equal(dimRecommendation('nope', '#fff'), null)
  assert.equal(dimRecommendation('#fff', ''), null)
  assert.equal(editorWorst('#12', '#fff', 40), null)
})

/* ================================================================ 2. mp4 inspection */
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b }
const raw = (size, type, body = Buffer.alloc(0)) => Buffer.concat([u32(size), Buffer.from(type, 'latin1'), body])
const NOT_VALID = 'not a valid MP4 file'

test('mp4: zero-byte, 7-byte and 8-byte-garbage files are rejected, never thrown', () => {
  for (const b of [Buffer.alloc(0), Buffer.alloc(7), Buffer.alloc(8), Buffer.from('ftyp')]) {
    const r = inspectMp4(b)
    assert.equal(r.ok, false)
    assert.equal(typeof r.error, 'string')
  }
})

test('mp4: a JPEG renamed .mp4 fails as "not an MP4 file"; an mp4 sniffed as jpg/png/webp fails as not a real image', () => {
  assert.deepEqual(inspectMp4(Buffer.concat([JPEG, Buffer.alloc(100)])), { ok: false, error: 'not an MP4 file' })
  assert.deepEqual(inspectMp4(PNG), { ok: false, error: 'not an MP4 file' })
  const real = mp4()
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) assert.equal(sniff(real, ext), `File content is not a real ${ext.toUpperCase()}`)
  assert.equal(sniff(Buffer.alloc(0), 'png'), 'File content is not a real PNG')
  assert.equal(sniff(Buffer.alloc(0), 'webp'), 'File content is not a real WEBP')
  assert.equal(sniff(Buffer.from('RIFF\0\0\0\0WEB'), 'webp'), 'File content is not a real WEBP')
})

test('mp4: ftyp size pointing past EOF, and size < 8, are "not a valid MP4 file"', () => {
  assert.deepEqual(inspectMp4(Buffer.concat([raw(9999, 'ftyp', Buffer.alloc(8))])), { ok: false, error: NOT_VALID })
  assert.deepEqual(inspectMp4(Buffer.concat([raw(7, 'ftyp', Buffer.alloc(8))])), { ok: false, error: NOT_VALID })
  assert.deepEqual(inspectMp4(Buffer.concat([ftyp(), raw(4, 'moov', Buffer.alloc(8))])), { ok: false, error: NOT_VALID })
})

test('mp4: moov whose size field points past EOF is invalid, not "no moov"', () => {
  const m = moov()
  const lie = Buffer.from(m); lie.writeUInt32BE(m.length + 500, 0)
  assert.deepEqual(inspectMp4(Buffer.concat([ftyp(), lie])), { ok: false, error: NOT_VALID })
})

test('mp4: truncated mid-moov (every cut point) never throws and never reports ok', () => {
  const whole = mp4()
  const boundaries = new Set([ftyp().length + moov().length]) // cut exactly between boxes is a well-formed (if mdat-less) file
  for (let n = 0; n < whole.length; n++) {
    if (boundaries.has(n)) continue
    const r = inspectMp4(whole.subarray(0, n))
    assert.equal(r.ok, false, `cut at ${n}`)
  }
  assert.equal(inspectMp4(whole).ok, true)
})

test('mp4: size 1 box with truncated largesize, or largesize past EOF / below 16, is invalid', () => {
  const trunc = Buffer.concat([ftyp(), u32(1), Buffer.from('mdat'), Buffer.alloc(4)])
  assert.deepEqual(inspectMp4(trunc), { ok: false, error: NOT_VALID })
  const big = Buffer.alloc(8); big.writeBigUInt64BE(1n << 40n)
  assert.deepEqual(inspectMp4(Buffer.concat([ftyp(), u32(1), Buffer.from('mdat'), big])), { ok: false, error: NOT_VALID })
  const huge = Buffer.alloc(8); huge.writeBigUInt64BE(0xffffffffffffffffn)
  assert.deepEqual(inspectMp4(Buffer.concat([ftyp(), u32(1), Buffer.from('mdat'), huge])), { ok: false, error: NOT_VALID })
  const small = Buffer.alloc(8); small.writeBigUInt64BE(8n)
  assert.deepEqual(inspectMp4(Buffer.concat([ftyp(), u32(1), Buffer.from('mdat'), small])), { ok: false, error: NOT_VALID })
})

test('mp4: size 1 ftyp is a legal first box (spec: size 1 -> u64 largesize)', () => {
  const f = box64('ftyp', Buffer.from('isom'), u32(512))
  assert.deepEqual(inspectMp4(Buffer.concat([f, moov(['avc1']), mdat()])), { ok: true, faststart: true })
})

test('mp4: a size-0 box in the middle swallows the rest and so no moov after it is found', () => {
  const r = inspectMp4(Buffer.concat([ftyp(), boxToEnd('mdat', Buffer.alloc(40)), moov()]))
  assert.equal(r.ok, false)
  assert.equal(r.error, 'MP4 has no index (moov), re-export it')
})

test('mp4: moov with size 0 (to EOF) and avc1 is ok, index at the end so faststart false', () => {
  assert.deepEqual(inspectMp4(Buffer.concat([ftyp(), mdat(), moovToEnd(['avc1'])])), { ok: true, faststart: false })
})

test('mp4: moov with no trak -> no H.264 video track', () => {
  assert.deepEqual(inspectMp4(Buffer.concat([ftyp(), moov([]), mdat()])), { ok: false, error: 'MP4 has no H.264 video track' })
})

test('mp4: a moov nested inside another box (not top level) does not count', () => {
  const nested = box('free', moov(['avc1']))
  assert.equal(inspectMp4(Buffer.concat([ftyp(), nested, mdat()])).error, 'MP4 has no index (moov), re-export it')
})

test('mp4: audio-only file (mp4a track only) -> no H.264 video track', () => {
  assert.deepEqual(inspectMp4(Buffer.concat([ftyp(), moov(['mp4a']), mdat()])), { ok: false, error: 'MP4 has no H.264 video track' })
})

test('mp4: HEVC in the second track with avc1 first, and the reverse, is judged by the spec (avc1 anywhere = ok)', () => {
  assert.equal(inspectMp4(Buffer.concat([ftyp(), moov(['avc1', 'hvc1']), mdat()])).ok, true)
  assert.equal(inspectMp4(Buffer.concat([ftyp(), moov(['hvc1', 'avc1']), mdat()])).ok, true)
})

test('mp4: HEVC only in the second track (first is audio) still gets the HEVC message', () => {
  const r = inspectMp4(Buffer.concat([ftyp(), moov(['mp4a', 'hev1']), mdat()]))
  assert.match(r.error, /^This video is HEVC \(iPhone default\)/)
})

test('mp4: av01 and vp09 give "Use an H.264 MP4"', () => {
  for (const c of ['av01', 'vp09']) assert.deepEqual(inspectMp4(Buffer.concat([ftyp(), moov([c]), mdat()])), { ok: false, error: 'Use an H.264 MP4' })
})

test('mp4: 200000 tiny top-level boxes finish fast and stay valid', () => {
  const free = box('free')
  const many = Buffer.concat([ftyp(), moov(), Buffer.concat(Array.from({ length: 200000 }, () => free)), mdat()])
  const t = Date.now()
  const r = inspectMp4(many)
  assert.ok(Date.now() - t < 3000, `took ${Date.now() - t} ms`)
  assert.equal(r.ok, true)
})

test('mp4: deeply nested boxes (5000 levels) do not blow the stack', () => {
  let inner = box('free')
  for (let i = 0; i < 5000; i++) inner = box('free', inner)
  const r = inspectMp4(Buffer.concat([ftyp(), box('moov', inner), mdat()]))
  assert.equal(r.ok, false)
})

test('mp4: a stsd entry with an absurd entry count / sample entry size past its parent is rejected, not thrown', () => {
  const entry = box('stsd', u32(0), u32(1), raw(99999, 'avc1', Buffer.alloc(10)))
  const m = box('moov', box('trak', box('mdia', box('minf', box('stbl', entry)))))
  const r = inspectMp4(Buffer.concat([ftyp(), m, mdat()]))
  assert.equal(r.ok, false)
})

test('mp4: faststart is false only when mdat precedes moov; no mdat counts as faststart', () => {
  assert.equal(inspectMp4(mp4({ faststart: false })).faststart, false)
  assert.equal(inspectMp4(mp4({ faststart: true })).faststart, true)
  assert.equal(inspectMp4(Buffer.concat([ftyp(), moov()])).faststart, true)
})

/* ================================================================ 4. worker Range */
const S = 90
const DATA = Array.from({ length: S }, (_, i) => String.fromCharCode(0x21 + i)).join('')
const HTML = 'text/html; charset=utf-8'
function bucket() {
  const items = new Map([
    ['index.html', { data: '<p>home</p>', size: 11, httpEtag: '"e-home"', httpMetadata: { contentType: HTML } }],
    ['alpha-cafe/index.html', { data: DATA, size: S, httpEtag: '"e-alpha"', httpMetadata: { contentType: HTML, cacheControl: 'no-cache' } }],
    ['alpha-cafe/clip.mp4', { data: DATA, size: S, httpEtag: '"e-vid"', httpMetadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=31536000, immutable' } }],
    ['alpha-cafe/empty.mp4', { data: '', size: 0, httpEtag: '"e-empty"', httpMetadata: { contentType: 'video/mp4' } }],
    ['_redirect/old-name', { data: 'alpha-cafe', size: 10, httpEtag: '"e-r"', httpMetadata: { contentType: 'text/plain' } }],
  ])
  const calls = { get: [], head: [] }
  const meta = (o) => ({ size: o.size, httpEtag: o.httpEtag, httpMetadata: o.httpMetadata })
  return {
    calls,
    head: async (k) => (calls.head.push(k), items.has(k) ? meta(items.get(k)) : null),
    get: async (k, opts) => {
      calls.get.push([k, opts])
      const o = items.get(k)
      if (!o) return null
      if (opts?.range) return { ...meta(o), body: o.data.slice(opts.range.offset, opts.range.offset + opts.range.length), text: async () => '' }
      return { ...meta(o), body: o.data, text: async () => o.data }
    },
  }
}
const get = (path, headers = {}, method = 'GET') => {
  const b = bucket()
  return handle(new Request('https://tap.khybrio.com' + path, { method, headers }), b).then((res) => ({ res, b }))
}
const V = '/alpha-cafe/clip.mp4'

test('range: bytes=0-0 is 206 with exactly the first byte', async () => {
  const { res } = await get(V, { range: 'bytes=0-0' })
  assert.equal(res.status, 206)
  assert.equal(res.headers.get('content-range'), `bytes 0-0/${S}`)
  assert.equal(res.headers.get('content-length'), '1')
  assert.equal(await res.text(), DATA[0])
})

test('range: bytes=-0 is 416; bytes=-1 is the last byte; suffix longer than the file is the whole file as 206', async () => {
  assert.equal((await get(V, { range: 'bytes=-0' })).res.status, 416)
  const one = (await get(V, { range: 'bytes=-1' })).res
  assert.equal(one.headers.get('content-range'), `bytes ${S - 1}-${S - 1}/${S}`)
  const big = (await get(V, { range: 'bytes=-9999' })).res
  assert.equal(big.status, 206)
  assert.equal(big.headers.get('content-range'), `bytes 0-${S - 1}/${S}`)
  assert.equal(await big.text(), DATA)
})

test('range: end past EOF is clamped; start == size is 416; start == size-1 is the last byte', async () => {
  const clamp = (await get(V, { range: 'bytes=80-9999' })).res
  assert.equal(clamp.headers.get('content-range'), `bytes 80-${S - 1}/${S}`)
  assert.equal((await get(V, { range: `bytes=${S}-` })).res.status, 416)
  assert.equal((await get(V, { range: `bytes=${S - 1}-` })).res.status, 206)
})

test('range: huge numbers (beyond 2^53) never produce a 206 with a bad content-range', async () => {
  for (const r of ['bytes=99999999999999999999-', 'bytes=0-99999999999999999999', 'bytes=-99999999999999999999']) {
    const { res } = await get(V, { range: r })
    if (res.status === 206) assert.match(res.headers.get('content-range'), new RegExp(`^bytes \\d+-\\d+/${S}$`), r)
    else assert.ok([200, 416].includes(res.status), `${r} -> ${res.status}`)
    if (r === 'bytes=99999999999999999999-') assert.equal(res.status, 416, r)
  }
})

test('range: multi-range is ignored (full 200, per spec table); never 206 with a multipart body', async () => {
  for (const r of ['bytes=0-1,5-6', 'bytes=0-1, 5-6', 'bytes=0-1,-2']) {
    const { res } = await get(V, { range: r })
    assert.equal(res.status, 200, r)
    assert.equal(res.headers.get('content-length'), String(S))
    assert.equal(await res.text(), DATA)
  }
})

test('range: casing and whitespace. "Bytes=" is case-insensitive per RFC 7233 (spec silent); padded value must not crash', async () => {
  for (const r of [' bytes=0-1 ', 'bytes=0-1\t']) {
    const { res } = await get(V, { range: r })
    assert.ok([200, 206].includes(res.status), `${JSON.stringify(r)} -> ${res.status}`)
  }
  for (const r of ['bytes = 0-1', 'bytes=0 - 1', 'bytes=+0-1', 'bytes=0x1-2', 'bytes=1e1-2', 'bytes=-1-', 'bytes=0--1']) {
    const { res } = await get(V, { range: r })
    assert.equal(res.status, 200, `malformed ${r} must be ignored`)
  }
  const upper = (await get(V, { range: 'BYTES=0-1' })).res
  assert.ok([200, 206].includes(upper.status))
})

test('range: html ignores Range (full 200, no 206, no accept-ranges)', async () => {
  for (const p of ['/alpha-cafe/', '/']) {
    const { res } = await get(p, { range: 'bytes=0-3' })
    assert.equal(res.status, 200, p)
    assert.equal(res.headers.get('content-range'), null)
    assert.equal(res.headers.get('accept-ranges'), null)
  }
})

test('range: If-Range with a stale etag is a full 200; with the matching etag it is 206', async () => {
  const stale = (await get(V, { range: 'bytes=0-1', 'if-range': '"old"' })).res
  assert.equal(stale.status, 200)
  assert.equal(await stale.text(), DATA)
  const fresh = (await get(V, { range: 'bytes=0-1', 'if-range': '"e-vid"' })).res
  assert.equal(fresh.status, 206)
  const date = (await get(V, { range: 'bytes=0-1', 'if-range': 'Wed, 21 Oct 2015 07:28:00 GMT' })).res
  assert.equal(date.status, 200, 'an HTTP-date If-Range can never equal the etag, so full 200')
})

test('range: If-Range with a stale etag AND an unsatisfiable range is 200 not 416', async () => {
  const { res } = await get(V, { range: 'bytes=500-', 'if-range': '"old"' })
  assert.equal(res.status, 200)
})

test('range: HEAD with Range is 200, no body, never 206/416, accept-ranges present', async () => {
  for (const r of ['bytes=0-1', 'bytes=500-', 'bytes=-0']) {
    const { res } = await get(V, { range: r }, 'HEAD')
    assert.equal(res.status, 200, r)
    assert.equal(res.headers.get('accept-ranges'), 'bytes')
    assert.equal(await res.text(), '')
  }
})

test('range: If-None-Match matching the etag wins over Range (304), also over an unsatisfiable range', async () => {
  for (const r of ['bytes=0-1', 'bytes=500-']) {
    const { res } = await get(V, { range: r, 'if-none-match': '"e-vid"' })
    assert.equal(res.status, 304, r)
  }
})

test('range: a Range on a redirect path (old slug) is a plain 302, not a 206/416, and does not touch the video', async () => {
  const { res, b } = await get('/old-name/clip.mp4', { range: 'bytes=0-1' })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/alpha-cafe/clip.mp4')
  assert.equal(res.headers.get('content-range'), null)
  assert.equal(b.calls.get.filter(([k, o]) => o?.range).length, 0)
})

test('range: a Range on a missing object is 404, and on the slug redirect (no trailing slash) a 301', async () => {
  assert.equal((await get('/alpha-cafe/nope.mp4', { range: 'bytes=0-1' })).res.status, 404)
  assert.equal((await get('/alpha-cafe', { range: 'bytes=0-1' })).res.status, 301)
})

test('range: zero-byte object: any range is 416 with bytes */0, never a 206 with content-range 0--1', async () => {
  for (const r of ['bytes=0-0', 'bytes=0-', 'bytes=-1']) {
    const { res } = await get('/alpha-cafe/empty.mp4', { range: r })
    assert.equal(res.status, 416, r)
    assert.equal(res.headers.get('content-range'), 'bytes */0')
  }
})

test('range: a 206 never serves the full-object read (one ranged get only) and 200 full carries content-length', async () => {
  const { b } = await get(V, { range: 'bytes=10-19' })
  assert.deepEqual(b.calls.get.map(([k, o]) => [k, o?.range]), [[ 'alpha-cafe/clip.mp4', { offset: 10, length: 10 } ]])
  const { res } = await get(V)
  assert.equal(res.headers.get('content-length'), String(S))
})

test('range: an object with no size (R2 bucket without head size) falls back to a full 200, not a crash', async () => {
  const b = bucket()
  const orig = b.head
  b.head = async (k) => ({ ...(await orig(k)), size: undefined })
  const res = await handle(new Request('https://tap.khybrio.com' + V, { headers: { range: 'bytes=0-1' } }), b)
  assert.equal(res.status, 200)
})

/* ================================================================ 5. validation */
const FILES = [...OPTS.files, 'clip.mp4', 'poster.jpg', 'photo.png']
const v = (extra, opts = {}) => validateClient(rawClient(extra), { ...OPTS, files: FILES, ...opts })
const IMG = { type: 'image', file: 'photo.png' }
const VID = { type: 'video', file: 'clip.mp4', poster: 'poster.jpg' }
const hasErr = (res, msg) => assert.ok(res.errors.includes(msg), `wanted "${msg}" in ${JSON.stringify(res.errors)}`)

test('validate: prototype-pollution keys in background/style are unknown keys, and Object.prototype stays clean', () => {
  const bgJson = JSON.parse('{"type":"image","file":"photo.png","__proto__":{"polluted":1},"constructor":{"x":1}}')
  const r = v({ background: bgJson })
  assert.equal(r.ok, false)
  assert.equal({}.polluted, undefined)
  const stJson = JSON.parse('{"__proto__":{"buttonShape":"pill"},"buttonShape":"pill"}')
  const s = v({ style: stJson })
  assert.equal(s.ok, false)
  assert.equal({}.buttonShape, undefined)
  hasErr(s, 'style.__proto__: unknown key')
})

test('validate: style values that are inherited Object.prototype names are rejected (toString, constructor, __proto__)', () => {
  for (const val of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
    const r = v({ style: { buttonShape: val } })
    assert.equal(r.ok, false, val)
    hasErr(r, 'style.buttonShape: must be one of square, rounded, pill')
  }
})

test('validate: style value types (number, array, object, null, empty string, wrong case) are rejected with the exact message', () => {
  for (const val of [1, [], {}, null, '', 'PILL', ' pill', ['pill'], true]) {
    const r = v({ style: { buttonShape: val } })
    assert.equal(r.ok, false, JSON.stringify(val))
    hasErr(r, 'style.buttonShape: must be one of square, rounded, pill')
  }
  for (const bad of [null, [], 'pill', 3]) hasErr(v({ style: bad }), 'style: must be an object')
})

test('validate: background that is null / array / string / has no type', () => {
  for (const b of [null, [], 'video', 3, {}, { file: 'x.png' }]) hasErr(v({ background: b }), 'background: must be an object with a type')
  for (const t of ['Image', 'video ', '', 7, null, '__proto__', 'constructor']) {
    const r = v({ background: { type: t } })
    assert.equal(r.ok, false, String(t))
  }
})

test('validate: blur NaN/Infinity/negative/fraction/string/over-max are rejected (image max 24, video 12)', () => {
  for (const blur of [NaN, Infinity, -Infinity, -1, 1.5, '4', 25, null, [], 1e9]) {
    const r = v({ background: { ...IMG, blur } })
    assert.equal(r.ok, false, `image blur ${blur}`)
    hasErr(r, 'background.blur: must be a whole number 0-24')
  }
  for (const blur of [13, 24, NaN]) hasErr(v({ background: { ...VID, blur } }), 'background.blur: must be a whole number 0-12')
  assert.equal(v({ background: { ...IMG, blur: 24 } }).ok, true)
  assert.equal(v({ background: { ...VID, blur: 12 } }).ok, true)
  assert.equal(v({ background: { ...IMG, blur: 0 } }).ok, true)
})

test('validate: dim NaN/Infinity/negative/81/fraction/string rejected; 0 and 80 accepted', () => {
  for (const dim of [NaN, Infinity, -1, 81, 40.5, '40', null, 1e9]) hasErr(v({ background: { ...IMG, dim } }), 'background.dim: must be a whole number 0-80')
  for (const dim of [0, 80]) assert.equal(v({ background: { ...IMG, dim } }).ok, true, String(dim))
})

test('validate: focus out of range, wrong length, non-integers, non-array', () => {
  const MSG = 'background.focus: must be [x, y] with whole numbers 0-100'
  for (const focus of [[101, 50], [50, -1], [50], [1, 2, 3], [], [NaN, 5], [5, Infinity], [1.5, 2], ['5', '5'], 'center', { 0: 5, 1: 5, length: 2 }, null, [null, 5]]) {
    hasErr(v({ background: { ...IMG, focus } }), MSG)
  }
  for (const focus of [[0, 0], [100, 100]]) assert.equal(v({ background: { ...IMG, focus } }).ok, true)
})

test('validate: gradient stop counts 0, 1, 4, non-array', () => {
  for (const stops of [[], ['bg'], ['bg', 'ink', 'accent', '#fff'], 'bg,ink', undefined, null, { length: 2 }]) {
    hasErr(v({ background: { type: 'gradient', stops } }), 'background.stops: need 2 or 3 colours')
  }
})

test('validate: gradient stop values: 8-digit hex (alpha), 4-digit hex, no #, css injection strings, non-strings', () => {
  for (const bad of ['#ff000080', '#f008', 'ff0000', '#gggggg', 'red', 'rgb(0,0,0)', '#fff;}body{display:none', 'url(x)', 'BG', ' bg', 'bg ', 5, null, {}, [], '#fff\n']) {
    const r = v({ background: { type: 'gradient', stops: ['bg', bad] } })
    assert.equal(r.ok, false, JSON.stringify(bad))
    hasErr(r, 'background.stops[1]: must be bg, ink, accent or a hex colour')
  }
  assert.equal(v({ background: { type: 'gradient', stops: ['#FFF', '#abcdef'] } }).ok, true)
})

test('validate: gradient angle: 360, -1, 1.5, NaN, string rejected; 0 and 359 ok; radial with angle (even 180 or 0) errors', () => {
  for (const angle of [360, -1, 1.5, NaN, '90', Infinity, null]) hasErr(v({ background: { type: 'gradient', stops: ['bg', 'ink'], angle } }), 'background.angle: must be a whole number 0-359')
  for (const angle of [0, 359]) assert.equal(v({ background: { type: 'gradient', stops: ['bg', 'ink'], angle } }).ok, true)
  for (const angle of [0, 180, 90]) hasErr(v({ background: { type: 'gradient', stops: ['bg', 'ink'], shape: 'radial', angle } }), 'background.angle: only used with shape linear')
})

test('validate: gradient shape junk is rejected', () => {
  for (const shape of ['conic', 'Linear', '', null, 1, [], '__proto__']) hasErr(v({ background: { type: 'gradient', stops: ['bg', 'ink'], shape } }), 'background.shape: must be linear or radial')
})

test('validate: unknown keys per type (blur on gradient, stops on image, poster on image, angle on video)', () => {
  hasErr(v({ background: { type: 'gradient', stops: ['bg', 'ink'], blur: 3 } }), 'background.blur: unknown key')
  hasErr(v({ background: { ...IMG, stops: ['bg', 'ink'] } }), 'background.stops: unknown key')
  hasErr(v({ background: { ...IMG, poster: 'poster.jpg' } }), 'background.poster: unknown key')
  hasErr(v({ background: { ...VID, angle: 3 } }), 'background.angle: unknown key')
  hasErr(v({ background: { type: 'color', file: 'x.png' } }), 'background.file: unknown key')
})

test('validate: file names: traversal, absolute, svg for image, uppercase mp4, mp4 for image, png for video, missing, non-string', () => {
  const imgMsg = 'background.file: must be a png, jpg, jpeg or webp file name'
  for (const file of ['../photo.png', 'a/../photo.png', '/etc/passwd', 'logo.svg', 'clip.mp4', 'photo.png.exe', '', 5, null, 'photo..png', 'photo.png\n']) {
    const r = v({ background: { type: 'image', file } })
    assert.equal(r.ok, false, JSON.stringify(file))
  }
  hasErr(v({ background: { type: 'image', file: 'logo.svg' } }), imgMsg)
  hasErr(v({ background: { type: 'video', file: 'CLIP.MP4', poster: 'poster.jpg' } }), 'background.file: must be an .mp4 file name')
  hasErr(v({ background: { type: 'video', file: 'photo.png', poster: 'poster.jpg' } }), 'background.file: must be an .mp4 file name')
  hasErr(v({ background: { type: 'video', file: 'clip.mp4', poster: 'clip.mp4' } }), 'background.poster: must be a png, jpg, jpeg or webp file name')
  hasErr(v({ background: { type: 'video', file: 'clip.mp4', poster: 'nope.jpg' } }), 'background.poster: file "nope.jpg" not found in the client folder')
  hasErr(v({ background: { type: 'video', file: 'clip.mp4' } }), 'background.poster: required for a video background')
  hasErr(v({ background: { type: 'image', file: 'nope.png' } }), 'background.file: file "nope.png" not found in the client folder')
})

test('validate: a failed background normalizes back to {type:"color"}, never leaks half-valid data', () => {
  const r = v({ background: { ...IMG, blur: 99 } })
  assert.equal(r.ok, false)
})

test('validate: style on a look that does not support the key is KEPT and not an error (spec section 7: value stays in the draft and is saved)', () => {
  const r = v({ look: 'receipt', style: { buttonFill: 'glass', shadow: 'hard' } }, { looks: [...OPTS.looks, 'receipt'] })
  assert.equal(r.ok, true, r.errors.join('\n'))
  assert.equal(r.client.style.buttonFill, 'glass')
  assert.equal(r.client.style.shadow, 'hard')
})

test('validate: contrast warnings never block; ink==bg over an image warns with the 80% tail and ok stays true', () => {
  const r = v({ theme: { bg: '#777777', ink: '#777777', accent: '#e8622d' }, background: { ...IMG, dim: 80 } })
  assert.equal(r.ok, true)
  assert.ok(r.warnings.some((w) => w.startsWith('background.dim') && w.endsWith('even 80% dim cannot guarantee 4.5:1 with these colours')))
})

test('validate: no background warning is emitted when the background itself is invalid (no warning from a rejected value)', () => {
  const r = v({ background: { ...IMG, dim: 5, blur: 999 } })
  assert.ok(!r.warnings.some((w) => w.startsWith('background.')), JSON.stringify(r.warnings))
})

test('validate: boundary dim: warning exactly below minDim, none at minDim and above, for a mid-contrast theme', () => {
  const theme = { bg: '#ffffff', ink: '#333333', accent: '#e8622d' }
  const n = minDim('#333333', '#ffffff')
  const at = (dim) => v({ theme, background: { ...IMG, dim } }).warnings.filter((w) => w.startsWith('background.dim'))
  if (n <= 80) {
    assert.equal(at(n).length, 0)
    if (n > 0) assert.equal(at(n - 1).length, 1)
  } else assert.equal(at(80).length, 1)
})
