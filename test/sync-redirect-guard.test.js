// Redirect delete guard: a build with no _redirect/* keys must not wipe the bucket's old NFC redirects.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { syncDir } from '../src/publish/sync.js'

const md5 = (b) => createHash('md5').update(b).digest('hex')
async function setup(files) {
  const dir = await mkdtemp(join(tmpdir(), 'khybrio-redir-'))
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(join(dir, dirname(rel)), { recursive: true })
    await writeFile(join(dir, rel), body)
  }
  return dir
}
function fakeStore(initial) {
  const live = new Map(Object.entries(initial).map(([k, v]) => [k, md5(v)]))
  const dels = []
  return { dels, list: async () => live, put: async (k, b) => live.set(k, md5(b)), del: async (k) => { dels.push(k); live.delete(k) } }
}

test('refuses when local has no _redirect keys but the bucket does', async () => {
  const dir = await setup({ 'a/index.html': 'A' })
  const store = fakeStore({ 'a/index.html': 'A', '_redirect/abc': '/a/' })
  try {
    await assert.rejects(syncDir({ dir, store }), /redirect/i)
    assert.deepEqual(store.dels, [])
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('force allows it', async () => {
  const dir = await setup({ 'a/index.html': 'A' })
  const store = fakeStore({ 'a/index.html': 'A', '_redirect/abc': '/a/' })
  try {
    const r = await syncDir({ dir, store, force: true })
    assert.deepEqual(r.deleted, ['_redirect/abc'])
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('deleting one redirect is fine when local still has redirects', async () => {
  const dir = await setup({ 'a/index.html': 'A', '_redirect/keep': '/a/' })
  const store = fakeStore({ 'a/index.html': 'A', '_redirect/keep': '/a/', '_redirect/old': '/a/' })
  try {
    const r = await syncDir({ dir, store })
    assert.deepEqual(r.deleted, ['_redirect/old'])
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('no redirects on either side is fine', async () => {
  const dir = await setup({ 'a/index.html': 'A' })
  const store = fakeStore({ 'a/index.html': 'A' })
  try {
    const r = await syncDir({ dir, store })
    assert.deepEqual(r.deleted, [])
  } finally { await rm(dir, { recursive: true, force: true }) }
})
