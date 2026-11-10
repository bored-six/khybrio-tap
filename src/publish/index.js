import { mkdtemp, rm, writeFile, unlink, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { loadEnv } from './env.js'
import { syncDir } from './sync.js'

const STALE_LOCK_MS = 10 * 60 * 1000

function defaultGit() {
  return {
    commit(root) {
      execFileSync('git', ['add', 'clients'], { cwd: root, stdio: 'pipe' })
      try {
        execFileSync('git', ['diff', '--cached', '--quiet', '--', 'clients'], { cwd: root, stdio: 'pipe' })
        return 'nothing'
      } catch (e) {
        if (e.status !== 1) throw e
      }
      execFileSync('git', ['commit', '-m', 'content: update tap pages', '--', 'clients'], { cwd: root, stdio: 'pipe' })
      return 'committed'
    },
    push(root) {
      return new Promise((resolve, reject) => {
        execFile('git', ['push'], { cwd: root }, (err, _o, stderr) => (err ? reject(new Error(String(stderr || err.message))) : resolve()))
      })
    },
  }
}

async function takeLock(root) {
  const path = join(tmpdir(), `khybrio-publish-${createHash('md5').update(root).digest('hex')}.lock`)
  try {
    await writeFile(path, String(process.pid), { flag: 'wx' })
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
    const age = Date.now() - (await stat(path)).mtimeMs
    if (age < STALE_LOCK_MS) throw new Error('Another publish is already running.')
    await writeFile(path, String(process.pid))
  }
  return () => unlink(path).catch(() => {})
}

const fail = (output) => ({ ok: false, output, live: { uploaded: [], deleted: [], ms: 0 }, backup: 'nothing', push: null })

function redactAll(result, secrets) {
  const list = secrets.filter((v) => typeof v === 'string' && v.length >= 4).sort((a, b) => b.length - a.length)
  if (!list.length || typeof result?.output !== 'string') return result
  let out = result.output
  for (const v of list) out = out.split(v).join('[redacted]')
  return { ...result, output: out }
}

export async function publishLive(args = {}) {
  const secrets = [...(args.secrets ?? [])]
  try {
    if (args.root) {
      const res = loadEnv(args.root)
      secrets.push(...Object.values(res.env ?? {}))
    }
  } catch {}
  return redactAll(await publishLiveInner(args), secrets)
}

async function publishLiveInner({ root, site, store, git, force = false } = {}) {
  if (!site || site.base !== '/') return fail('Publish needs site base "/" (a root domain). Current base is not "/".')

  if (!store) {
    const res = loadEnv(root)
    if (!res.ok) return fail(`Cloudflare is not set up: missing ${res.missing.join(', ')} in .env.local`)
    const { createR2Store } = await import('./r2.js')
    store = createR2Store({
      accountId: res.env.CF_ACCOUNT_ID,
      bucket: res.env.R2_BUCKET,
      accessKeyId: res.env.R2_ACCESS_KEY_ID,
      secretAccessKey: res.env.R2_SECRET_ACCESS_KEY,
    })
  }
  git ||= defaultGit()

  let release
  try {
    release = await takeLock(root)
  } catch (e) {
    return fail(e.message)
  }
  let tmp
  try {
    tmp = await mkdtemp(join(tmpdir(), 'khybrio-live-'))
    const outDir = join(tmp, 'dist')
    try {
      const { build } = await import('../build.js')
      await build({ root, outDir, site })
    } catch (e) {
      return fail(e.message)
    }
    const t0 = Date.now()
    let synced
    try {
      synced = await syncDir({ dir: outDir, store, force })
    } catch (e) {
      return fail(e.message)
    }
    const live = { uploaded: synced.uploaded, deleted: synced.deleted, ms: Date.now() - t0 }

    let backup = 'failed'
    let push = null
    try {
      backup = git.commit(root)
      push = Promise.resolve(git.push(root))
      push.catch(() => {})
    } catch {
      backup = 'failed'
    }
    return {
      ok: true,
      output: `Live: ${live.uploaded.length} uploaded, ${live.deleted.length} deleted, ${synced.unchanged} unchanged.`,
      live,
      backup,
      push,
    }
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true })
    await release()
  }
}
