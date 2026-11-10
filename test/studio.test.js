// Studio API, written from the "Studio" section of .claude/specs/contract.md before the code existed.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createStudio } from '../src/studio/server.js'
import { svgProblem } from '../src/assets.js'
import { SITE_SUBPATH } from './helpers.js'

let root, server, base, publishCalls

const exists = (p) => access(p).then(() => true, () => false)
const H = { 'x-khybrio-studio': '1', 'content-type': 'application/json' }

const valid = (slug, extra = {}) => ({
  slug,
  name: `Client ${slug}`,
  look: 'card',
  theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#e8622d' },
  links: [{ kind: 'website', url: `https://example.com/${slug}` }],
  ...extra,
})

async function seed(folder, data) {
  await mkdir(join(root, 'clients', folder), { recursive: true })
  await writeFile(join(root, 'clients', folder, 'client.js'), typeof data === 'string' ? data : `export default ${JSON.stringify(data)}\n`)
}

const api = (path, { method = 'GET', body, headers = H, raw } = {}) =>
  fetch(base + path, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) })

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'khybrio-studio-'))
  publishCalls = 0
  server = createStudio({ root, site: SITE_SUBPATH, publish: async () => { publishCalls++; return { ok: true, output: 'published' } } })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
})
beforeEach(async () => {
  await rm(join(root, 'clients'), { recursive: true, force: true })
  await mkdir(join(root, 'clients'))
})

test('svgProblem flags script, handlers and foreignObject; passes plain SVG', () => {
  assert.equal(svgProblem('<svg><path d="M0 0"/></svg>'), null)
  for (const bad of ['<svg><script>1</script></svg>', '<svg><g onload="x"/></svg>', '<svg><g ONCLICK = "x"/></svg>', '<svg><foreignObject/></svg>']) {
    assert.equal(typeof svgProblem(bad), 'string', bad)
  }
})

test('every /api route refuses requests without the studio header', async () => {
  for (const [path, method] of [['/api/state', 'GET'], ['/api/clients/abc', 'GET'], ['/api/preview', 'POST'], ['/api/clients/abc', 'PUT'], ['/api/publish', 'POST']]) {
    const res = await api(path, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : {} })
    assert.equal(res.status, 403, `${method} ${path}`)
  }
  assert.equal(publishCalls, 0)
})

test('a foreign Origin is refused even with the header (blocks other websites)', async () => {
  const res = await api('/api/publish', { method: 'POST', headers: { ...H, origin: 'https://evil.example' }, body: {} })
  assert.equal(res.status, 403)
  assert.equal(publishCalls, 0)
  const ok = await api('/api/state', { headers: { ...H, origin: base } })
  assert.equal(ok.status, 200)
})

test('bad slugs never reach the filesystem', async () => {
  for (const slug of ['..', '..%2F..%2Fetc', 'Bad_Slug', '%2e%2e']) {
    const res = await api(`/api/clients/${slug}`)
    assert.ok([400, 404].includes(res.status), `${slug} -> ${res.status}`)
    assert.notEqual(res.status, 200)
  }
  const put = await api('/api/clients/..%2Fescape', { method: 'PUT', body: { data: valid('escape'), create: true } })
  assert.ok(put.status === 400 || put.status === 404, String(put.status))
  assert.ok(!(await exists(join(root, 'escape'))))
})

test('state lists clients sorted, skips _folders, survives a broken client.js', async () => {
  await seed('zeta-bar', valid('zeta-bar'))
  await seed('alpha-cafe', valid('alpha-cafe'))
  await seed('_template', valid('template'))
  await seed('broken-one', 'export default {{{ not js')
  const res = await api('/api/state')
  assert.equal(res.status, 200)
  const s = await res.json()
  assert.deepEqual(s.clients.map((c) => c.slug), ['alpha-cafe', 'broken-one', 'zeta-bar'])
  const alpha = s.clients[0]
  assert.equal(alpha.valid, true)
  assert.equal(alpha.liveUrl, 'https://bored-six.github.io/khybrio-tap/alpha-cafe/')
  assert.equal(alpha.linkCount, 1)
  assert.equal(s.clients[1].valid, false)
  assert.ok(s.looks.some((l) => l.id === 'card') && s.looks.some((l) => l.id === 'menu-board'))
  assert.ok(s.kinds.some((k) => k.id === 'phone' && k.scheme === 'tel:'))
  assert.ok(s.fonts.some((f) => f.id === 'fraunces'))
  assert.ok(Array.isArray(s.pending))
})

test('GET a client returns its raw data and regular files; 404 when missing', async () => {
  await seed('alpha-cafe', valid('alpha-cafe', { logo: 'logo.svg' }))
  await writeFile(join(root, 'clients', 'alpha-cafe', 'logo.svg'), '<svg/>')
  await mkdir(join(root, 'clients', 'alpha-cafe', 'subdir'))
  const res = await api('/api/clients/alpha-cafe')
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.data.name, 'Client alpha-cafe')
  assert.deepEqual(body.files, ['logo.svg'])
  assert.equal((await api('/api/clients/nobody-here')).status, 404)
})

test('preview renders valid data and reports errors for invalid data', async () => {
  const ok = await (await api('/api/preview', { method: 'POST', body: { slug: 'new-one', data: valid('new-one') } })).json()
  assert.equal(ok.ok, true, ok.errors?.join('\n'))
  assert.match(ok.html, /^<!doctype html>/i)
  assert.match(ok.html, /\/p\/fonts\//, 'preview fonts come from /p/fonts/')
  const bad = await (await api('/api/preview', { method: 'POST', body: { slug: 'new-one', data: valid('new-one', { theme: { bg: '#ffffff', ink: '#777777', accent: '#000000' } }) } })).json()
  assert.equal(bad.ok, false)
  assert.equal(bad.html, null)
  assert.ok(bad.errors.some((e) => e.startsWith('theme.ink')))
})

test('PUT create writes client.js that imports back to the same data', async () => {
  const data = valid('fresh-one', { tagline: 'Says "hi" & <b>' })
  const res = await api('/api/clients/fresh-one', { method: 'PUT', body: { data, create: true } })
  assert.equal(res.status, 200)
  const file = join(root, 'clients', 'fresh-one', 'client.js')
  const text = await readFile(file, 'utf8')
  assert.match(text, /^export default \{\n {2}"slug"/)
  const back = (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)).default
  assert.deepEqual(back, data)
})

test('PUT invalid data returns every error and writes nothing', async () => {
  await seed('keep-me', valid('keep-me'))
  const before = await readFile(join(root, 'clients', 'keep-me', 'client.js'), 'utf8')
  const res = await api('/api/clients/keep-me', { method: 'PUT', body: { data: valid('keep-me', { name: '', links: [] }), create: false } })
  assert.equal(res.status, 422)
  const body = await res.json()
  assert.ok(body.errors.some((e) => e.startsWith('name')) && body.errors.some((e) => e.startsWith('links')))
  assert.equal(await readFile(join(root, 'clients', 'keep-me', 'client.js'), 'utf8'), before)
})

test('PUT checks folder/slug agreement, create collisions and missing clients', async () => {
  await seed('taken-one', valid('taken-one'))
  assert.equal((await api('/api/clients/taken-one', { method: 'PUT', body: { data: valid('taken-one'), create: true } })).status, 409)
  assert.equal((await api('/api/clients/ghost-one', { method: 'PUT', body: { data: valid('ghost-one'), create: false } })).status, 404)
  const mismatch = await api('/api/clients/folder-a', { method: 'PUT', body: { data: valid('folder-b'), create: true } })
  assert.equal(mismatch.status, 422)
  assert.ok(!(await exists(join(root, 'clients', 'folder-a', 'client.js'))))
})

test('PUT referencing an uploaded logo validates against files on disk', async () => {
  const up = await api('/api/clients/logo-co/assets?name=Logo%20Mark.PNG', { method: 'POST', headers: { 'x-khybrio-studio': '1', 'content-type': 'image/png' }, raw: Buffer.from([0x89, 0x50, 0x4e, 0x47]) })
  assert.equal(up.status, 201)
  const { file } = await up.json()
  assert.equal(file, 'logo-mark.png')
  assert.equal((await api('/api/clients/logo-co', { method: 'PUT', body: { data: valid('logo-co', { logo: file }), create: true } })).status, 200)
  assert.equal((await api('/api/clients/logo-co', { method: 'PUT', body: { data: valid('logo-co', { logo: 'nope.png' }), create: false } })).status, 422)
})

test('asset upload rejects bad types, traversal names, oversize and unsafe SVG', async () => {
  const up = (name, body, type = 'application/octet-stream') =>
    api(`/api/clients/up-co/assets?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'x-khybrio-studio': '1', 'content-type': type }, raw: body })
  assert.equal((await up('evil.html', 'x')).status, 422)
  assert.equal((await up('../../escape.png', 'x')).status, 422)
  assert.equal((await up('a/b.png', 'x')).status, 422)
  assert.equal((await up('big.png', Buffer.alloc(3 * 1024 * 1024 + 1))).status, 422)
  assert.equal((await up('bad.svg', '<svg><script>1</script></svg>')).status, 422)
  assert.equal((await up('good.svg', '<svg><path d="M0 0"/></svg>')).status, 201)
  const files = await readdir(join(root, 'clients', 'up-co'))
  assert.deepEqual(files, ['good.svg'])
  assert.ok(!(await exists(join(root, 'escape.png'))))
})

test('oversized JSON bodies are refused', async () => {
  const res = await api('/api/preview', { method: 'POST', body: { slug: 'x-y', data: { pad: 'x'.repeat(300 * 1024) } } })
  assert.equal(res.status, 413)
})

test('publish calls the injected publisher', async () => {
  const res = await api('/api/publish', { method: 'POST', body: {} })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, output: 'published' })
  assert.equal(publishCalls, 1)
})

test('preview assets are served, and only from inside the client folder', async () => {
  await seed('pic-co', valid('pic-co'))
  await writeFile(join(root, 'clients', 'pic-co', 'logo.svg'), '<svg/>')
  await writeFile(join(root, 'secret.txt'), 'nope')
  assert.equal(await (await fetch(`${base}/p/pic-co/logo.svg`)).text(), '<svg/>')
  assert.notEqual((await fetch(`${base}/p/pic-co/..%2F..%2Fsecret.txt`)).status, 200)
  assert.equal((await fetch(`${base}/p/fonts/fraunces.woff2`)).status, 200)
})

test('a folder with uploads but no client.js is not listed (abandoned new page)', async () => {
  await seed('real-one', valid('real-one'))
  await mkdir(join(root, 'clients', 'orphan-up'))
  await writeFile(join(root, 'clients', 'orphan-up', 'logo.png'), 'x')
  const s = await (await api('/api/state')).json()
  assert.deepEqual(s.clients.map((c) => c.slug), ['real-one'])
})
