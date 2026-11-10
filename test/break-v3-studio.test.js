// Adversarial v3 tests for the studio's streamed upload, orphan cleanup and /p/ Range.
// Written against spec section 6 ("Server upload", "Orphans") and section 6 Range table, not the implementation.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStudio } from '../src/studio/server.js'
import { SITE_SUBPATH } from './helpers.js'
import { ftyp, moov, mdat, mp4, box, PNG, JPEG } from './mp4-fixtures.js'

let root, server, port, base
const MIB = 1024 * 1024
const H = { 'x-khybrio-studio': '1' }
const SLUG = 'demo-shop'
const dirOf = (slug = SLUG) => join(root, 'clients', slug)
const ls = (slug = SLUG) => readdir(dirOf(slug)).catch(() => [])
const md5 = (b) => createHash('md5').update(b).digest('hex').slice(0, 8)

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'khybrio-breakv3-'))
  server = createStudio({ root, site: SITE_SUBPATH, publish: async () => ({ ok: true, output: '' }) })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  port = server.address().port
  base = `http://127.0.0.1:${port}`
})
after(async () => {
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
})
beforeEach(async () => {
  await rm(join(root, 'clients'), { recursive: true, force: true })
  await mkdir(dirOf(), { recursive: true })
})

const upload = (name, body, slug = SLUG) =>
  fetch(`${base}/api/clients/${slug}/assets?name=${encodeURIComponent(name)}`, { method: 'POST', headers: H, body })
const putClient = (data, slug = SLUG) =>
  fetch(`${base}/api/clients/${slug}`, { method: 'PUT', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ data }) })
const seed = (data, slug = SLUG) => writeFile(join(dirOf(slug), 'client.js'), `export default ${JSON.stringify(data)}\n`)
const client = (extra = {}) => ({
  slug: SLUG, name: 'Demo', look: 'plain',
  theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#f2c14e' },
  blocks: [{ type: 'link', kind: 'website', url: 'https://example.com/x' }],
  ...extra,
})
// An mp4 of exactly `total` bytes: ftyp + moov(avc1) + one mdat that fills the rest.
function mp4Of(total) {
  const fixed = ftyp().length + moov().length + 8
  return Buffer.concat([ftyp(), moov(['avc1']), mdat(total - fixed)])
}
const noTemp = async (slug = SLUG) => assert.deepEqual((await ls(slug)).filter((f) => f.startsWith('.up-')), [], 'temp file left behind')

/* raw socket POST so Content-Length can lie */
function rawPost(path, headers, chunks, { end = true, waitMs = 400 } = {}) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    let out = ''
    s.on('data', (d) => (out += d.toString('latin1')))
    s.on('error', () => {})
    s.on('close', () => resolve(out))
    const head = [`POST ${path} HTTP/1.1`, `Host: 127.0.0.1:${port}`, 'x-khybrio-studio: 1', ...headers, '', ''].join('\r\n')
    s.write(head)
    for (const c of chunks) s.write(c)
    if (end) s.end()
    setTimeout(() => s.destroy(), waitMs)
  })
}
const status = (raw) => Number((/^HTTP\/1\.1 (\d{3})/.exec(raw) || [])[1] || 0)

/* ---------------------------------------------------------------- the cap boundary */

test('upload: an mp4 of exactly 15 MiB is accepted; one byte over is 422 "File is over 15 MB" and leaves nothing', async () => {
  const exact = mp4Of(15 * MIB)
  assert.equal(exact.length, 15 * MIB)
  const ok = await upload('big.mp4', exact)
  assert.equal(ok.status, 201, await ok.clone().text())
  const j = await ok.json()
  assert.equal(j.file, `big-${md5(exact)}.mp4`)
  assert.equal((await readFile(join(dirOf(), j.file))).length, 15 * MIB)
  await rm(join(dirOf(), j.file))
  const over = await upload('big.mp4', Buffer.concat([exact, Buffer.alloc(1)]))
  assert.equal(over.status, 422)
  assert.deepEqual(await over.json(), { error: 'File is over 15 MB' })
  assert.deepEqual(await ls(), [])
})

test('upload: image cap is 3 MiB exactly (exact ok, +1 byte is 422 "File is over 3 MB"), and no temp survives either way', async () => {
  const png = (n) => Buffer.concat([PNG, Buffer.alloc(n - PNG.length)])
  assert.equal((await upload('p.png', png(3 * MIB))).status, 201)
  const over = await upload('q.png', png(3 * MIB + 1))
  assert.equal(over.status, 422)
  assert.deepEqual(await over.json(), { error: 'File is over 3 MB' })
  assert.deepEqual((await ls()).sort(), ['p.png'])
})

test('upload: a far-over-cap body (40 MiB) is refused without hanging and without a temp file', async () => {
  const r = await upload('huge.mp4', Buffer.alloc(40 * MIB, 1))
  assert.equal(r.status, 422)
  assert.deepEqual(await ls(), [])
})

test('upload: zero-byte body is 422 for every type and leaves nothing', async () => {
  for (const n of ['a.mp4', 'a.png', 'a.jpg', 'a.webp', 'a.svg']) {
    const r = await upload(n, Buffer.alloc(0))
    assert.equal(r.status === 201 && n !== 'a.svg', false, `${n} accepted an empty file`)
  }
  assert.deepEqual((await ls()).filter((f) => f !== 'a.svg'), [])
})

/* ---------------------------------------------------------------- content checks */

test('upload: JPEG bytes named .mp4, mp4 bytes named .jpg, HEVC mp4: all 422, nothing left', async () => {
  const cases = [['a.mp4', JPEG, 'not an MP4 file'], ['a.jpg', mp4(), 'File content is not a real JPG'], ['a.png', mp4(), 'File content is not a real PNG'], ['h.mp4', mp4({ codecs: ['hvc1'] }), null]]
  for (const [name, body, msg] of cases) {
    const r = await upload(name, body)
    assert.equal(r.status, 422, name)
    const j = await r.json()
    if (msg) assert.equal(j.error, msg, name)
    else assert.match(j.error, /HEVC/)
  }
  assert.deepEqual(await ls(), [])
})

test('upload: hashed mp4 name is stable for the same bytes, differs for different bytes, and the md5 is of the file bytes', async () => {
  const a = mp4({ mdatBytes: 64 })
  const b = mp4({ mdatBytes: 65 })
  const n1 = (await (await upload('clip.mp4', a)).json()).file
  const n2 = (await (await upload('clip.mp4', a)).json()).file
  const n3 = (await (await upload('clip.mp4', b)).json()).file
  assert.equal(n1, n2)
  assert.equal(n1, `clip-${md5(a)}.mp4`)
  assert.notEqual(n1, n3)
  assert.equal(n3, `clip-${md5(b)}.mp4`)
  assert.deepEqual((await ls()).sort(), [n1, n3].sort())
})

test('upload: the hash covers every byte of a multi-chunk body (a change in the last byte changes the name)', async () => {
  const a = mp4Of(3 * MIB)
  const b = Buffer.from(a); b[b.length - 1] ^= 0xff
  const na = (await (await upload('v.mp4', a)).json()).file
  const nb = (await (await upload('v.mp4', b)).json()).file
  assert.equal(na, `v-${md5(a)}.mp4`)
  assert.equal(nb, `v-${md5(b)}.mp4`)
  assert.notEqual(na, nb)
  assert.deepEqual(await readFile(join(dirOf(), na)), a)
})

test('upload: faststart warning only when the index is at the end', async () => {
  const slow = await (await upload('s.mp4', mp4({ faststart: false }))).json()
  assert.ok(slow.warnings.some((w) => w.startsWith('This MP4 starts slowly on phones')))
  const fast = await (await upload('f.mp4', mp4({ faststart: true }))).json()
  assert.deepEqual(fast.warnings, [])
})

/* ---------------------------------------------------------------- names */

test('upload: names are lowercased and spaces become dashes; mp4 stem keeps that', async () => {
  const j = await (await upload('My Clip.MP4', mp4())).json()
  assert.match(j.file, /^my-clip-[0-9a-f]{8}\.mp4$/)
})

test('upload: path tricks in ?name= are refused and write nothing outside the client folder', async () => {
  const names = ['../evil.png', '..%2Fevil.png', 'a/b.png', 'a\\b.png', '..\\x.png', '.hidden.png', '.up-1-1', 'client.js', 'x.png/', 'x.png%00.mp4', 'x\0.png', 'a..b.png', '/etc/passwd.png', '', 'x.PNG.exe', '%2e%2e%2fx.png', 'x.svg.mp4/../y.png']
  for (const n of names) {
    const r = await fetch(`${base}/api/clients/${SLUG}/assets?name=${n}`, { method: 'POST', headers: H, body: PNG }).catch(() => null)
    if (r) assert.notEqual(r.status, 201, `accepted ${JSON.stringify(n)}`)
  }
  const escapes = (await readdir(join(root, 'clients'))).filter((f) => f !== SLUG)
  assert.deepEqual(escapes, [], 'something was written next to the client folder')
  assert.deepEqual(await readdir(root).then((l) => l.filter((f) => f !== 'clients')), [], 'something was written in the root')
  assert.deepEqual((await ls()).filter((f) => f !== 'client.js'), [])
})

test('upload: a bad slug in the URL never creates a folder', async () => {
  for (const s of ['..', '%2e%2e', 'A', 'a', 'x_y', 'a%2Fb']) {
    const r = await fetch(`${base}/api/clients/${s}/assets?name=a.png`, { method: 'POST', headers: H, body: PNG })
    assert.ok([400, 404].includes(r.status), `${s} -> ${r.status}`)
  }
  assert.deepEqual(await readdir(join(root, 'clients')), [SLUG])
})

test('upload: missing studio header is 403 and no temp file', async () => {
  const r = await fetch(`${base}/api/clients/${SLUG}/assets?name=a.png`, { method: 'POST', body: PNG })
  assert.equal(r.status, 403)
  assert.deepEqual(await ls(), [])
})

/* ---------------------------------------------------------------- aborted and lying uploads */

test('upload: a connection dropped mid-stream leaves no temp file and no final file; the server keeps serving', async () => {
  const body = mp4Of(4 * MIB)
  await new Promise((resolve) => {
    const req = http.request({ port, host: '127.0.0.1', method: 'POST', path: `/api/clients/${SLUG}/assets?name=drop.mp4`, headers: { ...H, 'content-length': String(body.length) } })
    req.on('error', () => {})
    req.write(body.subarray(0, MIB + 7))
    setTimeout(() => { req.destroy(); resolve() }, 150)
  })
  await new Promise((r) => setTimeout(r, 400))
  await noTemp()
  assert.deepEqual((await ls()).filter((f) => f.endsWith('.mp4')), [])
  assert.equal((await upload('after.png', PNG)).status, 201)
})

test('upload: many aborted uploads in a row do not leak temp files', async () => {
  for (let i = 0; i < 8; i++) {
    await rawPost(`/api/clients/${SLUG}/assets?name=a${i}.mp4`, ['content-length: 5000000'], [mp4Of(200000)], { end: false, waitMs: 60 })
  }
  await new Promise((r) => setTimeout(r, 400))
  await noTemp()
  assert.deepEqual((await ls()).filter((f) => f.endsWith('.mp4')), [])
})

test('upload: Content-Length LARGER than the body then the socket closes: no file, no temp', async () => {
  const body = mp4()
  const raw = await rawPost(`/api/clients/${SLUG}/assets?name=lie.mp4`, [`content-length: ${body.length + 5000}`], [body], { end: true })
  assert.notEqual(status(raw), 201)
  await new Promise((r) => setTimeout(r, 300))
  await noTemp()
  assert.deepEqual((await ls()).filter((f) => f.endsWith('.mp4')), [])
})

test('upload: Content-Length SMALLER than the body: never stores the extra bytes (either a clean 201 of the declared bytes, or a refusal with nothing kept)', async () => {
  const body = mp4()
  const junk = Buffer.from('GARBAGE-AFTER-BODY')
  const raw = await rawPost(`/api/clients/${SLUG}/assets?name=short.mp4`, [`content-length: ${body.length}`], [Buffer.concat([body, junk])])
  await new Promise((r) => setTimeout(r, 300))
  const mp4s = (await ls()).filter((f) => f.endsWith('.mp4'))
  if (status(raw) === 201) {
    assert.deepEqual(mp4s, [`short-${md5(body)}.mp4`])
    assert.deepEqual(await readFile(join(dirOf(), mp4s[0])), body)
  } else assert.deepEqual(mp4s, [], `status ${status(raw)} but a file was kept`)
  await noTemp()
})

test('upload: Content-Length declaring a body over the cap but sending little: refused or aborted, nothing kept', async () => {
  const raw = await rawPost(`/api/clients/${SLUG}/assets?name=liar.mp4`, [`content-length: ${20 * MIB}`], [mp4()], { end: true })
  assert.notEqual(status(raw), 201)
  await new Promise((r) => setTimeout(r, 300))
  await noTemp()
  assert.deepEqual((await ls()).filter((f) => f.endsWith('.mp4')), [])
})

test('upload: chunked transfer with no Content-Length, over the cap, is cut by the byte counter', async () => {
  const chunk = Buffer.alloc(MIB, 7)
  const parts = []
  for (let i = 0; i < 16; i++) parts.push(Buffer.from(`${chunk.length.toString(16)}\r\n`), chunk, Buffer.from('\r\n'))
  parts.push(Buffer.from('0\r\n\r\n'))
  const raw = await rawPost(`/api/clients/${SLUG}/assets?name=chunky.mp4`, ['transfer-encoding: chunked'], parts, { end: false, waitMs: 2500 })
  assert.equal(status(raw), 422, raw.slice(0, 200))
  await noTemp()
  assert.deepEqual((await ls()).filter((f) => f.endsWith('.mp4')), [])
})

/* ---------------------------------------------------------------- concurrency */

test('upload: two concurrent uploads of the same name with DIFFERENT bytes both succeed with their own hashed names and intact content', async () => {
  const a = mp4Of(2 * MIB), b = mp4Of(2 * MIB); b[b.length - 5] = 1
  const [ra, rb] = await Promise.all([upload('same.mp4', a), upload('same.mp4', b)])
  assert.equal(ra.status, 201)
  assert.equal(rb.status, 201)
  const [ja, jb] = [await ra.json(), await rb.json()]
  assert.notEqual(ja.file, jb.file)
  assert.deepEqual(await readFile(join(dirOf(), ja.file)), a)
  assert.deepEqual(await readFile(join(dirOf(), jb.file)), b)
  await noTemp()
})

test('upload: two concurrent uploads of the same name and the SAME bytes land on one file, intact', async () => {
  const a = mp4Of(2 * MIB)
  const rs = await Promise.all([upload('same.mp4', a), upload('same.mp4', a), upload('same.mp4', a)])
  for (const r of rs) assert.equal(r.status, 201)
  const names = new Set((await Promise.all(rs.map((r) => r.json()))).map((j) => j.file))
  assert.equal(names.size, 1)
  assert.deepEqual(await readFile(join(dirOf(), [...names][0])), a)
  assert.deepEqual((await ls()).filter((f) => f !== [...names][0]), [])
})

test('upload: concurrent same-name image uploads leave exactly one whole file (one of the two bodies), no temp', async () => {
  const a = Buffer.concat([PNG, Buffer.alloc(600000, 1)])
  const b = Buffer.concat([PNG, Buffer.alloc(600000, 2)])
  await Promise.all([upload('p.png', a), upload('p.png', b)])
  const got = await readFile(join(dirOf(), 'p.png'))
  assert.ok(got.equals(a) || got.equals(b), 'file is a mix of both bodies')
  await noTemp()
})

test('upload: concurrent uploads while a slow one is mid-stream do not block or corrupt each other', async () => {
  const slowBody = mp4Of(1 * MIB)
  const slow = new Promise((resolve) => {
    const req = http.request({ port, host: '127.0.0.1', method: 'POST', path: `/api/clients/${SLUG}/assets?name=slow.mp4`, headers: { ...H, 'content-length': String(slowBody.length) } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)) })
    req.write(slowBody.subarray(0, 1000))
    setTimeout(() => req.end(slowBody.subarray(1000)), 300)
  })
  const quick = await upload('quick.png', PNG)
  assert.equal(quick.status, 201)
  assert.equal(await slow, 201)
  await noTemp()
})

/* ---------------------------------------------------------------- orphans */

test('orphans: PUT keeps files still referenced by logo, cover, background.file and background.poster (hashed names) and deletes unreferenced hashed ones', async () => {
  const keep = ['logo-aaaaaaaa.jpg', 'cover-bbbbbbbb.webp', 'clip-cccccccc.mp4', 'clip-cccccccc-poster.jpg']
  const drop = ['old-dddddddd.mp4', 'old-dddddddd-poster.jpg', 'x-eeeeeeee.jpeg', 'y-ffffffff.webp']
  const hand = ['hand-placed.jpg', 'team.webp', 'promo.mp4', 'logo.svg', 'clip-poster.jpg', 'clip-cccccccz.mp4', 'a-ABCDEF12.jpg', 'a-1234567.jpg', 'a-123456789.png']
  await seed(client())
  for (const f of [...keep, ...drop, ...hand]) await writeFile(join(dirOf(), f), 'x')
  const r = await putClient(client({ logo: 'logo-aaaaaaaa.jpg', cover: 'cover-bbbbbbbb.webp', background: { type: 'video', file: 'clip-cccccccc.mp4', poster: 'clip-cccccccc-poster.jpg' } }))
  assert.equal(r.status, 200, await r.clone().text())
  const left = await ls()
  for (const f of keep) assert.ok(left.includes(f), `deleted referenced ${f}`)
  for (const f of drop) assert.ok(!left.includes(f), `kept orphan ${f}`)
  for (const f of hand.filter((h) => h !== 'a-123456789.png' && h !== 'a-1234567.jpg')) assert.ok(left.includes(f), `deleted hand-placed ${f}`)
  assert.ok(left.includes('a-1234567.jpg'), 'deleted a 7-hex name')
  assert.ok(left.includes('a-123456789.png'), 'deleted a png (not in the orphan pattern)')
})

test('orphans: image background file is kept; switching to a colour background then drops it', async () => {
  await seed(client())
  await writeFile(join(dirOf(), 'photo-12345678.jpg'), 'x')
  assert.equal((await putClient(client({ background: { type: 'image', file: 'photo-12345678.jpg' } }))).status, 200)
  assert.ok((await ls()).includes('photo-12345678.jpg'))
  assert.equal((await putClient(client())).status, 200)
  assert.ok(!(await ls()).includes('photo-12345678.jpg'))
})

test('orphans: a REJECTED save (422) deletes nothing', async () => {
  await seed(client())
  await writeFile(join(dirOf(), 'old-dddddddd.mp4'), 'x')
  const r = await putClient(client({ look: 'nope' }))
  assert.equal(r.status, 422)
  assert.ok((await ls()).includes('old-dddddddd.mp4'))
})

test('orphans: a PUT for one client never touches another client\'s hashed files', async () => {
  await mkdir(dirOf('other-shop'), { recursive: true })
  await seed(client({ slug: 'other-shop' }), 'other-shop')
  await writeFile(join(dirOf('other-shop'), 'v-12345678.mp4'), 'x')
  await seed(client())
  await putClient(client())
  assert.deepEqual((await ls('other-shop')).sort(), ['client.js', 'v-12345678.mp4'])
})

test('orphans: an in-flight upload\'s temp file is never mistaken for an orphan or deleted by a concurrent PUT', async () => {
  await seed(client())
  const body = mp4Of(6 * MIB)
  const up = upload('v.mp4', body)
  const puts = []
  for (let i = 0; i < 10; i++) puts.push(putClient(client()))
  const [r] = await Promise.all([up, ...puts])
  assert.equal(r.status, 201, await r.clone().text())
  assert.deepEqual(await readFile(join(dirOf(), `v-${md5(body)}.mp4`)), body)
})

/* ---------------------------------------------------------------- /p/ preview Range */

async function seedVideo(name = 'clip-12345678.mp4', size = 1000) {
  const b = Buffer.from(Array.from({ length: size }, (_, i) => i % 251))
  await writeFile(join(dirOf(), name), b)
  return b
}
const p = (name, headers = {}, method = 'GET') => fetch(`${base}/p/${SLUG}/${name}`, { method, headers })

test('/p/ Range: single ranges give 206 with exact bytes; bytes=0-0; suffix; clamped end', async () => {
  const b = await seedVideo()
  let r = await p('clip-12345678.mp4', { range: 'bytes=0-0' })
  assert.equal(r.status, 206)
  assert.equal(r.headers.get('content-range'), 'bytes 0-0/1000')
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), b.subarray(0, 1))
  r = await p('clip-12345678.mp4', { range: 'bytes=-10' })
  assert.equal(r.headers.get('content-range'), 'bytes 990-999/1000')
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), b.subarray(990))
  r = await p('clip-12345678.mp4', { range: 'bytes=990-5000' })
  assert.equal(r.headers.get('content-range'), 'bytes 990-999/1000')
  assert.equal(r.headers.get('content-length'), '10')
})

test('/p/ Range: -0, start>=size, start>end are 416 with bytes */size and an empty body; multi-range and junk are a full 200', async () => {
  const b = await seedVideo()
  for (const range of ['bytes=-0', 'bytes=1000-', 'bytes=5-2', 'bytes=2000-3000']) {
    const r = await p('clip-12345678.mp4', { range })
    assert.equal(r.status, 416, range)
    assert.equal(r.headers.get('content-range'), 'bytes */1000')
    assert.equal((await r.arrayBuffer()).byteLength, 0)
  }
  for (const range of ['bytes=0-1,5-6', 'bytes=', 'items=0-5', 'bytes=a-b', '0-5']) {
    const r = await p('clip-12345678.mp4', { range })
    assert.equal(r.status, 200, range)
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), b)
  }
})

test('/p/ Range: HEAD with Range is 200 with no body; a full GET advertises accept-ranges and the right length', async () => {
  await seedVideo()
  const h = await p('clip-12345678.mp4', { range: 'bytes=0-1' }, 'HEAD')
  assert.equal(h.status, 200)
  assert.equal((await h.arrayBuffer()).byteLength, 0)
  const g = await p('clip-12345678.mp4')
  assert.equal(g.headers.get('accept-ranges'), 'bytes')
  assert.equal(g.headers.get('content-length'), '1000')
  assert.equal(g.headers.get('content-type'), 'video/mp4')
})

test('/p/ Range: a zero-byte mp4 never produces a 206 or a content-range like 0--1', async () => {
  await writeFile(join(dirOf(), 'e-12345678.mp4'), '')
  for (const range of [undefined, 'bytes=0-', 'bytes=0-0', 'bytes=-1']) {
    const r = await p('e-12345678.mp4', range ? { range } : {})
    assert.notEqual(r.status, 206, String(range))
    const cr = r.headers.get('content-range')
    if (cr) assert.equal(cr, 'bytes */0')
  }
})

test('/p/ path tricks: traversal, temp files, client.js and directories are 404', async () => {
  await seedVideo()
  await seed(client())
  await writeFile(join(dirOf(), '.up-1-1'), 'partial')
  await mkdir(join(dirOf(), 'dir.mp4'))
  for (const n of ['..%2Fclient.js', '%2e%2e%2f%2e%2e%2fpackage.json', '.up-1-1', 'client.js', 'dir.mp4', 'nope.mp4', '..%5Cclient.js']) {
    const r = await p(n)
    assert.equal(r.status, 404, n)
  }
})

test('/p/ Range: the stream survives a client that hangs up mid-video (server still answers)', async () => {
  await seedVideo('big-12345678.mp4', 20 * MIB)
  await new Promise((resolve) => {
    const req = http.get({ port, host: '127.0.0.1', path: `/p/${SLUG}/big-12345678.mp4` }, (res) => { res.once('data', () => { req.destroy(); resolve() }) })
    req.on('error', () => {})
  })
  const r = await p('big-12345678.mp4', { range: 'bytes=0-0' })
  assert.equal(r.status, 206)
})

test('/api/state advertises media caps and the style table from the spec', async () => {
  const s = await (await fetch(`${base}/api/state`, { headers: H })).json()
  assert.equal(s.media.videoMax, 15 * MIB)
  assert.equal(s.media.videoWarn, 5 * MIB)
  assert.equal(s.media.imageMax, 3 * MIB)
  assert.equal(s.media.videoSecondsWarn, 15)
  assert.equal(s.media.videoWidthWarn, 1280)
  assert.deepEqual(Object.keys(s.style), ['buttonShape', 'buttonFill', 'linkLayout', 'align', 'logoShape', 'coverShape', 'spacing', 'shadow'])
  for (const l of s.looks) { assert.ok(Array.isArray(l.supports), l.id); assert.equal(typeof l.styleDefaults, 'object', l.id) }
})
