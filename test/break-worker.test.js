// Adversarial: worker/handler.js (spec section 9). Fake R2 bucket, hostile paths and headers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle } from '../worker/handler.js'

const HTML = 'text/html; charset=utf-8'
const obj = (body, contentType, cacheControl, etag) => ({ body, text: async () => body, httpMetadata: { contentType, cacheControl }, httpEtag: etag })
function bucket(extra = {}) {
  const items = new Map([
    ['index.html', obj('<p>home</p>', HTML, 'no-cache', '"e-home"')],
    ['404.html', obj('<p>nf</p>', HTML, 'no-cache', '"e-404"')],
    ['alpha-cafe/index.html', obj('<p>alpha</p>', HTML, 'no-cache', '"e-alpha"')],
    ['alpha-cafe/logo.svg', obj('<svg/>', 'image/svg+xml', 'public, max-age=300', '"e-logo"')],
    ['alpha-cafe/my pic.png', obj('PNG', 'image/png', 'x', '"e-pic"')],
    ['fonts/f.woff2', obj('FONT', 'font/woff2', 'x', '"e-font"')],
    ['_redirect/old-name', obj('alpha-cafe', 'text/plain', 'no-store', '"r"')],
    ['_redirect/fonts', obj('alpha-cafe', 'text/plain', 'no-store', '"r2"')],
    ['_redirect/chain-a', obj('chain-b', 'text/plain', 'no-store', '"r3"')],
    ['_redirect/loop-a', obj('loop-b', 'text/plain', 'no-store', '"r4"')],
    ['_redirect/loop-b', obj('loop-a', 'text/plain', 'no-store', '"r5"')],
    ['_redirect/evil-1', obj('//evil.com', 'text/plain', 'no-store', '"r6"')],
    ['_redirect/evil-2', obj('https://evil.com/', 'text/plain', 'no-store', '"r7"')],
    ['_redirect/evil-3', obj('alpha-cafe/../../x', 'text/plain', 'no-store', '"r8"')],
    ['_redirect/evil-4', obj('Alpha-Cafe', 'text/plain', 'no-store', '"r9"')],
    ['_redirect/nl', obj('alpha-cafe\n', 'text/plain', 'no-store', '"r10"')],
    ['_redirect/empty', obj('', 'text/plain', 'no-store', '"r11"')],
    ['alpha-cafe/index.html/index.html', obj('SHADOW', HTML, 'x', '"s"')],
    ['secret/index.html', obj('SECRET', HTML, 'x', '"sec"')],
    ...Object.entries(extra),
  ])
  const gets = []
  return { gets, get: async (k) => { gets.push(k); if (Buffer.byteLength(k) > 1024) throw new Error('key too long'); return items.get(k) ?? null } }
}
const call = (path, init, b = bucket()) => handle(new Request(`https://tap.test${path}`, init), b).then((res) => ({ res, b }))
const SAFE_KEY = /^(_redirect\/[a-z0-9]+(-[a-z0-9]+)*|[^/\\\0]+(\/[^/\\\0]+)?)$/

const HOSTILE = [
  '/%2e%2e/_redirect/old-name', '/alpha-cafe/%2e%2e/_redirect/old-name', '/alpha-cafe/%2E%2E/%2E%2E/etc/passwd',
  '/alpha-cafe%2f..%2f_redirect%2fold-name', '/alpha-cafe%2F..', '/%2fetc/passwd', '/alpha-cafe/%2f_redirect/old-name',
  '/alpha-cafe%252f..%252f_redirect%252fold-name', '/%252e%252e/secret/', '/alpha-cafe/%252e%252e/', '/%255fredirect/old-name',
  '/alpha-cafe\\..\\_redirect\\old-name', '/alpha-cafe/..%5c_redirect%5cold-name', '/%5c_redirect/old-name',
  '//_redirect/old-name', '///', '//evil.com', '/alpha-cafe//', '/alpha-cafe//logo.svg', '/\\evil.com',
  '/_redirect/old-name', '/%5Fredirect/old-name', '/%5fredirect/old-name', '/alpha-cafe/_x', '/_redirect/', '/.git/config', '/.env', '/%2eenv', '/alpha-cafe/.hidden', '/.well-known/x/y',
  '/alpha-cafe./', '/alpha-cafe.', '/alpha-cafe../index.html', '/alpha-cafe/./index.html/index.html', '/alpha-cafe/index.html/',
  '/alpha-cafe/index.html/index.html', '/alpha-cafe/logo.svg/', '/a/b/c', '/alpha-cafe/a/b',
  '/alpha-cafe%00/', '/alpha-cafe/%00', '/%ff/', '/%E0%A4%A/', '/%', '/alpha-cafe/%zz',
  '/alpha-cafe%20/', '/%20/', '/ /', '/alpha-cafe%0d%0aX-Evil:1/', '/alpha-cafe%0a/',
  '/ALPHA-CAFE/', '/Alpha-Cafe/', '/Alpha-Cafe', '/alpha-cafe/LOGO.SVG', '/FONTS/f.woff2', '/Fonts/f.woff2',
  '/404.html', '/404.html/', '/index.html/', '/secret%2findex.html',
]

test('hostile paths: never leak non-public keys, never query the bucket with a traversal-shaped key', async () => {
  const bad = []
  for (const p of HOSTILE) {
    const { res, b } = await call(p)
    const body = res.status === 301 || res.status === 302 ? '' : await res.text()
    if (/SHADOW|SECRET/.test(body)) bad.push(`${p} leaked "${body}"`)
    for (const k of b.gets) {
      if (!SAFE_KEY.test(k) || k.split('/').some((s) => s === '..' || s === '.')) bad.push(`${p} queried ${JSON.stringify(k)}`)
      if (k.startsWith('_') && !/^_redirect\/[a-z0-9-]+$/.test(k)) bad.push(`${p} read internal key ${k}`)
    }
    if (res.status === 301 || res.status === 302) {
      const loc = res.headers.get('location')
      if (!/^\/[^/\\\r\n]/.test(loc)) bad.push(`${p}: location ${loc}`)
    } else if (![200, 404].includes(res.status)) bad.push(`${p}: status ${res.status}`)
  }
  assert.deepEqual(bad, [])
})

test('hostile paths that reach internal or hidden things are exactly 404 with the 404 page', async () => {
  const must404 = HOSTILE.filter((p) => /_redirect|%5f|\.git|\.env|\.hidden|well-known|\/_x|%2f|%2F|%5c|\\|^\/\/|%00|%ff|%zz|^\/%$|%E0/i.test(p) && !/^\/%252|%252f/i.test(p))
  for (const p of must404) {
    const { res } = await call(p)
    assert.equal(res.status, 404, p)
    assert.equal(await res.text(), '<p>nf</p>', p)
  }
})

test('double-encoded %252f is not decoded twice into a separator', async () => {
  for (const p of ['/alpha-cafe%252f..%252f_redirect%252fold-name', '/%252e%252e/secret/']) {
    const { res, b } = await call(p)
    assert.ok(res.status === 404 || res.status === 301, p)
    assert.ok(!b.gets.includes('secret/index.html'), p)
    assert.ok(!b.gets.some((k) => k.startsWith('_redirect/') && k.includes('%')), p)
  }
})

test('uppercase slug is a 404 (keys are case sensitive, slugs are lowercase)', async () => {
  for (const p of ['/ALPHA-CAFE/', '/Alpha-Cafe/', '/alpha-cafe/LOGO.SVG', '/FONTS/f.woff2']) {
    const { res } = await call(p)
    assert.equal(res.status, 404, p)
  }
})

test('a 10 KB path and a 1 KB slug 404 cleanly even if R2 rejects over-long keys', async () => {
  const bad = []
  for (const p of [`/${'a'.repeat(10_000)}/`, `/${'a'.repeat(1100)}/`, `/alpha-cafe/${'b'.repeat(2000)}.png`, `/${'a/'.repeat(5000)}`, `/${'%41'.repeat(3000)}/`]) {
    const { res } = await call(p).catch((e) => ({ res: { status: `THROW ${e.message}` } }))
    if (res.status !== 404) bad.push(`${p.slice(0, 20)}... ${res.status}`)
  }
  assert.deepEqual(bad, [])
})

test('redirect: one hop only, A->B where B is itself an old address does not recurse inside the Worker', async () => {
  const { res, b } = await call('/chain-a/')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/chain-b/')
  assert.equal(b.gets.filter((k) => k.startsWith('_redirect/')).length, 1)
})

test('redirect loop A<->B answers each request with a single 302, never hangs', async () => {
  for (const s of ['loop-a', 'loop-b']) {
    const { res } = await call(`/${s}/`)
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('cache-control'), 'no-store')
  }
})

test('redirect target that is not a plain slug never becomes a Location header', async () => {
  for (const s of ['evil-1', 'evil-2', 'evil-3', 'evil-4', 'empty']) {
    const { res } = await call(`/${s}/`)
    assert.equal(res.status, 404, s)
    assert.equal(res.headers.get('location'), null, s)
  }
})

test('redirect target with trailing newline is trimmed; file names are re-encoded', async () => {
  assert.equal((await call('/nl/')).res.headers.get('location'), '/alpha-cafe/')
  const r = await call('/old-name/my%20pic.png')
  assert.equal(r.res.status, 302)
  assert.equal(r.res.headers.get('location'), '/alpha-cafe/my%20pic.png')
  const u = await call('/old-name/caf%C3%A9.png')
  assert.equal(u.res.headers.get('location'), '/alpha-cafe/caf%C3%A9.png')
})

test('redirect: a live page wins over a stale _redirect record with the same name', async () => {
  const b = bucket({ '_redirect/alpha-cafe': obj('somewhere-else', 'text/plain', 'no-store', '"x"') })
  const { res } = await call('/alpha-cafe/', undefined, b)
  assert.equal(res.status, 200)
  assert.equal(await res.text(), '<p>alpha</p>')
})

test('redirect: fonts is never redirected, even with a stray _redirect/fonts; deeper paths never redirect', async () => {
  assert.equal((await call('/fonts/missing.woff2')).res.status, 404)
  assert.equal((await call('/old-name/a/b')).res.status, 404)
  assert.equal((await call('/old-name/logo.svg/')).res.status, 404)
})

test('redirect response has no body on HEAD and keeps no-store', async () => {
  const { res } = await call('/old-name/', { method: 'HEAD' })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(await res.text(), '')
})

test('HEAD on a 404 is 404, empty body, and still carries the html security headers', async () => {
  const { res } = await call('/nope/x', { method: 'HEAD' })
  assert.equal(res.status, 404)
  assert.equal(await res.text(), '')
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
})

test('HEAD on 200 object: no body, headers (etag, content-type) present', async () => {
  const { res } = await call('/alpha-cafe/logo.svg', { method: 'HEAD' })
  assert.equal(res.status, 200)
  assert.equal(await res.text(), '')
  assert.equal(res.headers.get('etag'), '"e-logo"')
  assert.equal(res.headers.get('content-type'), 'image/svg+xml')
})

test('If-None-Match: exact etag is 304 with no body; a different etag is 200 with the body', async () => {
  const hit = await call('/alpha-cafe/', { headers: { 'if-none-match': '"e-alpha"' } })
  assert.equal(hit.res.status, 304)
  assert.equal(await hit.res.text(), '')
  assert.equal(hit.res.headers.get('etag'), '"e-alpha"')
  for (const v of ['"other"', '', 'e-alpha', '"e-alpha"x', '"E-ALPHA"', 'W/"nope"']) {
    const { res } = await call('/alpha-cafe/', { headers: { 'if-none-match': v } })
    assert.equal(res.status, 200, JSON.stringify(v))
    assert.equal(await res.text(), '<p>alpha</p>')
  }
})

test('If-None-Match never turns a 404 into a 304, even when it equals the 404 page etag', async () => {
  const { res } = await call('/nope/x', { headers: { 'if-none-match': '"e-404"' } })
  assert.equal(res.status, 404)
  assert.equal(await res.text(), '<p>nf</p>')
})

test('If-None-Match weak / list forms: response is either 304 or a full 200, never an error (spec ambiguous on which)', async () => {
  for (const v of ['W/"e-alpha"', '"x", "e-alpha"', '*']) {
    const { res } = await call('/alpha-cafe/', { headers: { 'if-none-match': v } })
    assert.ok(res.status === 304 || res.status === 200, `${v}: ${res.status}`)
    if (res.status === 200) assert.equal(await res.text(), '<p>alpha</p>')
  }
})

test('non-GET verbs are 405 on every kind of path and never touch the bucket', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'PROPFIND']) {
    for (const p of ['/', '/alpha-cafe/', '/nope', '/_redirect/old-name', '/old-name/']) {
      const { res, b } = await call(p, { method, body: ['POST', 'PUT', 'PATCH'].includes(method) ? 'x' : undefined })
      assert.equal(res.status, 405, `${method} ${p}`)
      assert.equal(res.headers.get('allow'), 'GET, HEAD')
      assert.equal(b.gets.length, 0, `${method} ${p} hit the bucket`)
    }
  }
})

test('query strings and fragments are ignored for routing', async () => {
  assert.equal((await call('/alpha-cafe/?utm=x&a=/../_redirect')).res.status, 200)
  assert.equal((await call('/?a=b')).res.status, 200)
  const r = await call('/alpha-cafe?x=1')
  assert.equal(r.res.status, 301)
  assert.equal(r.res.headers.get('location'), '/alpha-cafe/')
})

test('/slug 301 location stays same-origin path for odd slugs', async () => {
  for (const p of ['/a%20b', '/x.y', '/evil.com', '/%F0%9F%98%80']) {
    const { res } = await call(p)
    if (res.status === 301) assert.match(res.headers.get('location'), /^\/[^/\\]*\/$/, p)
  }
})

test('keys with spaces are served (percent-decoded once)', async () => {
  const { res } = await call('/alpha-cafe/my%20pic.png')
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'PNG')
})

test('missing 404.html in the bucket still gives a 404, not a throw', async () => {
  const b = bucket()
  const orig = b.get
  b.get = async (k) => (k === '404.html' ? null : orig(k))
  const { res } = await call('/nope/x', undefined, b)
  assert.equal(res.status, 404)
})

test('html responses carry CSP, nosniff, referrer-policy; non-html do not get CSP', async () => {
  const h = (await call('/alpha-cafe/')).res.headers
  assert.match(h.get('content-security-policy'), /frame-ancestors 'none'(;|$)/) // v3 adds media-src 'self'; directive order is not contract
  assert.equal(h.get('referrer-policy'), 'strict-origin-when-cross-origin')
  assert.equal((await call('/fonts/f.woff2')).res.headers.get('content-security-policy'), null)
})
