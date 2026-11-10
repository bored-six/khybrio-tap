// The Worker, written from section 9 of .claude/specs/mvp-showcase.md before the code existed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle } from '../worker/handler.js'

const HTML = 'text/html; charset=utf-8'
// v3 adds media-src 'self' (spec section 6). Directive order is not part of the contract, so compare as a set.
const CSP_DIRECTIVES = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self'",
  "media-src 'self'",
  "font-src 'self'",
  'frame-src https://www.youtube-nocookie.com https://www.tiktok.com',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].sort()
const cspSet = (h) => h.split(';').map((d) => d.trim()).filter(Boolean).sort()

function obj(body, contentType, cacheControl, etag) {
  return { body, text: async () => body, httpMetadata: { contentType, cacheControl }, httpEtag: etag }
}

function makeBucket() {
  const items = new Map([
    ['index.html', obj('<p>home</p>', HTML, 'no-cache', '"e-home"')],
    ['404.html', obj('<p>not found</p>', HTML, 'no-cache', '"e-404"')],
    ['alpha-cafe/index.html', obj('<p>alpha</p>', HTML, 'no-cache', '"e-alpha"')],
    ['alpha-cafe/logo.svg', obj('<svg/>', 'image/svg+xml', 'public, max-age=300', '"e-logo"')],
    ['fonts/f.woff2', obj('FONT', 'font/woff2', 'public, max-age=604800', '"e-font"')],
    ['_redirect/old-name', obj('alpha-cafe', 'text/plain', 'no-store', '"e-r1"')],
    ['a/b/c', obj('deep', 'text/plain', 'no-store', '"e-deep"')],
  ])
  const gets = []
  return { items, gets, get: async (key) => (gets.push(key), items.get(key) ?? null) }
}

const req = (path, init = {}) => new Request(`https://tap.test${path}`, init)
const run = (path, init, bucket = makeBucket()) => handle(req(path, init), bucket).then((res) => ({ res, bucket }))

test('anything but GET and HEAD is 405 with an allow header', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const { res } = await run('/alpha-cafe/', { method, body: method === 'DELETE' ? undefined : 'x' })
    assert.equal(res.status, 405, method)
    assert.equal(res.headers.get('allow'), 'GET, HEAD')
  }
})

test('/ serves index.html', async () => {
  const { res } = await run('/')
  assert.equal(res.status, 200)
  assert.equal(await res.text(), '<p>home</p>')
  assert.equal(res.headers.get('content-type'), HTML)
})

test('/{slug} is a 301 to /{slug}/', async () => {
  const { res } = await run('/alpha-cafe')
  assert.equal(res.status, 301)
  assert.equal(res.headers.get('location'), '/alpha-cafe/')
})

test('/{slug}/ serves the page with its metadata and etag', async () => {
  const { res } = await run('/alpha-cafe/')
  assert.equal(res.status, 200)
  assert.equal(await res.text(), '<p>alpha</p>')
  assert.equal(res.headers.get('content-type'), HTML)
  assert.equal(res.headers.get('cache-control'), 'no-cache')
  assert.equal(res.headers.get('etag'), '"e-alpha"')
})

test('a query string does not change what is served', async () => {
  const { res } = await run('/alpha-cafe/?utm_source=nfc')
  assert.equal(res.status, 200)
  assert.equal(await res.text(), '<p>alpha</p>')
})

test('/{slug}/{file} and /fonts/{file} serve the object with its own content type', async () => {
  const svg = (await run('/alpha-cafe/logo.svg')).res
  assert.equal(svg.status, 200)
  assert.equal(svg.headers.get('content-type'), 'image/svg+xml')
  assert.equal(svg.headers.get('cache-control'), 'public, max-age=300')
  assert.equal(await svg.text(), '<svg/>')
  const font = (await run('/fonts/f.woff2')).res
  assert.equal(font.status, 200)
  assert.equal(font.headers.get('content-type'), 'font/woff2')
  assert.equal(await font.text(), 'FONT')
})

test('If-None-Match equal to the etag is a 304 with no body', async () => {
  const { res } = await run('/alpha-cafe/logo.svg', { headers: { 'if-none-match': '"e-logo"' } })
  assert.equal(res.status, 304)
  assert.equal(await res.text(), '')
  const stale = (await run('/alpha-cafe/logo.svg', { headers: { 'if-none-match': '"other"' } })).res
  assert.equal(stale.status, 200)
})

test('HEAD returns the headers and no body', async () => {
  const { res } = await run('/alpha-cafe/', { method: 'HEAD' })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), HTML)
  assert.equal(await res.text(), '')
})

test('a miss on a redirected slug is a 302 (never 301) with no-store', async () => {
  const { res } = await run('/old-name/')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/alpha-cafe/')
  assert.equal(res.headers.get('cache-control'), 'no-store')
})

test('the redirect keeps the file part', async () => {
  const { res } = await run('/old-name/logo.svg')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/alpha-cafe/logo.svg')
  assert.equal(res.headers.get('cache-control'), 'no-store')
})

test('/old-name without the slash is the plain 301 first', async () => {
  const { res } = await run('/old-name')
  assert.equal(res.status, 301)
  assert.equal(res.headers.get('location'), '/old-name/')
})

test('a live object wins over a redirect record for the same slug', async () => {
  const bucket = makeBucket()
  bucket.items.set('_redirect/alpha-cafe', obj('somewhere-else', 'text/plain', 'no-store', '"x"'))
  const { res } = await run('/alpha-cafe/', undefined, bucket)
  assert.equal(res.status, 200)
  assert.equal(await res.text(), '<p>alpha</p>')
})

test('/_redirect/x is a 404 and the record is never read or leaked', async () => {
  const { res, bucket } = await run('/_redirect/old-name')
  assert.equal(res.status, 404)
  assert.equal(await res.text(), '<p>not found</p>')
  assert.ok(!bucket.gets.some((k) => k.startsWith('_redirect/')), `bucket.get(${bucket.gets})`)
})

test('segments starting with _ or ., encoded slashes, ".." and deeper paths are 404.html', async () => {
  for (const path of [
    '/.env',
    '/alpha-cafe/.hidden',
    '/_private/index.html',
    '/alpha-cafe/_x',
    '/alpha-cafe%2Findex.html',
    '/alpha-cafe/..%2findex.html',
    '/..%2f_redirect%2fold-name',
    '/alpha-cafe/%2e%2e%2findex.html',
    '/a/b/c',
    '/alpha-cafe/sub/logo.svg',
  ]) {
    const { res } = await run(path)
    assert.equal(res.status, 404, path)
    assert.equal(await res.text(), '<p>not found</p>', path)
    assert.equal(res.headers.get('content-type'), HTML, path)
  }
})

test('any other miss is the 404 page with status 404', async () => {
  for (const path of ['/nobody-here/', '/alpha-cafe/nope.png', '/fonts/nope.woff2']) {
    const { res } = await run(path)
    assert.equal(res.status, 404, path)
    assert.equal(await res.text(), '<p>not found</p>')
  }
})

test('a 404 still returns 404 when the bucket has no 404.html', async () => {
  const empty = { get: async () => null }
  const res = await handle(req('/nope/'), empty)
  assert.equal(res.status, 404)
})

test('HTML responses carry the CSP and security headers, including the 404 page', async () => {
  for (const path of ['/', '/alpha-cafe/', '/nobody-here/']) {
    const { res } = await run(path)
    assert.deepEqual(cspSet(res.headers.get('content-security-policy')), CSP_DIRECTIVES, path)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path)
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path)
  }
})

/* ================================================================ v3: media, Range, CSP (spec section 6) */
// A fake bucket with the v3 interface: get(key, { range }?) and head(key). Object shape follows R2: size, httpEtag, httpMetadata.
const DATA = Array.from({ length: 90 }, (_, i) => String.fromCharCode(0x21 + i)).join('') // 90 bytes, every offset distinct
const S = DATA.length
const VID = 'alpha-cafe/clip-0123abcd.mp4'
const VIDEO_TYPE = 'video/mp4'
const IMMUTABLE = 'public, max-age=31536000, immutable'

function mediaBucket() {
  const items = new Map([
    ['index.html', { data: '<p>home</p>', size: 11, httpEtag: '"e-home"', httpMetadata: { contentType: HTML, cacheControl: 'no-cache' } }],
    ['404.html', { data: '<p>nf</p>', size: 9, httpEtag: '"e-404"', httpMetadata: { contentType: HTML, cacheControl: 'no-cache' } }],
    ['alpha-cafe/index.html', { data: DATA, size: S, httpEtag: '"e-alpha"', httpMetadata: { contentType: HTML, cacheControl: 'no-cache' } }],
    [VID, { data: DATA, size: S, httpEtag: '"e-vid"', httpMetadata: { contentType: VIDEO_TYPE, cacheControl: IMMUTABLE } }],
  ])
  const calls = { get: [], head: [] }
  const meta = (o) => ({ size: o.size, httpEtag: o.httpEtag, httpMetadata: o.httpMetadata })
  return {
    calls,
    head: async (key) => (calls.head.push(key), items.has(key) ? meta(items.get(key)) : null),
    get: async (key, opts) => {
      calls.get.push([key, opts])
      const o = items.get(key)
      if (!o) return null
      if (opts?.range) return { ...meta(o), body: o.data.slice(opts.range.offset, opts.range.offset + opts.range.length) }
      return { ...meta(o), body: o.data, text: async () => o.data }
    },
  }
}
const vid = (headers = {}, method = 'GET', path = '/' + VID) => {
  const b = mediaBucket()
  return handle(req(path, { method, headers }), b).then((res) => ({ res, b }))
}

test('a full GET of an mp4 is 200 with accept-ranges and content-length, type and cache from the object', async () => {
  const { res } = await vid()
  assert.equal(res.status, 200)
  assert.equal(await res.text(), DATA)
  assert.equal(res.headers.get('accept-ranges'), 'bytes')
  assert.equal(res.headers.get('content-length'), String(S))
  assert.equal(res.headers.get('content-type'), VIDEO_TYPE)
  assert.equal(res.headers.get('cache-control'), IMMUTABLE)
  assert.equal(res.headers.get('etag'), '"e-vid"')
  assert.equal(res.headers.get('content-range'), null)
})

test('satisfiable ranges answer 206 with content-range, length, and the exact slice', async () => {
  const cases = [
    ['bytes=0-9', 0, 9],
    ['bytes=10-19', 10, 19],
    ['bytes=0-0', 0, 0],
    ['bytes=89-89', 89, 89],
    ['bytes=80-', 80, 89],
    ['bytes=0-', 0, 89],
    ['bytes=-10', 80, 89],
    ['bytes=-1', 89, 89],
    ['bytes=85-500', 85, 89], // end past the file is clamped
    ['bytes=-500', 0, 89], // suffix longer than the file is the whole file
  ]
  for (const [range, s, e] of cases) {
    const { res, b } = await vid({ range })
    assert.equal(res.status, 206, range)
    assert.equal(res.headers.get('content-range'), `bytes ${s}-${e}/${S}`, range)
    assert.equal(res.headers.get('content-length'), String(e - s + 1), range)
    assert.equal(res.headers.get('accept-ranges'), 'bytes', range)
    assert.equal(res.headers.get('content-type'), VIDEO_TYPE, range)
    assert.equal(res.headers.get('cache-control'), IMMUTABLE, range)
    assert.equal(res.headers.get('etag'), '"e-vid"', range)
    assert.equal(await res.text(), DATA.slice(s, e + 1), range)
    const ranged = b.calls.get.filter(([k, o]) => k === VID && o?.range)
    assert.deepEqual(ranged.map(([, o]) => o.range), [{ offset: s, length: e - s + 1 }], `${range}: body must come from one ranged get`)
    assert.ok(!b.calls.get.some(([k, o]) => k === VID && !o?.range), `${range}: no full-object read`)
  }
})

test('unsatisfiable ranges answer 416 with content-range */size and an empty body', async () => {
  for (const range of ['bytes=90-', 'bytes=90-99', 'bytes=200-300', 'bytes=5-2', 'bytes=-0']) {
    const { res } = await vid({ range })
    assert.equal(res.status, 416, range)
    assert.equal(res.headers.get('content-range'), `bytes */${S}`, range)
    assert.equal(await res.text(), '', range)
  }
})

test('malformed, multi-range and non-bytes Range headers are ignored: 200 full', async () => {
  for (const range of ['bytes=', 'bytes=abc', 'bytes=a-b', 'bytes=-', 'bytes=1-2-3', 'items=0-5', '0-5', 'bytes=0-1,5-6', 'bytes=0-1, 5-6']) {
    const { res } = await vid({ range })
    assert.equal(res.status, 200, range)
    assert.equal(await res.text(), DATA, range)
    assert.equal(res.headers.get('content-length'), String(S), range)
    assert.equal(res.headers.get('accept-ranges'), 'bytes', range)
    assert.equal(res.headers.get('content-range'), null, range)
  }
})

test('If-Range: the current etag keeps the range, anything else sends the full file', async () => {
  const keep = await vid({ range: 'bytes=0-9', 'if-range': '"e-vid"' })
  assert.equal(keep.res.status, 206)
  assert.equal(await keep.res.text(), DATA.slice(0, 10))
  for (const ifRange of ['"stale"', 'Wed, 21 Oct 2015 07:28:00 GMT', '"e-vid-2"']) {
    const { res } = await vid({ range: 'bytes=0-9', 'if-range': ifRange })
    assert.equal(res.status, 200, ifRange)
    assert.equal(await res.text(), DATA, ifRange)
    assert.equal(res.headers.get('content-length'), String(S), ifRange)
    assert.equal(res.headers.get('content-range'), null, ifRange)
  }
})

test('If-None-Match with the current etag is still 304, even with a Range', async () => {
  const plain = await vid({ 'if-none-match': '"e-vid"' })
  assert.equal(plain.res.status, 304)
  const ranged = await vid({ 'if-none-match': '"e-vid"', range: 'bytes=0-9' })
  assert.equal(ranged.res.status, 304)
  assert.equal(await ranged.res.text(), '')
  const stale = await vid({ 'if-none-match': '"old"', range: 'bytes=0-9' })
  assert.equal(stale.res.status, 206)
})

test('HEAD never returns 206 or a body, even with a Range', async () => {
  const { res } = await vid({ range: 'bytes=0-9' }, 'HEAD')
  assert.equal(res.status, 200)
  assert.equal(await res.text(), '')
  assert.equal(res.headers.get('content-range'), null)
})

test('html ignores Range', async () => {
  const { res } = await vid({ range: 'bytes=0-9' }, 'GET', '/alpha-cafe/')
  assert.equal(res.status, 200)
  assert.equal(await res.text(), DATA)
  assert.equal(res.headers.get('content-range'), null)
})

test('a Range request for a missing mp4 is a 404, not a 416', async () => {
  const { res } = await vid({ range: 'bytes=0-9' }, 'GET', '/alpha-cafe/nope-deadbeef.mp4')
  assert.equal(res.status, 404)
})

test('an mp4 response carries no CSP; html still does and now allows media from self', async () => {
  const v = await vid({ range: 'bytes=0-9' })
  assert.equal(v.res.headers.get('content-security-policy'), null)
  const h = await vid({}, 'GET', '/alpha-cafe/')
  assert.ok(cspSet(h.res.headers.get('content-security-policy')).includes("media-src 'self'"))
})
