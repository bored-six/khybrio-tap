// Copies Khybrio brand files from the main site repo (brand/sync.json) and records hashes in
// brand/sync.lock.json. test/brand.test.js fails when the main site's file changes and this
// has not been re-run, so an old logo can never quietly stay on the tap pages.
//
// Run: npm run sync-brand   (needs ../Khybrio next to this repo; resizing uses macOS `sips`)
import { readFile, writeFile, copyFile, mkdir, rm, mkdtemp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const sync = JSON.parse(await readFile(join(ROOT, 'brand/sync.json'), 'utf8'))
const sha = async (p) => createHash('sha256').update(await readFile(p)).digest('hex')

const lock = {}
const tmp = await mkdtemp(join(tmpdir(), 'khybrio-brand-'))
try {
  for (const f of sync.files) {
    const src = join(ROOT, sync.source, f.from)
    const out = join(ROOT, f.to)
    const staged = join(tmp, f.to.replaceAll('/', '_'))
    await copyFile(src, staged)
    if (f.maxPx && process.platform === 'darwin') {
      await run('sips', ['-Z', String(f.maxPx), staged, '--out', staged])
    } else if (f.maxPx) {
      console.warn(`  ${f.to}: not resized (sips is macOS only), copied at full size`)
    }
    await mkdir(dirname(out), { recursive: true })
    await copyFile(staged, out)
    lock[f.to] = { from: f.from, sourceSha256: await sha(src), outputSha256: await sha(out) }
    console.log(`  ${f.from} -> ${f.to}`)
  }
  await writeFile(join(ROOT, 'brand/sync.lock.json'), JSON.stringify(lock, null, 2) + '\n')
  console.log('Brand synced. Commit brand/sync.lock.json with the files.')
} catch (e) {
  console.error(`Brand sync failed: ${e.message}`)
  process.exitCode = 1
} finally {
  await rm(tmp, { recursive: true, force: true })
}
