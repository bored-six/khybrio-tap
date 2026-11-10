// Dev server: builds dist/ on every request, then answers through the same handle() the live Worker uses.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, dirname, resolve, normalize, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from '../src/build.js'
import { handle } from '../worker/handler.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const port = Number(process.env.PORT) || 4321
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

// Folder-backed stand-in for the R2 bucket: get(key) -> { body, text(), httpMetadata, httpEtag } | null.
export function folderBucket(dir) {
  return {
    async get(key) {
      const full = normalize(join(dir, key))
      if (!full.startsWith(dir + sep)) return null
      const st = await stat(full).catch(() => null)
      if (!st || !st.isFile()) return null
      const buf = await readFile(full)
      const ext = extname(full)
      const contentType = key.startsWith('_redirect/') ? 'text/plain; charset=utf-8' : TYPES[ext] || 'application/octet-stream'
      return {
        body: buf,
        text: async () => buf.toString('utf8'),
        httpMetadata: { contentType, cacheControl: 'no-cache' },
        httpEtag: `"${st.mtimeMs}-${st.size}"`,
      }
    },
  }
}

let inflight = null
function rebuild() {
  if (!inflight) inflight = doRebuild().finally(() => { inflight = null })
  return inflight
}

async function doRebuild() {
  const site = (await import(`${pathToFileURL(join(root, 'site.config.js')).href}?v=${Date.now()}`)).default
  await build({ root, outDir: dist, site })
}

const bucket = folderBucket(dist)

createServer(async (req, res) => {
  try {
    try {
      await rebuild()
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      return res.end(e.message)
    }
    const request = new Request(new URL(req.url, `http://localhost:${port}`), { method: req.method, headers: req.headers })
    const r = await handle(request, bucket)
    res.writeHead(r.status, Object.fromEntries(r.headers))
    res.end(Buffer.from(await r.arrayBuffer()))
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(String(e.message))
  }
})
  .on('error', (e) => {
    if (e.code !== 'EADDRINUSE') throw e
    console.error(`Port ${port} is already in use (probably another copy of this dev server).`)
    console.error(`Pick another port: PORT=${port + 1} npm run dev`)
    process.exit(1)
  })
  .listen(port, '127.0.0.1', () => console.log(`Tap pages: http://localhost:${port}/khybrio/`))
