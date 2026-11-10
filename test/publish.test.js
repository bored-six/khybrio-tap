// Publish pipeline, written from section 10 of .claude/specs/mvp-showcase.md before the code existed.
// Fakes: an in-memory bucket store and a fake git. Nothing here touches Cloudflare or the network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadEnv } from '../src/publish/env.js'
import { syncDir } from '../src/publish/sync.js'
import { publishLive } from '../src/publish/index.js'
import { SITE, SITE_SUBPATH } from './helpers.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const md5 = (b) => createHash('md5').update(b).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const cleanups = []
const tmp = async (prefix) => {
  const d = await mkdtemp(join(tmpdir(), `khybrio-pub-${prefix}-`))
  cleanups.push(d)
  return d
}
test.after(() => Promise.all(cleanups.map((d) => rm(d, { recursive: true, force: true }))))

async function writeTree(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(join(dir, dirname(rel)), { recursive: true })
    await writeFile(join(dir, rel), body)
  }
}

// In-memory R2 stand-in. `initial` maps key -> body (its md5 is what list() reports).
// `done` records the order operations FINISH in; html is made fast and assets slow on purpose,
// so an implementation that does not really sequence the groups gets caught.
function fakeStore(initial = {}) {
  const state = new Map(Object.entries(initial).map(([k, v]) => [k, md5(v)]))
  const store = {
    puts: [],
    dels: [],
    done: [],
    calls: 0,
    inflight: 0,
    maxInflight: 0,
    async list() {
      store.calls++
      return new Map(state)
    },
    async put(key, buf, meta) {
      store.calls++
      store.inflight++
      store.maxInflight = Math.max(store.maxInflight, store.inflight)
      await sleep(key.endsWith('.html') ? 1 : key.startsWith('_redirect/') ? 8 : 15)
      store.inflight--
      store.puts.push({ key, buf, meta })
      state.set(key, md5(buf))
      store.done.push(['put', key])
    },
    async del(key) {
      store.calls++
      await sleep(1)
      state.delete(key)
      store.dels.push(key)
      store.done.push(['del', key])
    },
  }
  return store
}

// ---- loadEnv -------------------------------------------------------------------------------

test('loadEnv reads the four Cloudflare keys from .env.local', async () => {
  const root = await tmp('env')
  await writeFile(
    join(root, '.env.local'),
    '# comment\nCF_ACCOUNT_ID=acc123\nR2_BUCKET="khybrio-tap"\nR2_ACCESS_KEY_ID=keyid\nR2_SECRET_ACCESS_KEY=shh\n',
  )
  const res = loadEnv(root)
  assert.equal(res.ok, true)
  assert.deepEqual(res.missing, [])
  assert.equal(res.env.CF_ACCOUNT_ID, 'acc123')
  assert.equal(res.env.R2_BUCKET, 'khybrio-tap')
  assert.equal(res.env.R2_ACCESS_KEY_ID, 'keyid')
  assert.equal(res.env.R2_SECRET_ACCESS_KEY, 'shh')
})

test('loadEnv names every missing key, and a missing file misses all four', async () => {
  const root = await tmp('env')
  const none = loadEnv(root)
  assert.equal(none.ok, false)
  assert.deepEqual([...none.missing].sort(), ['CF_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_BUCKET', 'R2_SECRET_ACCESS_KEY'])
  await writeFile(join(root, '.env.local'), 'CF_ACCOUNT_ID=a\nR2_BUCKET=b\n')
  const some = loadEnv(root)
  assert.equal(some.ok, false)
  assert.deepEqual([...some.missing].sort(), ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'])
})

// ---- syncDir -------------------------------------------------------------------------------

const SITE_FILES = {
  'index.html': '<p>root</p>',
  '404.html': '<p>nf</p>',
  'alpha-cafe/index.html': '<p>alpha</p>',
  'alpha-cafe/logo.svg': '<svg/>',
  'alpha-cafe/cover.jpg': 'JPG',
  'alpha-cafe/b.jpeg': 'JPEG',
  'alpha-cafe/photo.png': 'PNG',
  'alpha-cafe/pic.webp': 'WEBP',
  'fonts/f.woff2': 'FONT',
  '_redirect/old-name': 'alpha-cafe',
}

test('syncDir into an empty store uploads every file and reports it', async () => {
  const dir = await tmp('dir')
  await writeTree(dir, SITE_FILES)
  const store = fakeStore()
  const res = await syncDir({ dir, store })
  assert.deepEqual([...res.uploaded].sort(), Object.keys(SITE_FILES).sort())
  assert.deepEqual(res.deleted, [])
  assert.equal(res.unchanged, 0)
  for (const p of store.puts) assert.equal(p.buf.toString(), SITE_FILES[p.key], p.key)
})

test('syncDir sets metadata by file type', async () => {
  const dir = await tmp('dir')
  await writeTree(dir, SITE_FILES)
  const store = fakeStore()
  await syncDir({ dir, store })
  const meta = Object.fromEntries(store.puts.map((p) => [p.key, p.meta]))
  const HTML = { contentType: 'text/html; charset=utf-8', cacheControl: 'no-cache' }
  const IMG = (contentType) => ({ contentType, cacheControl: 'public, max-age=300' })
  assert.deepEqual(meta['index.html'], HTML)
  assert.deepEqual(meta['404.html'], HTML)
  assert.deepEqual(meta['alpha-cafe/index.html'], HTML)
  assert.deepEqual(meta['fonts/f.woff2'], { contentType: 'font/woff2', cacheControl: 'public, max-age=604800' })
  assert.deepEqual(meta['_redirect/old-name'], { contentType: 'text/plain', cacheControl: 'no-store' })
  assert.deepEqual(meta['alpha-cafe/logo.svg'], IMG('image/svg+xml'))
  assert.deepEqual(meta['alpha-cafe/cover.jpg'], IMG('image/jpeg'))
  assert.deepEqual(meta['alpha-cafe/b.jpeg'], IMG('image/jpeg'))
  assert.deepEqual(meta['alpha-cafe/photo.png'], IMG('image/png'))
  assert.deepEqual(meta['alpha-cafe/pic.webp'], IMG('image/webp'))
})

test('syncDir uploads only what differs by md5 and counts the rest as unchanged', async () => {
  const dir = await tmp('dir')
  await writeTree(dir, SITE_FILES)
  const store = fakeStore({
    ...SITE_FILES,
    'fonts/f.woff2': 'OLD FONT BYTES',
    'alpha-cafe/index.html': '<p>stale</p>',
  })
  const res = await syncDir({ dir, store })
  assert.deepEqual([...res.uploaded].sort(), ['alpha-cafe/index.html', 'fonts/f.woff2'])
  assert.equal(res.unchanged, Object.keys(SITE_FILES).length - 2)
  assert.deepEqual(store.puts.map((p) => p.key).sort(), ['alpha-cafe/index.html', 'fonts/f.woff2'])
})

test('syncDir order: assets, then _redirect, then html, then deletes (by completion)', async () => {
  const dir = await tmp('dir')
  await writeTree(dir, SITE_FILES)
  const store = fakeStore({ 'gone/index.html': 'x', 'gone/logo.png': 'x', 'fonts/gone.woff2': 'x' })
  await syncDir({ dir, store })
  const rank = ([op, key]) => (op === 'del' ? 3 : key.endsWith('.html') ? 2 : key.startsWith('_redirect/') ? 1 : 0)
  const ranks = store.done.map(rank)
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `finish order: ${JSON.stringify(store.done)}`)
  assert.ok(ranks.includes(0) && ranks.includes(1) && ranks.includes(2) && ranks.includes(3))
})

test('syncDir deletes keys that are no longer built but never touches media/', async () => {
  const dir = await tmp('dir')
  await writeTree(dir, SITE_FILES)
  const store = fakeStore({
    ...SITE_FILES,
    'old-page/index.html': 'x',
    'old-page/logo.png': 'x',
    'fonts/gone.woff2': 'x',
    'media/pic.jpg': 'x',
    'media/deep/clip.mp4': 'x',
  })
  const res = await syncDir({ dir, store })
  assert.deepEqual([...res.deleted].sort(), ['fonts/gone.woff2', 'old-page/index.html', 'old-page/logo.png'])
  assert.deepEqual([...store.dels].sort(), [...res.deleted].sort())
  assert.ok(!store.dels.some((k) => k.startsWith('media/')))
})

test('syncDir respects the concurrency limit (and does use it)', async () => {
  const dir = await tmp('dir')
  const files = { 'a-one/index.html': '<p>x</p>' }
  for (let i = 0; i < 14; i++) files[`fonts/f${i}.woff2`] = `F${i}`
  await writeTree(dir, files)
  const three = fakeStore()
  await syncDir({ dir, store: three, concurrency: 3 })
  assert.ok(three.maxInflight <= 3, `max in flight ${three.maxInflight}`)
  assert.ok(three.maxInflight >= 2, 'never ran in parallel')
  const dflt = fakeStore()
  await syncDir({ dir, store: dflt })
  assert.ok(dflt.maxInflight <= 6, `default max in flight ${dflt.maxInflight}`)
  assert.ok(dflt.maxInflight >= 4)
})

test('syncDir refuses a dir with no pages and changes nothing', async () => {
  const dir = await tmp('dir')
  await writeTree(dir, { 'fonts/f.woff2': 'F', '404.html': '<p>x</p>' })
  const store = fakeStore({ 'live/index.html': 'x' })
  await assert.rejects(syncDir({ dir, store }))
  assert.deepEqual(store.dels, [])
  assert.deepEqual(store.puts, [])
})

const pages = (n, body = '<p>x</p>') => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}/index.html`, body]))

test('mass-delete guard: deleting more than max(3, half) of live pages throws, nothing deleted', async () => {
  const dir = await tmp('dir')
  await writeTree(dir, pages(4)) // 10 live pages, 4 built: 6 would go, limit is 5
  const store = fakeStore(pages(10))
  await assert.rejects(syncDir({ dir, store }))
  assert.deepEqual(store.dels, [])
})

test('mass-delete guard: exactly half is allowed', async () => {
  const dir = await tmp('dir')
  await writeTree(dir, pages(5))
  const store = fakeStore(pages(10))
  const res = await syncDir({ dir, store })
  assert.equal(res.deleted.length, 5)
})

test('mass-delete guard: small stores may lose up to 3 pages', async () => {
  const dir = await tmp('dir')
  await writeTree(dir, pages(1))
  const store = fakeStore(pages(4)) // 3 would go, max(3, 2) = 3
  assert.equal((await syncDir({ dir, store })).deleted.length, 3)
  const dir2 = await tmp('dir')
  await writeTree(dir2, pages(1))
  const store2 = fakeStore(pages(5)) // 4 would go, max(3, 2.5) = 3
  await assert.rejects(syncDir({ dir: dir2, store: store2 }))
  assert.deepEqual(store2.dels, [])
})

test('mass-delete guard: force:true overrides it', async () => {
  const dir = await tmp('dir')
  await writeTree(dir, pages(2))
  const store = fakeStore(pages(10))
  const res = await syncDir({ dir, store, force: true })
  assert.equal(res.deleted.length, 8)
})

test('mass-delete guard counts pages, not other files', async () => {
  const dir = await tmp('dir')
  await writeTree(dir, pages(10))
  const stale = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`fonts/old${i}.woff2`, 'x']))
  const store = fakeStore({ ...pages(10), ...stale })
  const res = await syncDir({ dir, store })
  assert.equal(res.deleted.length, 20)
})

// ---- publishLive ---------------------------------------------------------------------------

async function makeRoot(client = {}) {
  const root = await tmp('root')
  const data = {
    slug: 'alpha-cafe',
    name: 'Alpha Cafe',
    look: 'card',
    theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#e8622d' },
    blocks: [{ type: 'link', kind: 'website', url: 'https://example.com/alpha' }],
    ...client,
  }
  await writeTree(root, { 'clients/alpha-cafe/client.js': `export default ${JSON.stringify(data)}\n` })
  return root
}

function fakeGit({ commit = 'committed', throws = false } = {}) {
  const git = {
    calls: [],
    pushPromise: null,
    commit(root) {
      git.calls.push('commit')
      if (throws) throw new Error('fatal: not a git repository')
      return commit
    },
    push() {
      git.calls.push('push')
      git.pushPromise = new Promise(() => {}) // never settles: proves publishLive does not await it
      return git.pushPromise
    },
  }
  return git
}

test('publishLive builds, syncs, commits locally and returns without waiting for the push', async () => {
  const root = await makeRoot()
  const store = fakeStore()
  const git = fakeGit()
  const res = await Promise.race([publishLive({ root, site: SITE, store, git }), sleep(5000).then(() => 'timeout')])
  assert.notEqual(res, 'timeout', 'publishLive waited for the push')
  assert.equal(res.ok, true, res.output)
  assert.equal(res.backup, 'committed')
  assert.ok(res.push instanceof Promise)
  assert.equal(typeof res.live.ms, 'number')
  const keys = store.puts.map((p) => p.key)
  assert.ok(keys.includes('alpha-cafe/index.html') && keys.includes('index.html') && keys.includes('404.html'))
  assert.ok(keys.some((k) => k.startsWith('fonts/')))
  assert.ok(!keys.includes('.nojekyll'))
  assert.deepEqual(git.calls, ['commit', 'push'])
})

test('publishLive: nothing to commit is reported as nothing', async () => {
  const res = await publishLive({ root: await makeRoot(), site: SITE, store: fakeStore(), git: fakeGit({ commit: 'nothing' }) })
  assert.equal(res.ok, true)
  assert.equal(res.backup, 'nothing')
})

test('publishLive: a git failure never makes the publish fail', async () => {
  const store = fakeStore()
  const res = await publishLive({ root: await makeRoot(), site: SITE, store, git: fakeGit({ throws: true }) })
  assert.equal(res.ok, true, res.output)
  assert.equal(res.backup, 'failed')
  assert.ok(store.puts.length > 0, 'the live upload still happened')
})

test('publishLive: a build failure is ok:false and the store is never touched', async () => {
  const root = await makeRoot({ name: '' })
  const store = fakeStore()
  const git = fakeGit()
  const res = await publishLive({ root, site: SITE, store, git })
  assert.equal(res.ok, false)
  assert.match(res.output, /name/)
  assert.equal(store.calls, 0, 'list/put/del must not be called')
  assert.deepEqual(git.calls, [])
})

test('publishLive refuses a base other than "/" before touching the store', async () => {
  const store = fakeStore()
  const res = await publishLive({ root: await makeRoot(), site: SITE_SUBPATH, store, git: fakeGit() })
  assert.equal(res.ok, false)
  assert.match(res.output, /base/)
  assert.equal(store.calls, 0)
})

test('publishLive: the mass-delete guard comes back as ok:false, and force:true overrides it', async () => {
  const root = await makeRoot()
  const refused = fakeStore(pages(10))
  const no = await publishLive({ root, site: SITE, store: refused, git: fakeGit() })
  assert.equal(no.ok, false)
  assert.deepEqual(refused.dels, [])
  const forced = fakeStore(pages(10))
  const yes = await publishLive({ root, site: SITE, store: forced, git: fakeGit(), force: true })
  assert.equal(yes.ok, true, yes.output)
  assert.equal(forced.dels.length, 10)
})

test('publishLive: missing Cloudflare settings is a plain message, no throw, no secret in it', async () => {
  const root = await makeRoot()
  await writeFile(join(root, '.env.local'), 'CF_ACCOUNT_ID=ACCOUNT-VALUE-111\nR2_BUCKET=BUCKET-VALUE-222\nR2_ACCESS_KEY_ID=KEYID-VALUE-333\n')
  const git = fakeGit()
  const res = await publishLive({ root, site: SITE, git })
  assert.equal(res.ok, false)
  assert.ok(res.output.includes('Cloudflare is not set up: missing R2_SECRET_ACCESS_KEY in .env.local'), res.output)
  for (const secret of ['ACCOUNT-VALUE-111', 'BUCKET-VALUE-222', 'KEYID-VALUE-333']) {
    assert.ok(!JSON.stringify(res).includes(secret), `${secret} leaked`)
  }
  assert.deepEqual(git.calls, [])
})

test('publishLive: no .env.local at all names the setup file and the keys', async () => {
  const res = await publishLive({ root: await makeRoot(), site: SITE, git: fakeGit() })
  assert.equal(res.ok, false)
  assert.match(res.output, /Cloudflare is not set up: missing .*in \.env\.local/)
  for (const k of ['CF_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) assert.ok(res.output.includes(k), k)
})

// ---- secrets are never committable (the repo is public) --------------------------------------

test('.env.local is git-ignored', () => {
  assert.doesNotThrow(() => execFileSync('git', ['check-ignore', '-q', '.env.local'], { cwd: REPO }))
})

test('.wrangler/ is git-ignored', () => {
  assert.doesNotThrow(() => execFileSync('git', ['check-ignore', '-q', '.wrangler/state/x'], { cwd: REPO }))
})
