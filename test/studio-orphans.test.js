// Orphan cleanup is manifest-based: only files the server itself wrote via upload, not referenced by the
// saved client.js, and uploaded more than an hour ago, are ever deleted. Zero-byte uploads are refused.
// Manifest contract: <root>/.studio/uploads.json = { "<slug>": { "<file>": uploadedAtEpochMs } }
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStudio } from '../src/studio/server.js'
import { SITE_SUBPATH } from './helpers.js'
import { PNG, JPEG, mp4 } from './mp4-fixtures.js'

let root, server, base
const H = { 'x-khybrio-studio': '1' }
const SLUG = 'demo-shop'
const HOUR = 60 * 60 * 1000
const dirOf = (slug = SLUG) => join(root, 'clients', slug)
const ls = (slug = SLUG) => readdir(dirOf(slug)).catch(() => [])
const manifestPath = () => join(root, '.studio', 'uploads.json')
const readManifest = async () => JSON.parse(await readFile(manifestPath(), 'utf8'))
const writeManifest = async (m) => {
  await mkdir(join(root, '.studio'), { recursive: true })
  await writeFile(manifestPath(), JSON.stringify(m))
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'khybrio-orphans-'))
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
  await rm(join(root, '.studio'), { recursive: true, force: true })
  await mkdir(dirOf(), { recursive: true })
  await writeFile(join(dirOf(), 'client.js'), `export default ${JSON.stringify(client())}\n`)
})

const upload = (name, body, slug = SLUG) =>
  fetch(`${base}/api/clients/${slug}/assets?name=${encodeURIComponent(name)}`, { method: 'POST', headers: H, body })
const putClient = (data, slug = SLUG) =>
  fetch(`${base}/api/clients/${slug}`, { method: 'PUT', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ data }) })
const client = (extra = {}) => ({
  slug: SLUG, name: 'Demo', look: 'plain',
  theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#f2c14e' },
  blocks: [{ type: 'link', kind: 'website', url: 'https://example.com/x' }],
  ...extra,
})
// age every manifest entry of a slug by two hours
const age = async (slug = SLUG) => {
  const m = await readManifest()
  for (const f of Object.keys(m[slug] ?? {})) m[slug][f] -= 2 * HOUR
  await writeManifest(m)
}

test('manifest: an upload is recorded under its slug with a recent timestamp, no temp file left', async () => {
  const before = Date.now()
  const r = await upload('logo.png', PNG)
  assert.equal(r.status, 201, await r.clone().text())
  const m = await readManifest()
  assert.ok(m[SLUG]['logo.png'] >= before && m[SLUG]['logo.png'] <= Date.now())
  assert.deepEqual((await readdir(join(root, '.studio'))).filter((f) => f !== 'uploads.json'), [])
})

test('orphans: a file uploaded moments ago survives a PUT that does not reference it yet', async () => {
  assert.equal((await upload('fresh.jpg', JPEG)).status, 201)
  assert.equal((await putClient(client())).status, 200)
  assert.ok((await ls()).includes('fresh.jpg'))
})

test('orphans: an uploaded, unreferenced file older than 1 hour is deleted on save and leaves the manifest', async () => {
  assert.equal((await upload('old.jpg', JPEG)).status, 201)
  await age()
  assert.equal((await putClient(client())).status, 200)
  assert.ok(!(await ls()).includes('old.jpg'))
  assert.equal((await readManifest())[SLUG]?.['old.jpg'], undefined)
})

test('orphans: aged files referenced by logo, cover, background file and poster are kept', async () => {
  const bytes = { 'l.png': PNG, 'c.jpg': JPEG, 'clip-poster.jpg': JPEG, 'b.mp4': mp4({ codecs: ['avc1'] }) }
  const saved = {}
  for (const [n, b] of Object.entries(bytes)) {
    const r = await upload(n, b)
    assert.equal(r.status, 201)
    saved[n] = (await r.json()).file // mp4 names get a content hash
  }
  await age()
  const r = await putClient(client({ logo: 'l.png', cover: 'c.jpg', background: { type: 'video', file: saved['b.mp4'], poster: 'clip-poster.jpg' } }))
  assert.equal(r.status, 200, await r.clone().text())
  const left = await ls()
  for (const n of Object.values(saved)) assert.ok(left.includes(n), `deleted referenced ${n}`)
})

test('orphans: a studio poster name (clip-poster.jpg) is cleaned when manifest-listed, aged and unreferenced', async () => {
  assert.equal((await upload('clip-poster.jpg', JPEG)).status, 201)
  await age()
  await putClient(client())
  assert.ok(!(await ls()).includes('clip-poster.jpg'))
})

test('orphans: hand-placed files are never deleted, even with hashed-looking names and an old mtime', async () => {
  await writeFile(join(dirOf(), 'team-cafebabe.jpg'), 'x')
  await writeFile(join(dirOf(), 'promo-12345678.mp4'), 'x')
  await writeFile(join(dirOf(), 'photo.png'), 'x')
  assert.equal((await upload('old.jpg', JPEG)).status, 201)
  await age()
  await putClient(client())
  const left = await ls()
  for (const n of ['team-cafebabe.jpg', 'promo-12345678.mp4', 'photo.png']) assert.ok(left.includes(n), `deleted ${n}`)
})

test('orphans: a PUT for one client never deletes another client\'s manifest-listed files', async () => {
  await mkdir(dirOf('other-shop'), { recursive: true })
  await writeFile(join(dirOf('other-shop'), 'client.js'), `export default ${JSON.stringify(client({ slug: 'other-shop' }))}\n`)
  assert.equal((await upload('theirs.jpg', JPEG, 'other-shop')).status, 201)
  await age('other-shop')
  await putClient(client())
  assert.ok((await ls('other-shop')).includes('theirs.jpg'))
})

test('orphans: a manifest entry that is a path (../client.js, sub/x.jpg) never deletes anything', async () => {
  await writeFile(join(root, 'clients', 'keep.txt'), 'x')
  await writeManifest({ [SLUG]: { '../keep.txt': 1, '../../.studio/uploads.json': 1, 'client.js': 1, 'sub/x.jpg': 1 } })
  assert.equal((await putClient(client())).status, 200)
  assert.ok((await ls('')).includes('keep.txt') || (await readdir(join(root, 'clients'))).includes('keep.txt'))
  assert.ok((await ls()).includes('client.js'))
})

test('orphans: a rejected save (422) deletes nothing', async () => {
  assert.equal((await upload('old.jpg', JPEG)).status, 201)
  await age()
  assert.equal((await putClient(client({ look: 'nope' }))).status, 422)
  assert.ok((await ls()).includes('old.jpg'))
})

test('orphans: a corrupt manifest is treated as empty, never crashes the save and deletes nothing', async () => {
  await mkdir(join(root, '.studio'), { recursive: true })
  await writeFile(manifestPath(), '{not json')
  await writeFile(join(dirOf(), 'x.jpg'), 'x')
  assert.equal((await putClient(client())).status, 200)
  assert.ok((await ls()).includes('x.jpg'))
})

test('rename: manifest entries move with the client folder', async () => {
  assert.equal((await upload('old.jpg', JPEG)).status, 201)
  const r = await fetch(`${base}/api/clients/${SLUG}/rename`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ to: 'new-shop' }) })
  assert.equal(r.status, 200, await r.clone().text())
  const m = await readManifest()
  assert.equal(m[SLUG], undefined)
  assert.ok(m['new-shop']['old.jpg'])
})

for (const [name, why] of [['empty.png', 'png'], ['empty.jpg', 'jpg'], ['empty.webp', 'webp'], ['empty.svg', 'svg'], ['empty.mp4', 'mp4']]) {
  test(`upload: a zero-byte ${why} is rejected with 422 and nothing is written`, async () => {
    const r = await upload(name, Buffer.alloc(0))
    assert.equal(r.status, 422, await r.clone().text())
    assert.deepEqual((await ls()).filter((f) => f !== 'client.js'), [])
  })
}
