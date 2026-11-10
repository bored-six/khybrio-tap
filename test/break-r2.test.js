// Adversarial: createR2Store against an injected fake fetch (spec section 10, r2.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createR2Store } from '../src/publish/r2.js'

const SECRET = 'SUPERSECRETKEY/abc+123=='
const mk = (handler) => {
  const calls = []
  const fetch = async (req, init) => {
    const r = req instanceof Request ? req : new Request(req, init)
    const body = r.method === 'PUT' ? Buffer.from(await r.arrayBuffer()) : null
    calls.push({ url: r.url, method: r.method, headers: r.headers, body })
    return handler(r, calls.length - 1)
  }
  const store = createR2Store({ accountId: 'acc123', bucket: 'khybrio-tap', accessKeyId: 'AKID', secretAccessKey: SECRET, fetch })
  return { store, calls }
}
const xml = (items, { truncated = false, next } = {}) =>
  `<?xml version="1.0"?><ListBucketResult><IsTruncated>${truncated}</IsTruncated>` +
  items.map(([k, e]) => `<Contents><Key>${k}</Key><ETag>${e}</ETag><Size>1</Size></Contents>`).join('') +
  (next ? `<NextContinuationToken>${next}</NextContinuationToken>` : '') +
  `</ListBucketResult>`
const ok = (body = '') => new Response(body, { status: 200 })

test('list: GET on the bucket with list-type=2, signed, secret never in URL', async () => {
  const { store, calls } = mk(() => ok(xml([])))
  await store.list()
  const u = new URL(calls[0].url)
  assert.equal(calls[0].method, 'GET')
  assert.equal(u.origin, 'https://acc123.r2.cloudflarestorage.com')
  assert.equal(u.pathname, '/khybrio-tap')
  assert.equal(u.searchParams.get('list-type'), '2')
  assert.match(calls[0].headers.get('authorization'), /^AWS4-HMAC-SHA256 Credential=AKID\//)
  assert.match(calls[0].headers.get('authorization'), /\/auto\/s3\/aws4_request/)
  assert.ok(!calls[0].url.includes(SECRET) && !calls[0].url.includes(encodeURIComponent(SECRET)))
  assert.ok(![...calls[0].headers.values()].some((v) => v.includes(SECRET)))
})

test('list: unquotes ETags, including &quot; entity form', async () => {
  const { store } = mk(() => ok(xml([['a/index.html', '"abc123"'], ['b/index.html', '&quot;def456&quot;'], ['c', 'nolquote']])))
  const m = await store.list()
  assert.equal(m.get('a/index.html'), 'abc123')
  assert.equal(m.get('b/index.html'), 'def456')
  assert.equal(m.get('c'), 'nolquote')
})

test('list: pages through continuation tokens (token sent back, URL-safe) and merges', async () => {
  const tokens = ['tok+/=1', 'tok&2']
  const { store, calls } = mk((req, i) => {
    if (i === 0) return ok(xml([['a', '"1"']], { truncated: true, next: 'tok+/=1' }))
    if (i === 1) return ok(xml([['b', '"2"']], { truncated: true, next: 'tok&amp;2' }))
    return ok(xml([['c', '"3"']]))
  })
  const m = await store.list()
  assert.deepEqual([...m.keys()], ['a', 'b', 'c'])
  assert.equal(calls.length, 3)
  assert.equal(new URL(calls[0].url).searchParams.get('continuation-token'), null)
  assert.equal(new URL(calls[1].url).searchParams.get('continuation-token'), tokens[0])
  assert.equal(new URL(calls[2].url).searchParams.get('continuation-token'), tokens[1])
})

test('list: more than 1000 keys across pages all come back', async () => {
  const mkPage = (from, n) => Array.from({ length: n }, (_, i) => [`k${from + i}`, `"e${from + i}"`])
  const { store } = mk((req, i) => (i === 0 ? ok(xml(mkPage(0, 1000), { truncated: true, next: 't1' })) : ok(xml(mkPage(1000, 500)))))
  const m = await store.list()
  assert.equal(m.size, 1500)
  assert.equal(m.get('k1499'), 'e1499')
})

test('list: IsTruncated true with no token must not loop forever', async () => {
  let n = 0
  const { store } = mk(() => (++n > 20 ? ok(xml([])) : ok(xml([['a', '"1"']], { truncated: true }))))
  await store.list()
  assert.ok(n <= 3, `fetched ${n} times`)
})

test('list: keys with XML entities are decoded', async () => {
  const { store } = mk(() => ok(xml([['a&amp;b/index.html', '"x"'], ['caf&#233;/index.html', '"y"']])))
  const m = await store.list()
  assert.ok(m.has('a&b/index.html'))
  // numeric entities are valid XML; spec says keys round-trip
  assert.ok(m.has('café/index.html'), `keys: ${[...m.keys()]}`)
})

test('list: empty bucket gives empty Map', async () => {
  const { store } = mk(() => ok(xml([])))
  assert.equal((await store.list()).size, 0)
})

test('list: 403 and 500 throw, message has status and no secret', async () => {
  for (const status of [403, 500]) {
    const { store } = mk(() => new Response(`<Error>${SECRET}</Error>`, { status }))
    await assert.rejects(store.list(), (e) => e.message.includes(String(status)) && !e.message.includes(SECRET))
  }
})

test('put: PUT with body, content-type, cache-control, signed', async () => {
  const { store, calls } = mk(() => ok())
  await store.put('demo/index.html', Buffer.from('<p>hi</p>'), { contentType: 'text/html; charset=utf-8', cacheControl: 'no-cache' })
  const c = calls[0]
  assert.equal(c.method, 'PUT')
  assert.equal(new URL(c.url).pathname, '/khybrio-tap/demo/index.html')
  assert.equal(c.headers.get('content-type'), 'text/html; charset=utf-8')
  assert.equal(c.headers.get('cache-control'), 'no-cache')
  assert.equal(c.body.toString(), '<p>hi</p>')
  assert.ok(c.headers.get('authorization'))
  assert.ok(!c.url.includes(SECRET))
})

test('put: binary body survives byte for byte', async () => {
  const buf = Buffer.from(Array.from({ length: 256 }, (_, i) => i))
  const { store, calls } = mk(() => ok())
  await store.put('fonts/a.woff2', buf, { contentType: 'font/woff2' })
  assert.deepEqual(calls[0].body, buf)
})

test('put: empty body is allowed', async () => {
  const { store, calls } = mk(() => ok())
  await store.put('x/empty.svg', Buffer.alloc(0), { contentType: 'image/svg+xml' })
  assert.equal(calls[0].body.length, 0)
})

test('keys with spaces, unicode, + & ? # % are percent-encoded per segment, slashes kept', async () => {
  const keys = ['a b/index.html', 'café/ñ.png', 'plus+/x+y.png', 'q?/h#/p%/a&b=c.png', "it's/(x)*!.png"]
  const { store, calls } = mk(() => ok())
  for (const k of keys) await store.put(k, Buffer.from('x'), {})
  for (let i = 0; i < keys.length; i++) {
    const u = new URL(calls[i].url)
    assert.equal(u.search, '', `${keys[i]} leaked into query`)
    assert.equal(u.hash, '', `${keys[i]} leaked into hash`)
    const path = u.pathname.slice('/khybrio-tap/'.length)
    assert.equal(path.split('/').length, keys[i].split('/').length, keys[i])
    assert.equal(path.split('/').map(decodeURIComponent).join('/'), keys[i], `round trip ${keys[i]}`)
    assert.ok(!/[ +]/.test(path), `raw space or + in ${path}`)
  }
})

test('del: DELETE on the encoded key, signed', async () => {
  const { store, calls } = mk(() => new Response(null, { status: 204 }))
  await store.del('old page/index.html')
  assert.equal(calls[0].method, 'DELETE')
  assert.equal(new URL(calls[0].url).pathname, '/khybrio-tap/old%20page/index.html')
  assert.ok(calls[0].headers.get('authorization'))
})

test('put and del: 403 / 500 reject; message names key + status but not the secret', async () => {
  for (const status of [403, 500]) {
    const { store } = mk(() => new Response(SECRET, { status }))
    await assert.rejects(store.put('k/index.html', Buffer.from('x'), {}), (e) => e.message.includes(String(status)) && !e.message.includes(SECRET))
    await assert.rejects(store.del('k/index.html'), (e) => e.message.includes(String(status)) && !e.message.includes(SECRET))
  }
})

test('network failure from fetch propagates as a rejection', async () => {
  const { store } = mk(() => { throw new TypeError('socket hang up') })
  await assert.rejects(store.list())
})
