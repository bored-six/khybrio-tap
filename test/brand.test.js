// The Khybrio logo in this repo is a copy of the main site's. These tests make sure the copy
// cannot go stale: change the logo on the main site and `npm test` here fails until you run
// `npm run sync-brand`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const sync = JSON.parse(await readFile(join(ROOT, 'brand/sync.json'), 'utf8'))
const lock = JSON.parse(await readFile(join(ROOT, 'brand/sync.lock.json'), 'utf8').catch(() => '{}'))
const sha = async (p) => createHash('sha256').update(await readFile(p)).digest('hex')
const exists = (p) => access(p).then(() => true, () => false)
const sourceRoot = join(ROOT, sync.source)

test('every synced brand file exists here and is recorded in the lock', async () => {
  for (const f of sync.files) {
    assert.ok(await exists(join(ROOT, f.to)), `${f.to} missing: run npm run sync-brand`)
    assert.ok(lock[f.to]?.sourceSha256, `${f.to} not in brand/sync.lock.json: run npm run sync-brand`)
    assert.equal(lock[f.to].from, f.from, `${f.to} was synced from a different file: run npm run sync-brand`)
    assert.equal(await sha(join(ROOT, f.to)), lock[f.to].outputSha256, `${f.to} was edited by hand: run npm run sync-brand`)
  }
})

test('synced brand files match the main site right now', { skip: !(await exists(sourceRoot)) && 'main Khybrio repo not next to this one (CI)' }, async () => {
  for (const f of sync.files) {
    assert.equal(await sha(join(sourceRoot, f.from)), lock[f.to]?.sourceSha256, `The main site's ${f.from} changed. Run: npm run sync-brand`)
  }
})

test("Khybrio's own page uses the synced logo, not some other file", async () => {
  const client = (await import(pathToFileURL(join(ROOT, 'clients/khybrio/client.js')).href)).default
  const synced = sync.files.find((f) => f.to.startsWith('clients/khybrio/'))
  assert.equal(`clients/khybrio/${client.logo}`, synced.to)
})

test('no old K-mark SVG is left in the Khybrio client folder', async () => {
  assert.ok(!(await exists(join(ROOT, 'clients/khybrio/logo.svg'))), 'old logo.svg still present')
})
