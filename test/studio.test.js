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
import { LIMITS } from '../src/validate.js'

let root, server, base, publishCalls, publishImpl

const exists = (p) => access(p).then(() => true, () => false)
const H = { 'x-khybrio-studio': '1', 'content-type': 'application/json' }

const valid = (slug, extra = {}) => ({
  slug,
  name: `Client ${slug}`,
  look: 'card',
  theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#e8622d' },
  blocks: [{ type: 'link', kind: 'website', url: `https://example.com/${slug}` }],
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
  publishImpl = async () => ({ ok: true, output: 'published' })
  server = createStudio({ root, site: SITE_SUBPATH, publish: async (opts) => { publishCalls++; return publishImpl(opts) } })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
})
beforeEach(async () => {
  publishImpl = async () => ({ ok: true, output: 'published' })
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
  for (const [path, method] of [['/api/state', 'GET'], ['/api/clients/abc', 'GET'], ['/api/preview', 'POST'], ['/api/clients/abc', 'PUT'], ['/api/publish', 'POST'], ['/api/clients/abc/rename', 'POST']]) {
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
  assert.equal(alpha.blockCount, 1)
  assert.equal('linkCount' in alpha, false, 'linkCount was replaced by blockCount')
  assert.ok(Array.isArray(alpha.warnings))
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
  assert.deepEqual(ok.warnings, [])
  const bad = await (await api('/api/preview', { method: 'POST', body: { slug: 'new-one', data: valid('new-one', { look: 'nope' }) } })).json()
  assert.equal(bad.ok, false)
  assert.equal(bad.html, null)
  assert.ok(bad.errors.some((e) => e.startsWith('look')))
})

test('preview of low-contrast colours renders and returns warnings instead of errors', async () => {
  const res = await (await api('/api/preview', { method: 'POST', body: { slug: 'pale-one', data: valid('pale-one', { theme: { bg: '#ffffff', ink: '#777777', accent: '#000000' } }) } })).json()
  assert.equal(res.ok, true, res.errors?.join('\n'))
  assert.match(res.html, /^<!doctype html>/i)
  assert.ok(res.warnings.some((w) => w.startsWith('theme.ink: contrast against bg is')))
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
  const res = await api('/api/clients/keep-me', { method: 'PUT', body: { data: valid('keep-me', { name: '', blocks: [] }), create: false } })
  assert.equal(res.status, 422)
  const body = await res.json()
  assert.ok(body.errors.some((e) => e.startsWith('name')) && body.errors.some((e) => e.startsWith('blocks')))
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

// QR codes: the QR must decode to exactly the page's live URL. A wrong QR is invisible until printed.
import { PNG } from 'pngjs'
import jsQR from 'jsqr'

async function decodePng(res) {
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()))
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null
}

test('QR PNG decodes to the live URL, at least 1000px for print', async () => {
  await seed('qr-cafe', valid('qr-cafe'))
  const res = await fetch(`${base}/qr/qr-cafe.png`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'image/png')
  const buf = Buffer.from(await res.clone().arrayBuffer())
  assert.ok(PNG.sync.read(buf).width >= 1000)
  assert.equal(await decodePng(res), 'https://bored-six.github.io/khybrio-tap/qr-cafe/')
})

test('QR SVG is a plain vector image with no script', async () => {
  await seed('qr-cafe', valid('qr-cafe'))
  const res = await fetch(`${base}/qr/qr-cafe.svg`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /image\/svg\+xml/)
  const svg = await res.text()
  assert.match(svg, /<svg\b/)
  assert.equal(svgProblem(svg), null)
})

test('QR download sets a file name; unknown, invalid or broken slugs get no QR', async () => {
  await seed('qr-cafe', valid('qr-cafe'))
  const dl = await fetch(`${base}/qr/qr-cafe.png?download=1`)
  assert.match(dl.headers.get('content-disposition') || '', /attachment; filename="qr-cafe-qr\.png"/)
  assert.equal((await fetch(`${base}/qr/nobody-here.png`)).status, 404)
  assert.equal((await fetch(`${base}/qr/Bad_Slug.png`)).status, 404)
  assert.equal((await fetch(`${base}/qr/qr-cafe.gif`)).status, 404)
  await seed('qr-broken', 'export default {{{')
  assert.equal((await fetch(`${base}/qr/qr-broken.png`)).status, 404, 'no QR for a page that cannot build')
})

// ---- v2: migration, state fields, rename, publish ----------------------------------------------

const importBack = async (file) => (await import(`${pathToFileURL(file).href}?t=${Date.now()}${Math.random()}`)).default
const v1Data = (slug) => ({
  slug,
  name: `Client ${slug}`,
  look: 'card',
  theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#e8622d' },
  font: { display: 'fraunces', body: 'inter' },
  links: [{ kind: 'website', url: `https://example.com/${slug}`, label: 'Our site' }],
})

test('GET returns migrated (v2) data for a v1 client.js, the file itself untouched', async () => {
  await seed('old-style', v1Data('old-style'))
  const file = join(root, 'clients', 'old-style', 'client.js')
  const before = await readFile(file, 'utf8')
  const body = await (await api('/api/clients/old-style')).json()
  assert.equal('links' in body.data, false)
  assert.deepEqual(body.data.blocks, [{ type: 'link', kind: 'website', url: 'https://example.com/old-style', label: 'Our site' }])
  assert.deepEqual(body.data.font, { heading: 'fraunces', tagline: 'inter', body: 'inter' })
  assert.equal(await readFile(file, 'utf8'), before, 'a GET never rewrites the file')
})

test('PUT of v1 data writes migrated v2 data', async () => {
  const res = await api('/api/clients/old-put', { method: 'PUT', body: { data: v1Data('old-put'), create: true } })
  assert.equal(res.status, 200, await res.clone().text())
  const back = await importBack(join(root, 'clients', 'old-put', 'client.js'))
  assert.equal('links' in back, false)
  assert.deepEqual(back.blocks, [{ type: 'link', kind: 'website', url: 'https://example.com/old-put', label: 'Our site' }])
  assert.deepEqual(back.font, { heading: 'fraunces', tagline: 'inter', body: 'inter' })
})

test('PUT and preview responses carry warnings', async () => {
  const pale = valid('pale-put', { theme: { bg: '#ffffff', ink: '#777777', accent: '#000000' } })
  const res = await api('/api/clients/pale-put', { method: 'PUT', body: { data: pale, create: true } })
  assert.equal(res.status, 200, 'low contrast must not block saving')
  const body = await res.json()
  assert.ok(body.warnings.some((w) => w.startsWith('theme.ink: contrast against bg is')), JSON.stringify(body))
  const clean = await (await api('/api/clients/clean-put', { method: 'PUT', body: { data: valid('clean-put'), create: true } })).json()
  assert.deepEqual(clean.warnings, [])
})

test('state carries backup, palettes, limits, fonts and kinds for the editor', async () => {
  await seed('pale-one', valid('pale-one', { theme: { bg: '#ffffff', ink: '#777777', accent: '#000000' } }))
  const s = await (await api('/api/state')).json()
  assert.equal(s.backup.state, 'idle')
  assert.ok(s.palettes.length >= 1)
  for (const p of s.palettes) assert.deepEqual(Object.keys(p).sort(), ['accent', 'bg', 'id', 'ink', 'label'])
  assert.deepEqual(s.limits, LIMITS)
  for (const f of s.fonts) assert.deepEqual(Object.keys(f).sort(), ['body', 'family', 'group', 'id'])
  assert.ok(s.fonts.some((f) => f.id === 'fraunces' && f.group === 'serif' && f.body === true))
  assert.ok(s.fonts.some((f) => f.body === false), 'some fonts are heading-only')
  for (const k of s.kinds) assert.deepEqual(Object.keys(k).sort(), ['id', 'label', 'scheme', 'social'])
  assert.ok(s.kinds.some((k) => k.id === 'viber' && k.scheme === 'viber:' && k.social === true))
  assert.ok(s.kinds.some((k) => k.id === 'custom' && k.social === false))
  const pale = s.clients.find((c) => c.slug === 'pale-one')
  assert.equal(pale.valid, true)
  assert.ok(pale.warnings.some((w) => w.startsWith('theme.ink')))
})

const rename = (slug, to) => api(`/api/clients/${slug}/rename`, { method: 'POST', body: { to } })
const readRedirects = async () => JSON.parse(await readFile(join(root, 'clients', '_redirects.json'), 'utf8'))

test('rename moves the folder, rewrites slug, records the redirect', async () => {
  await seed('alpha-cafe', valid('alpha-cafe', { logo: 'logo.svg' }))
  await writeFile(join(root, 'clients', 'alpha-cafe', 'logo.svg'), '<svg/>')
  const res = await rename('alpha-cafe', 'beta-cafe')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, slug: 'beta-cafe' })
  assert.ok(!(await exists(join(root, 'clients', 'alpha-cafe'))))
  assert.equal(await readFile(join(root, 'clients', 'beta-cafe', 'logo.svg'), 'utf8'), '<svg/>')
  assert.deepEqual(await importBack(join(root, 'clients', 'beta-cafe', 'client.js')), valid('beta-cafe', { logo: 'logo.svg' }))
  assert.deepEqual(await readRedirects(), { 'alpha-cafe': 'beta-cafe' })
  const s = await (await api('/api/state')).json()
  assert.deepEqual(s.clients.map((c) => c.slug), ['beta-cafe'])
})

test('rename twice flattens the redirects, and renaming back reclaims the old address', async () => {
  await seed('aaa-one', valid('aaa-one'))
  assert.equal((await rename('aaa-one', 'bbb-two')).status, 200)
  assert.equal((await rename('bbb-two', 'ccc-three')).status, 200)
  assert.deepEqual(await readRedirects(), { 'aaa-one': 'ccc-three', 'bbb-two': 'ccc-three' })
  assert.equal((await rename('ccc-three', 'aaa-one')).status, 200)
  assert.deepEqual(await readRedirects(), { 'bbb-two': 'aaa-one', 'ccc-three': 'aaa-one' })
  assert.ok(await exists(join(root, 'clients', 'aaa-one', 'client.js')))
  assert.equal((await importBack(join(root, 'clients', 'aaa-one', 'client.js'))).slug, 'aaa-one')
})

test('rename: 404 for a missing page, 422 for bad or reserved addresses, 409 for taken ones', async () => {
  await seed('alpha-cafe', valid('alpha-cafe'))
  await seed('beta-cafe', valid('beta-cafe'))
  await seed('broken-one', 'export default {{{ not js')
  const nobody = await rename('nobody-here', 'new-name')
  assert.equal(nobody.status, 404)
  assert.equal(typeof (await nobody.json()).error, 'string')
  for (const bad of ['Bad_Slug', 'a', 'api', 'media', 'fonts', 'alpha-cafe', '']) {
    const r = await rename('alpha-cafe', bad)
    assert.equal(r.status, 422, `to=${JSON.stringify(bad)}`)
    assert.equal(typeof (await r.json()).error, 'string')
  }
  const live = await rename('alpha-cafe', 'beta-cafe')
  assert.equal(live.status, 409)
  assert.deepEqual(await live.json(), { error: 'address already used by a page' })
  assert.equal((await rename('alpha-cafe', 'broken-one')).status, 409, 'any folder in clients/ blocks the address')
  assert.ok(await exists(join(root, 'clients', 'alpha-cafe', 'client.js')), 'a refused rename changes nothing')
  assert.ok(!(await exists(join(root, 'clients', '_redirects.json'))))
})

test('rename: an address other pages left redirects for is taken', async () => {
  await seed('alpha-cafe', valid('alpha-cafe'))
  await seed('gamma-bar', valid('gamma-bar'))
  assert.equal((await rename('alpha-cafe', 'beta-cafe')).status, 200)
  const r = await rename('gamma-bar', 'alpha-cafe')
  assert.equal(r.status, 409)
  assert.deepEqual(await r.json(), { error: 'old cards for "beta-cafe" use this address' })
})

test('rename: if a step fails everything is put back and the answer is 500', async () => {
  await seed('alpha-cafe', valid('alpha-cafe', { logo: 'logo.svg' }))
  await writeFile(join(root, 'clients', 'alpha-cafe', 'logo.svg'), '<svg/>')
  await mkdir(join(root, 'clients', '_redirects.json')) // a directory where the file must go: the last step cannot succeed
  const r = await rename('alpha-cafe', 'beta-cafe')
  assert.equal(r.status, 500)
  assert.ok(!(await exists(join(root, 'clients', 'beta-cafe'))))
  assert.equal(await readFile(join(root, 'clients', 'alpha-cafe', 'logo.svg'), 'utf8'), '<svg/>')
  assert.equal((await importBack(join(root, 'clients', 'alpha-cafe', 'client.js'))).slug, 'alpha-cafe')
})

test('PUT create on an address that only has a redirect record is 409', async () => {
  await seed('alpha-cafe', valid('alpha-cafe'))
  assert.equal((await rename('alpha-cafe', 'beta-cafe')).status, 200)
  const res = await api('/api/clients/alpha-cafe', { method: 'PUT', body: { data: valid('alpha-cafe'), create: true } })
  assert.equal(res.status, 409)
  assert.ok(!(await exists(join(root, 'clients', 'alpha-cafe'))))
})

test('publish passes force through to the publisher', async () => {
  let seen
  publishImpl = async (opts) => ((seen = opts), { ok: true, output: 'published' })
  assert.equal((await api('/api/publish', { method: 'POST', body: { force: true } })).status, 200)
  assert.equal(seen.force, true)
  assert.equal((await api('/api/publish', { method: 'POST', body: {} })).status, 200)
  assert.ok(!seen.force)
})

test('a second publish while one is running is 409', async () => {
  let release
  const gate = new Promise((r) => (release = r))
  publishImpl = async () => (await gate, { ok: true, output: 'published' })
  const before = publishCalls
  const first = api('/api/publish', { method: 'POST', body: {} })
  for (let i = 0; i < 100 && publishCalls === before; i++) await new Promise((r) => setTimeout(r, 10))
  assert.equal(publishCalls, before + 1, 'first publish started')
  const second = await api('/api/publish', { method: 'POST', body: {} })
  assert.equal(second.status, 409)
  assert.equal(publishCalls, before + 1, 'the second never reached the publisher')
  release()
  assert.equal((await first).status, 200)
  assert.equal((await api('/api/publish', { method: 'POST', body: {} })).status, 200, 'a finished publish frees the lock')
})

const waitForBackup = async (want) => {
  for (let i = 0; i < 100; i++) {
    const s = await (await api('/api/state')).json()
    if (s.backup.state === want) return s.backup
    await new Promise((r) => setTimeout(r, 10))
  }
  assert.fail(`backup never became ${want}`)
}

test('backup state: pushing while the git push runs, idle when it succeeds', async () => {
  let done
  publishImpl = async () => ({ ok: true, output: 'published', backup: 'committed', push: new Promise((r) => (done = r)) })
  assert.equal((await api('/api/publish', { method: 'POST', body: {} })).status, 200)
  assert.equal((await (await api('/api/state')).json()).backup.state, 'pushing')
  done()
  const b = await waitForBackup('idle')
  assert.ok(b.at)
})

test('backup state: failed when the git push rejects', async () => {
  let fail
  publishImpl = async () => ({ ok: true, output: 'published', backup: 'committed', push: new Promise((_, rej) => (fail = rej)) })
  await api('/api/publish', { method: 'POST', body: {} })
  fail(new Error('push rejected'))
  const b = await waitForBackup('failed')
  assert.equal(typeof b.output, 'string')
  assert.ok(b.at)
})
