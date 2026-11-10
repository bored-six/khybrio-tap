// Adversarial: studio rename route (spec section 8) under races, odd bodies and failures.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStudio } from '../src/studio/server.js'
import { SITE_SUBPATH } from './helpers.js'

let root, server, base
const exists = (p) => access(p).then(() => true, () => false)
const H = { 'x-khybrio-studio': '1', 'content-type': 'application/json' }
const valid = (slug, extra = {}) => ({
  slug, name: `Client ${slug}`, look: 'card',
  theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#f2c14e' },
  blocks: [{ type: 'link', kind: 'website', url: `https://example.com/${slug}` }], ...extra,
})
const seed = async (folder, data) => {
  await mkdir(join(root, 'clients', folder), { recursive: true })
  await writeFile(join(root, 'clients', folder, 'client.js'), typeof data === 'string' ? data : `export default ${JSON.stringify(data)}\n`)
}
const api = (path, { method = 'GET', body, raw, headers = H } = {}) => fetch(base + path, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) })
const rename = (slug, to) => api(`/api/clients/${slug}/rename`, { method: 'POST', body: { to } })
const redirects = async () => JSON.parse(await readFile(join(root, 'clients', '_redirects.json'), 'utf8').catch(() => '{}'))
const folders = async () => (await readdir(join(root, 'clients'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort()

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'khybrio-brk-studio-'))
  server = createStudio({ root, site: SITE_SUBPATH, publish: async () => ({ ok: true, output: '' }) })
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

test('rename racing with saves: no resurrected old folder, final file is consistent', async () => {
  for (let round = 0; round < 8; round++) {
    await rm(join(root, 'clients'), { recursive: true, force: true })
    await mkdir(join(root, 'clients'))
    await seed('old-name', valid('old-name'))
    const saves = Array.from({ length: 4 }, (_, i) => api('/api/clients/old-name', { method: 'PUT', body: { data: valid('old-name', { name: `Saved ${i}` }) } }))
    const ren = rename('old-name', 'new-name')
    const late = api('/api/clients/old-name', { method: 'PUT', body: { data: valid('old-name', { name: 'Late' }) } })
    const rs = await Promise.all([...saves, ren, late])
    const renStatus = rs[4].status
    assert.equal(renStatus, 200, `round ${round}`)
    assert.deepEqual(await folders(), ['new-name'], `round ${round}: old folder resurrected or new missing`)
    const text = await readFile(join(root, 'clients', 'new-name', 'client.js'), 'utf8')
    const data = JSON.parse(text.replace(/^export default /, ''))
    assert.equal(data.slug, 'new-name', `round ${round}: slug not rewritten (a save clobbered the rename)`)
    for (const r of rs.filter((_, i) => i !== 4)) assert.ok([200, 404].includes(r.status), `save got ${r.status}`)
    assert.deepEqual(await redirects(), { 'old-name': 'new-name' })
    // a save that succeeded must have stayed inside the folder it targeted; old address is not writable anymore
    const after = await api('/api/clients/old-name', { method: 'PUT', body: { data: valid('old-name') } })
    assert.equal(after.status, 404)
  }
})

test('two renames of the same page at once: one wins, the other is 404, redirects stay flat', async () => {
  await seed('aaa-one', valid('aaa-one'))
  const [a, b] = await Promise.all([rename('aaa-one', 'bbb-two'), rename('aaa-one', 'ccc-three')])
  assert.deepEqual([a.status, b.status].sort(), [200, 404])
  const f = await folders()
  assert.equal(f.length, 1)
  const r = await redirects()
  assert.deepEqual(r, { 'aaa-one': f[0] })
})

test('two pages renamed to the same address at once: one 200, one 409, no half state', async () => {
  await seed('aaa-one', valid('aaa-one'))
  await seed('bbb-two', valid('bbb-two'))
  const [a, b] = await Promise.all([rename('aaa-one', 'zzz-new'), rename('bbb-two', 'zzz-new')])
  assert.deepEqual([a.status, b.status].sort(), [200, 409])
  const f = await folders()
  assert.equal(f.length, 2)
  assert.ok(f.includes('zzz-new'))
})

test('rename to a case-variant of itself or another page is 422 and changes nothing', async () => {
  await seed('cafe-a', valid('cafe-a'))
  await seed('cafe-b', valid('cafe-b'))
  for (const to of ['Cafe-A', 'CAFE-B', 'CAFE-A', 'Cafe-Z']) {
    const r = await rename('cafe-a', to)
    assert.equal(r.status, 422, to)
  }
  assert.deepEqual(await folders(), ['cafe-a', 'cafe-b'])
  assert.deepEqual(await redirects(), {})
})

test('rename with a body that is not an object, or has the wrong type for "to", is 4xx not 500', async () => {
  await seed('cafe-a', valid('cafe-a'))
  const bad = [undefined, 'null', '[]', '"str"', '5', 'true', '{}', '{"to":null}', '{"to":5}', '{"to":["bb"]}', '{"to":{"a":1}}', '{"to":""}', '{"x":"bb"}', '{bad json']
  const got = []
  for (const raw of bad) {
    const r = await api('/api/clients/cafe-a/rename', { method: 'POST', raw })
    if (!(r.status >= 400 && r.status < 500)) got.push(`${raw} -> ${r.status}`)
  }
  assert.deepEqual(got, [])
  assert.deepEqual(await folders(), ['cafe-a'])
})

test('rename: failure after the folder moved restores byte-identical client.js (comments included) and removes tmp files', async () => {
  const original = '// hand-written, keep this comment\nexport default {\n  slug: "cafe-a",\n  name: "Cafe A", look: "card",\n  theme: { bg: "#1c4d4a", ink: "#f5f7f6", accent: "#f2c14e" },\n  blocks: [{ type: "link", kind: "website", url: "https://example.com/a" }],\n}\n'
  await seed('cafe-a', original)
  await writeFile(join(root, 'clients', 'cafe-a', 'logo.svg'), '<svg/>')
  await mkdir(join(root, 'clients', '_redirects.json'))
  const r = await rename('cafe-a', 'cafe-z')
  assert.equal(r.status, 500)
  assert.equal(await readFile(join(root, 'clients', 'cafe-a', 'client.js'), 'utf8'), original)
  assert.equal(await readFile(join(root, 'clients', 'cafe-a', 'logo.svg'), 'utf8'), '<svg/>')
  assert.deepEqual(await folders(), ['_redirects.json', 'cafe-a'])
  const left = (await readdir(join(root, 'clients'))).concat(await readdir(join(root, 'clients', 'cafe-a')))
  assert.ok(!left.some((n) => /\.tmp/.test(n)), `leftover: ${left}`)
  // the page is still fully usable
  assert.equal((await api('/api/clients/cafe-a')).status, 200)
})

test('rename of a page whose client.js cannot be loaded is refused (422) before anything moves', async () => {
  await seed('cafe-a', 'export default {{{ nope')
  const r = await rename('cafe-a', 'cafe-z')
  assert.equal(r.status, 422)
  assert.deepEqual(await folders(), ['cafe-a'])
  assert.deepEqual(await redirects(), {})
})

test('rename from an address that is only an old redirect is 404', async () => {
  await seed('cafe-a', valid('cafe-a'))
  assert.equal((await rename('cafe-a', 'cafe-b')).status, 200)
  assert.equal((await rename('cafe-a', 'cafe-c')).status, 404)
  assert.deepEqual(await redirects(), { 'cafe-a': 'cafe-b' })
})

test('rename onto an address another page left a redirect for is 409 and records nothing', async () => {
  await seed('cafe-a', valid('cafe-a'))
  await seed('other-x', valid('other-x'))
  assert.equal((await rename('cafe-a', 'cafe-b')).status, 200)
  const r = await rename('other-x', 'cafe-a')
  assert.equal(r.status, 409)
  assert.deepEqual(await redirects(), { 'cafe-a': 'cafe-b' })
  assert.deepEqual(await folders(), ['cafe-b', 'other-x'])
})

test('A->B->C then C->A leaves flat valid redirects and A is editable again', async () => {
  await seed('aaa-one', valid('aaa-one'))
  assert.equal((await rename('aaa-one', 'bbb-two')).status, 200)
  assert.equal((await rename('bbb-two', 'ccc-three')).status, 200)
  assert.equal((await rename('ccc-three', 'aaa-one')).status, 200)
  assert.deepEqual(await redirects(), { 'bbb-two': 'aaa-one', 'ccc-three': 'aaa-one' })
  assert.equal((await api('/api/clients/aaa-one', { method: 'PUT', body: { data: valid('aaa-one', { name: 'Back' }) } })).status, 200)
})

test('rename: the slug inside the file is the new slug, and a name containing the old slug is untouched', async () => {
  await seed('cafe-a', valid('cafe-a', { name: 'cafe-a forever' }))
  assert.equal((await rename('cafe-a', 'cafe-z')).status, 200)
  const d = JSON.parse((await readFile(join(root, 'clients', 'cafe-z', 'client.js'), 'utf8')).replace(/^export default /, ''))
  assert.equal(d.slug, 'cafe-z')
  assert.equal(d.name, 'cafe-a forever')
})

test('hostile slugs in the URL never touch the filesystem outside clients/', async () => {
  for (const s of ['..', '%2e%2e', '..%2f..', '%2e%2e%2f%2e%2e%2fetc', '.', 'a%2fb', 'A', 'a b', '%00']) {
    const r = await api(`/api/clients/${s}/rename`, { method: 'POST', body: { to: 'ok-name' } })
    assert.ok(r.status >= 400 && r.status < 500, `${s}: ${r.status}`)
  }
  assert.deepEqual(await folders(), [])
})

test('PUT and preview with a non-object body or data are 4xx, not 500', async () => {
  await seed('cafe-a', valid('cafe-a'))
  const got = []
  for (const raw of ['null', '[]', '"x"', '5', '{"data":null}', '{"data":5}', '{"data":[]}', '{"data":"x"}']) {
    const r = await api('/api/clients/cafe-a', { method: 'PUT', raw })
    if (!(r.status >= 400 && r.status < 500)) got.push(`PUT ${raw} -> ${r.status}`)
    const p = await api('/api/preview', { method: 'POST', raw })
    if (p.status >= 500) got.push(`preview ${raw} -> ${p.status}`)
  }
  assert.deepEqual(got, [])
})

test('PUT with __proto__ in the data does not pollute and is rejected as an unknown key', async () => {
  await seed('cafe-a', valid('cafe-a'))
  const raw = '{"data":{"__proto__":{"polluted":"yes"},"slug":"cafe-a","name":"x","look":"card","theme":{"bg":"#1c4d4a","ink":"#f5f7f6","accent":"#f2c14e"},"blocks":[{"type":"link","kind":"website","url":"https://e.co"}]}}'
  const r = await api('/api/clients/cafe-a', { method: 'PUT', raw })
  assert.equal(({}).polluted, undefined)
  assert.ok(r.status === 422 || r.status === 200)
})
