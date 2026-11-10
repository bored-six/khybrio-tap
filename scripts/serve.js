import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, dirname, resolve, normalize } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from '../src/build.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const port = Number(process.env.PORT) || 4321
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

async function rebuild() {
  const site = (await import(`${pathToFileURL(join(root, 'site.config.js')).href}?v=${Date.now()}`)).default
  await build({ root, outDir: dist, site })
  return site
}

const isFile = (p) => stat(p).then((s) => s.isFile(), () => false)

createServer(async (req, res) => {
  try {
    const site = await rebuild().catch((e) => {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(e.message)
      return null
    })
    if (!site) return
    const { pathname } = new URL(req.url, 'http://localhost')
    if (pathname === '/') {
      res.writeHead(302, { location: site.base })
      return res.end()
    }
    let file = null
    if (pathname.startsWith(site.base)) {
      let rel = decodeURIComponent(pathname.slice(site.base.length))
      if (rel === '' || rel.endsWith('/')) rel += 'index.html'
      const full = normalize(join(dist, rel))
      if (full.startsWith(dist) && (await isFile(full))) file = full
      else if (full.startsWith(dist) && (await isFile(join(full, 'index.html')))) {
        res.writeHead(301, { location: pathname + '/' })
        return res.end()
      }
    }
    const status = file ? 200 : 404
    file ||= join(dist, '404.html')
    res.writeHead(status, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
    res.end(await readFile(file))
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(String(e.message))
  }
}).listen(port, () => console.log(`http://localhost:${port}/`))
