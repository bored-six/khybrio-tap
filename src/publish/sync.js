import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { createHash } from 'node:crypto'

const IMG = { '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' }

export function metaFor(key) {
  const ext = extname(key).toLowerCase()
  if (key.startsWith('_redirect/')) return { contentType: 'text/plain', cacheControl: 'no-store' }
  if (ext === '.html') return { contentType: 'text/html; charset=utf-8', cacheControl: 'no-cache' }
  if (ext === '.woff2') return { contentType: 'font/woff2', cacheControl: 'public, max-age=604800' }
  return { contentType: IMG[ext] || 'application/octet-stream', cacheControl: 'public, max-age=300' }
}

async function walk(dir, prefix = '', out = []) {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${d.name}` : d.name
    if (d.isDirectory()) await walk(join(dir, d.name), rel, out)
    else if (d.isFile()) out.push(rel)
  }
  return out
}

async function pool(items, limit, fn) {
  let i = 0
  const worker = async () => {
    while (i < items.length) await fn(items[i++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

const isPage = (k) => /^[^/]+\/index\.html$/.test(k)

export async function syncDir({ dir, store, concurrency = 6, force = false }) {
  const keys = (await walk(dir)).filter((k) => k !== '.nojekyll' && !k.startsWith('media/'))
  const builtPages = keys.filter(isPage)
  if (builtPages.length === 0) throw new Error('Refusing to publish: the build has no pages.')

  const bodies = new Map()
  const local = new Map()
  for (const k of keys) {
    const buf = await readFile(join(dir, k))
    bodies.set(k, buf)
    local.set(k, createHash('md5').update(buf).digest('hex'))
  }
  const live = await store.list()

  const todo = keys.filter((k) => live.get(k) !== local.get(k))
  const unchanged = keys.length - todo.length
  const gone = [...live.keys()].filter((k) => !local.has(k) && !k.startsWith('media/'))

  const livePages = [...live.keys()].filter((k) => !k.startsWith('media/') && isPage(k))
  const pagesGoing = gone.filter(isPage).length
  if (!force && pagesGoing > Math.max(3, livePages.length / 2)) {
    throw new Error(`Refusing to delete ${pagesGoing} of ${livePages.length} live pages. Publish again with force to allow it.`)
  }

  const isRedirect = (k) => k.startsWith('_redirect/')
  const redirectsGoing = gone.filter(isRedirect).length
  if (!force && redirectsGoing > 0 && !keys.some(isRedirect)) {
    throw new Error(`Refusing to delete ${redirectsGoing} live redirect(s): this build has no _redirect keys (is _redirects.json missing?). Publish again with force to allow it.`)
  }

  const group = (k) => (k.startsWith('_redirect/') ? 1 : k.endsWith('.html') ? 2 : 0)
  const put = (k) => store.put(k, bodies.get(k), metaFor(k))
  for (const g of [0, 1, 2]) await pool(todo.filter((k) => group(k) === g), concurrency, put)
  await pool(gone, concurrency, (k) => store.del(k))

  return { uploaded: todo, deleted: gone, unchanged }
}
