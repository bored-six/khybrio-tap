// Adversarial: syncDir, publishLive, loadEnv (spec section 10). Fake store and fake git only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { loadEnv } from '../src/publish/env.js'
import { syncDir } from '../src/publish/sync.js'
import { publishLive } from '../src/publish/index.js'
import { SITE } from './helpers.js'

const md5 = (b) => createHash('md5').update(b).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const cleanups = []
const tmp = async (p) => {
  const d = await mkdtemp(join(tmpdir(), `khybrio-brk-${p}-`))
  cleanups.push(d)
  return d
}
test.after(() => Promise.all(cleanups.map((d) => rm(d, { recursive: true, force: true }))))
async function tree(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(join(dir, dirname(rel)), { recursive: true })
    await writeFile(join(dir, rel), body)
  }
}
function store(initial = {}, { delay = 0, listThrows } = {}) {
  const state = new Map(Object.entries(initial).map(([k, v]) => [k, md5(v)]))
  const s = {
    puts: [], dels: [], calls: 0,
    async list() { s.calls++; if (listThrows) throw listThrows; if (delay) await sleep(delay); return new Map(state) },
    async put(k, b) { s.calls++; if (delay) await sleep(delay); s.puts.push(k); state.set(k, md5(b)) },
    async del(k) { s.calls++; s.dels.push(k); state.delete(k) },
  }
  return s
}
const pages = (n, prefix = 'p') => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}/index.html`, `page ${i}`]))

// ---- syncDir ----
test('sync: identical files are not re-uploaded; one changed byte is', async () => {
  const dir = await tmp('d')
  await tree(dir, { 'a/index.html': 'same', 'b/index.html': 'new!', 'fonts/f.woff2': 'F' })
  const s = store({ 'a/index.html': 'same', 'b/index.html': 'old', 'fonts/f.woff2': 'F' })
  const r = await syncDir({ dir, store: s })
  assert.deepEqual(s.puts, ['b/index.html'])
  assert.equal(r.unchanged, 2)
  assert.deepEqual(r.deleted, [])
})

test('sync: an empty-content file has the md5 of nothing and is compared right', async () => {
  const dir = await tmp('d')
  await tree(dir, { 'a/index.html': 'x', 'a/empty.svg': '' })
  const s = store({ 'a/index.html': 'x', 'a/empty.svg': '' })
  await syncDir({ dir, store: s })
  assert.deepEqual(s.puts, [])
})

test('sync: empty dir and redirects-only dir throw and delete nothing', async () => {
  const live = { 'a/index.html': 'x', 'b/index.html': 'y' }
  for (const files of [{}, { '_redirect/old': 'a' }, { 'index.html': 'r', '404.html': 'n' }, { 'a/b/index.html': 'deep' }, { '.nojekyll': '' }]) {
    const dir = await tmp('d')
    await tree(dir, files)
    const s = store(live)
    await assert.rejects(syncDir({ dir, store: s, force: true }), /no pages/i, JSON.stringify(Object.keys(files)))
    assert.deepEqual(s.dels, [])
    assert.deepEqual(s.puts, [])
  }
})

test('sync: media/ is never deleted, even with force, and never uploaded from dist', async () => {
  const dir = await tmp('d')
  await tree(dir, { 'a/index.html': 'x', 'media/local.png': 'L' })
  const s = store({ 'a/index.html': 'x', 'media/pic.png': 'P', 'media/sub/index.html': 'M', 'old/index.html': 'o' })
  const r = await syncDir({ dir, store: s, force: true })
  assert.deepEqual(r.deleted, ['old/index.html'])
  assert.ok(!s.dels.some((k) => k.startsWith('media/')))
  assert.ok(!s.puts.some((k) => k.startsWith('media/')))
})

test('sync: media/index.html in the live bucket does not count toward the page guard', async () => {
  const dir = await tmp('d')
  await tree(dir, pages(1))
  // 1 kept + 3 going = 4 live pages; media/x/index.html is not a page we own
  const s = store({ ...pages(1), 'q0/index.html': 'a', 'q1/index.html': 'a', 'q2/index.html': 'a', 'media/x/index.html': 'm' })
  await syncDir({ dir, store: s })
  assert.equal(s.dels.length, 3)
})

// guard: refuse when pagesGoing > max(3, livePages/2). kept pages stay; `going` pages are live-only.
async function guard(kept, going, force = false) {
  const dir = await tmp('g')
  await tree(dir, pages(kept, 'keep'))
  const s = store({ ...pages(kept, 'keep'), ...pages(going, 'gone') })
  const p = syncDir({ dir, store: s, force })
  return { s, p }
}
for (const [kept, going, refuse] of [
  [3, 3, false], // 6 live, 3 going: exactly half, allowed
  [2, 4, true], // 6 live, 4 going
  [7, 3, false], // 10 live, 3 going: <= max(3,5)
  [5, 5, false], // 10 live, 5 going: exactly half
  [4, 6, true], // 10 live, 6 going
  [1, 3, false], // 4 live, 3 going: exactly max(3,2)=3
  [1, 4, true], // 5 live, 4 going: 4 > max(3,2.5)
  [4, 3, false], // 7 live: max(3,3.5)=3.5, 3 ok
  [3, 4, true], // 7 live: 4 > 3.5
  [20, 3, false], // 23 live
]) {
  test(`sync guard: ${kept} kept + ${going} going -> ${refuse ? 'refuses' : 'allows'}`, async () => {
    const { s, p } = await guard(kept, going)
    if (refuse) {
      await assert.rejects(p, /refus/i)
      assert.deepEqual(s.dels, [], 'nothing deleted when refused')
    } else {
      const r = await p
      assert.equal(r.deleted.length, going)
    }
  })
}
test('sync guard: force overrides the refusal', async () => {
  const { s, p } = await guard(2, 4, true)
  const r = await p
  assert.equal(r.deleted.length, 4)
  assert.equal(s.dels.length, 4)
})
test('sync guard: non-page deletions (assets, redirects) do not count toward the page guard', async () => {
  const dir = await tmp('d')
  await tree(dir, pages(1))
  const junk = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p0/old${i}.png`, 'x']))
  const s = store({ ...pages(1), ...junk, '_redirect/zz': 'p0' })
  const r = await syncDir({ dir, store: s })
  assert.equal(r.deleted.length, 11)
})
test('sync: a failing list() propagates and nothing is written or deleted', async () => {
  const dir = await tmp('d')
  await tree(dir, pages(1))
  const s = store({}, { listThrows: new Error('R2 list failed (HTTP 403)') })
  await assert.rejects(syncDir({ dir, store: s }), /403/)
  assert.deepEqual([s.puts, s.dels], [[], []])
})
test('sync: unicode / spaced file names in dist keep their key and bytes', async () => {
  const dir = await tmp('d')
  await tree(dir, { 'a/index.html': 'x', 'a/my pic é.png': 'PNG' })
  const s = store()
  await syncDir({ dir, store: s })
  assert.ok(s.puts.includes('a/my pic é.png'))
})
test('sync: concurrency limit is respected', async () => {
  const dir = await tmp('d')
  await tree(dir, Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`a/f${i}.png`, `${i}`])) )
  await tree(dir, { 'a/index.html': 'x' })
  let inflight = 0, max = 0
  const s = store()
  const put = s.put
  s.put = async (k, b) => { inflight++; max = Math.max(max, inflight); await sleep(3); await put(k, b); inflight-- }
  await syncDir({ dir, store: s, concurrency: 2 })
  assert.ok(max <= 2, `max inflight ${max}`)
})

// ---- loadEnv ----
const envOf = async (text) => {
  const root = await tmp('env')
  await writeFile(join(root, '.env.local'), text)
  return loadEnv(root)
}
const FULL = 'CF_ACCOUNT_ID=a\nR2_BUCKET=b\nR2_ACCESS_KEY_ID=c\nR2_SECRET_ACCESS_KEY=d\n'
test('env: quoted values lose their quotes; secrets with = and # inside quotes survive', async () => {
  const r = await envOf(`CF_ACCOUNT_ID="a1"\nR2_BUCKET='bk'\nR2_ACCESS_KEY_ID=c\nR2_SECRET_ACCESS_KEY="ab==#cd"\n`)
  assert.equal(r.ok, true)
  assert.equal(r.env.CF_ACCOUNT_ID, 'a1')
  assert.equal(r.env.R2_BUCKET, 'bk')
  assert.equal(r.env.R2_SECRET_ACCESS_KEY, 'ab==#cd')
})
test('env: unquoted secret containing = keeps everything after the first =', async () => {
  const r = await envOf(`CF_ACCOUNT_ID=a\nR2_BUCKET=b\nR2_ACCESS_KEY_ID=c\nR2_SECRET_ACCESS_KEY=ab==\n`)
  assert.equal(r.env.R2_SECRET_ACCESS_KEY, 'ab==')
})
test('env: comments, blank lines, CRLF endings, trailing spaces', async () => {
  const r = await envOf('# top\r\n\r\nCF_ACCOUNT_ID=a  \r\n# mid\r\nR2_BUCKET=b\r\nR2_ACCESS_KEY_ID=c\r\nR2_SECRET_ACCESS_KEY=d\r\n')
  assert.equal(r.ok, true, r.missing.join())
  assert.deepEqual(r.env, { CF_ACCOUNT_ID: 'a', R2_BUCKET: 'b', R2_ACCESS_KEY_ID: 'c', R2_SECRET_ACCESS_KEY: 'd' })
})
test('env: empty and whitespace-only values count as missing', async () => {
  const r = await envOf('CF_ACCOUNT_ID=\nR2_BUCKET="   "\nR2_ACCESS_KEY_ID=c\nR2_SECRET_ACCESS_KEY=d\n')
  assert.equal(r.ok, false)
  assert.deepEqual(r.missing.sort(), ['CF_ACCOUNT_ID', 'R2_BUCKET'])
  assert.ok(!('CF_ACCOUNT_ID' in r.env))
})
test('env: a commented-out key is missing, an unrelated key is ignored and not returned', async () => {
  const r = await envOf('#R2_BUCKET=b\nOTHER=zzz\nCF_ACCOUNT_ID=a\nR2_ACCESS_KEY_ID=c\nR2_SECRET_ACCESS_KEY=d\n')
  assert.deepEqual(r.missing, ['R2_BUCKET'])
  assert.ok(!('OTHER' in r.env))
})
test('env: .env.local that is a directory or garbage does not throw', async () => {
  const root = await tmp('env')
  await mkdir(join(root, '.env.local'))
  assert.equal(loadEnv(root).ok, false)
  assert.equal((await envOf('\u0000\u0001=== not env ===')).ok, false)
})
test('env: duplicate key, last one wins', async () => {
  const r = await envOf(FULL + 'R2_BUCKET=second\n')
  assert.equal(r.env.R2_BUCKET, 'second')
})
test('env: a key from process.env is NOT read, only the file', async () => {
  process.env.R2_BUCKET = 'from-process'
  try {
    const r = await envOf('CF_ACCOUNT_ID=a\nR2_ACCESS_KEY_ID=c\nR2_SECRET_ACCESS_KEY=d\n')
    assert.deepEqual(r.missing, ['R2_BUCKET'])
  } finally {
    delete process.env.R2_BUCKET
  }
})

// ---- publishLive ----
async function makeRoot(client = {}, envText) {
  const root = await tmp('root')
  const data = { slug: 'alpha-cafe', name: 'Alpha Cafe', look: 'card', theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#e8622d' }, blocks: [{ type: 'link', kind: 'website', url: 'https://example.com/alpha' }], ...client }
  await tree(root, { 'clients/alpha-cafe/client.js': `export default ${JSON.stringify(data)}\n` })
  if (envText !== undefined) await writeFile(join(root, '.env.local'), envText)
  return root
}
const git = () => ({ commit: () => 'nothing', push: () => new Promise(() => {}) })

test('publishLive: concurrent calls on one root: exactly one runs, the other is refused without store calls', async () => {
  const root = await makeRoot()
  const s1 = store({}, { delay: 20 })
  const s2 = store({}, { delay: 20 })
  const [a, b] = await Promise.all([publishLive({ root, site: SITE, store: s1, git: git() }), publishLive({ root, site: SITE, store: s2, git: git() })])
  const oks = [a, b].filter((r) => r.ok)
  assert.equal(oks.length, 1, `outputs: ${a.output} | ${b.output}`)
  const loser = a.ok ? b : a
  const loserStore = a.ok ? s2 : s1
  assert.equal(loserStore.calls, 0)
  assert.match(loser.output, /already running|another/i)
})

test('publishLive: the lock is released after success, build failure and sync failure', async () => {
  const root = await makeRoot()
  assert.equal((await publishLive({ root, site: SITE, store: store(), git: git() })).ok, true)
  assert.equal((await publishLive({ root, site: SITE, store: store({}, { listThrows: new Error('boom') }), git: git() })).ok, false)
  assert.equal((await publishLive({ root, site: SITE, store: store(), git: git() })).ok, true, 'lock stuck after a sync failure')
  const bad = await makeRoot({ name: '' })
  assert.equal((await publishLive({ root: bad, site: SITE, store: store(), git: git() })).ok, false)
  // second try on the same bad root must still be a build error, not a lock error
  assert.doesNotMatch((await publishLive({ root: bad, site: SITE, store: store(), git: git() })).output, /already running/i)
})

test('publishLive: second publish with identical content uploads nothing', async () => {
  const root = await makeRoot()
  const s = store()
  await publishLive({ root, site: SITE, store: s, git: git() })
  const n = s.puts.length
  const r = await publishLive({ root, site: SITE, store: s, git: git() })
  assert.equal(r.ok, true)
  assert.equal(s.puts.length, n, 'unchanged build must not re-upload (build must be deterministic)')
  assert.deepEqual(r.live.uploaded, [])
})

test('publishLive: missing env names keys, never a value; no throw; no store call', async () => {
  const root = await makeRoot({}, 'CF_ACCOUNT_ID=acc-VALUE-1\nR2_SECRET_ACCESS_KEY=SECRET-VALUE-2\n')
  const r = await publishLive({ root, site: SITE, git: git() })
  assert.equal(r.ok, false)
  assert.match(r.output, /Cloudflare is not set up: missing .*R2_BUCKET.*R2_ACCESS_KEY_ID.* in \.env\.local/)
  assert.ok(!r.output.includes('acc-VALUE-1') && !r.output.includes('SECRET-VALUE-2'))
  assert.doesNotMatch(r.output, /missing[^]*CF_ACCOUNT_ID/)
})

test('publishLive: a store error that echoes the secret must not put the secret in output', async () => {
  const SECRET = 'TOPSECRET-do-not-print'
  const root = await makeRoot({}, `CF_ACCOUNT_ID=a\nR2_BUCKET=b\nR2_ACCESS_KEY_ID=c\nR2_SECRET_ACCESS_KEY=${SECRET}\n`)
  const s = store({}, { listThrows: new Error(`SignatureDoesNotMatch for key ${SECRET}`) })
  const r = await publishLive({ root, site: SITE, store: s, git: git() })
  assert.equal(r.ok, false)
  assert.ok(!JSON.stringify(r).includes(SECRET), `leaked: ${r.output}`)
})

test('publishLive: missing site / undefined args return ok:false instead of throwing', async () => {
  const root = await makeRoot()
  for (const site of [undefined, null, {}, { base: '/x/' }, { ...SITE, base: '' }]) {
    const r = await publishLive({ root, site, store: store(), git: git() })
    assert.equal(r.ok, false, JSON.stringify(site))
  }
  const r = await publishLive()
  assert.equal(r.ok, false)
})

test('publishLive: a mass-delete refusal is ok:false with an explanation; force:true goes through', async () => {
  const root = await makeRoot()
  const live = pages(8, 'gone')
  const s = store(live)
  const r = await publishLive({ root, site: SITE, store: s, git: git() })
  assert.equal(r.ok, false)
  assert.match(r.output, /refus/i)
  assert.deepEqual(s.dels, [])
  const f = await publishLive({ root, site: SITE, store: s, git: git(), force: true })
  assert.equal(f.ok, true, f.output)
  assert.equal(f.live.deleted.length, 8)
})

test('publishLive: git.push that rejects does not make publish fail or crash the process', async () => {
  const root = await makeRoot()
  const g = { commit: () => 'committed', push: () => Promise.reject(new Error('no remote')) }
  const r = await publishLive({ root, site: SITE, store: store(), git: g })
  assert.equal(r.ok, true)
  await assert.rejects(r.push, /no remote/)
})

test('publishLive: git.push throwing synchronously keeps ok:true', async () => {
  const root = await makeRoot()
  const g = { commit: () => 'committed', push: () => { throw new Error('spawn') } }
  const r = await publishLive({ root, site: SITE, store: store(), git: g })
  assert.equal(r.ok, true)
})
