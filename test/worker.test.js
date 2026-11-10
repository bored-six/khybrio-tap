// The Worker, written from section 9 of .claude/specs/mvp-showcase.md before the code existed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle } from '../worker/handler.js'

const HTML = 'text/html; charset=utf-8'
const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; " +
  'frame-src https://www.youtube-nocookie.com https://www.tiktok.com; base-uri \'none\'; form-action \'none\'; frame-ancestors \'none\''

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
    assert.equal(res.headers.get('content-security-policy'), CSP, path)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path)
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path)
  }
})
