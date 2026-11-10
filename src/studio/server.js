// Studio API: local dashboard backend. See "Studio" in .claude/specs/contract.md.
import { createServer } from 'node:http'
import { readdir, readFile, writeFile, mkdir, rename, rm, stat, mkdtemp } from 'node:fs/promises'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { validateClient, FILE_RE } from '../validate.js'
import { renderPage } from '../render.js'
import { looks } from '../looks/index.js'
import { fonts } from '../fonts.js'
import { icon } from '../icons.js'
import { KINDS } from '../kinds.js'
import { svgProblem } from '../assets.js'
import { build, listClientFolders } from '../build.js'

const here = dirname(fileURLToPath(import.meta.url))
const studioDir = resolve(here, '../../studio')
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_JSON = 256 * 1024
const MAX_ASSET = 3 * 1024 * 1024
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}
const lookIds = Object.keys(looks)
const fontIds = Object.keys(fonts)
const isSlug = (s) => typeof s === 'string' && SLUG_RE.test(s) && s.length >= 2 && s.length <= 40

class HttpError extends Error {
  constructor(status, body) {
    super(typeof body === 'string' ? body : JSON.stringify(body))
    this.status = status
    this.body = body
  }
}

const run = (cmd, args, cwd) =>
  new Promise((res) => {
    execFile(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      res({ ok: !err, out: `${stdout || ''}${stderr || ''}`, err })
    })
  })

export async function defaultPublish({ root }) {
  let output = ''
  const tmp = await mkdtemp(join(tmpdir(), 'khybrio-publish-'))
  try {
    const site = (await import(`${pathToFileURL(join(root, 'site.config.js')).href}?v=${Date.now()}`)).default
    const { pages } = await build({ root, outDir: join(tmp, 'dist'), site })
    output += `Checked ${pages.length} page(s).\n`
  } catch (e) {
    return { ok: false, output: e.message }
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
  const add = await run('git', ['add', 'clients'], root)
  output += add.out
  if (!add.ok) return { ok: false, output }
  // exit 0 = nothing staged, 1 = something staged, anything else = real failure
  const diff = await run('git', ['diff', '--cached', '--quiet', '--', 'clients'], root)
  if (diff.ok) output += 'Nothing new to commit.\n'
  else if (diff.err?.code === 1) {
    const c = await run('git', ['commit', '-m', 'content: update tap pages'], root)
    output += c.out
    if (!c.ok) return { ok: false, output }
  } else return { ok: false, output: output + diff.out + String(diff.err?.message || '') }
  const push = await run('git', ['push'], root)
  output += push.out
  if (!push.ok) return { ok: false, output: output || String(push.err?.message || '') }
  return { ok: true, output }
}

async function readBody(req, limit) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > limit) throw new HttpError(413, { error: 'Body too large' })
    chunks.push(c)
  }
  return Buffer.concat(chunks)
}

async function readJson(req) {
  const buf = await readBody(req, MAX_JSON)
  try {
    return buf.length ? JSON.parse(buf.toString('utf8')) : {}
  } catch {
    throw new HttpError(400, { error: 'Invalid JSON' })
  }
}

const isFile = (p) => stat(p).then((s) => s.isFile(), () => false)

export function createStudio({ root, site, publish = defaultPublish } = {}) {
  const clientsDir = join(root, 'clients')
  const previewSite = { origin: 'http://localhost', base: '/p/', mainSite: site.mainSite }

  const filesIn = async (dir) => {
    try {
      return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name).sort()
    } catch {
      return []
    }
  }
  const loadClient = async (slug) =>
    (await import(`${pathToFileURL(join(clientsDir, slug, 'client.js')).href}?v=${Date.now()}-${Math.random()}`)).default

  const check = (data, folder, files) =>
    validateClient(data, { folder, looks: lookIds, fonts: fontIds, files: files.filter((f) => f !== 'client.js') })

  async function pending() {
    const r = await run('git', ['status', '--porcelain', '--', 'clients'], root)
    if (!r.ok) return []
    const set = new Set()
    for (const line of r.out.split('\n')) {
      const m = /^.. "?clients\/([^/"]+)/.exec(line)
      if (m) set.add(m[1])
    }
    return [...set].sort()
  }

  async function state() {
    let folders = []
    try {
      folders = await listClientFolders(clientsDir)
    } catch {}
    const clients = []
    for (const slug of folders) {
      const base = { slug, name: '', tagline: '', look: '', theme: { bg: '', ink: '', accent: '' }, logo: null, linkCount: 0, liveUrl: `${site.origin}${site.base}${slug}/`, valid: false, errors: [] }
      let raw
      try {
        raw = await loadClient(slug)
      } catch (e) {
        clients.push({ ...base, errors: [`client.js could not be loaded: ${e.message}`] })
        continue
      }
      const r = check(raw, slug, await filesIn(join(clientsDir, slug)))
      const o = raw && typeof raw === 'object' ? raw : {}
      clients.push({
        ...base,
        name: typeof o.name === 'string' ? o.name : '',
        tagline: typeof o.tagline === 'string' ? o.tagline : '',
        look: typeof o.look === 'string' ? o.look : '',
        theme: { bg: o.theme?.bg ?? '', ink: o.theme?.ink ?? '', accent: o.theme?.accent ?? '' },
        logo: typeof o.logo === 'string' ? o.logo : null,
        linkCount: Array.isArray(o.links) ? o.links.length : 0,
        valid: !!r.ok,
        errors: r.ok ? [] : r.errors,
      })
    }
    return {
      site,
      looks: Object.entries(looks).map(([id, l]) => ({ id, label: l.label })),
      fonts: Object.entries(fonts).map(([id, f]) => ({ id, family: f.family })),
      kinds: Object.entries(KINDS).map(([id, k]) => ({ id, label: k.label, scheme: k.scheme })),
      clients,
      pending: await pending(),
    }
  }

  async function writeClient(slug, data) {
    const dir = join(clientsDir, slug)
    await mkdir(dir, { recursive: true })
    const file = join(dir, 'client.js')
    const tmp = join(dir, `.client.js.tmp-${process.pid}-${Date.now()}`)
    await writeFile(tmp, `export default ${JSON.stringify(data, null, 2)}\n`)
    await rename(tmp, file)
  }

  async function api(req, res, url, send) {
    if (req.headers['x-khybrio-studio'] !== '1') throw new HttpError(403, { error: 'Missing studio header' })
    const origin = req.headers.origin
    if (origin !== undefined) {
      const port = server.address()?.port
      if (origin !== `http://localhost:${port}` && origin !== `http://127.0.0.1:${port}`) throw new HttpError(403, { error: 'Bad origin' })
    }
    const { pathname } = url
    const m = req.method
    if (pathname === '/api/state' && m === 'GET') return send(200, await state())
    if (pathname === '/api/preview' && m === 'POST') {
      const body = await readJson(req)
      if (!isSlug(body.slug)) throw new HttpError(400, { error: 'Bad slug' })
      const files = await filesIn(join(clientsDir, body.slug))
      const r = check(body.data, body.slug, files)
      if (!r.ok) return send(200, { ok: false, errors: r.errors, html: null })
      return send(200, { ok: true, errors: [], html: renderPage(r.client, previewSite, { looks, fonts, icon }) })
    }
    if (pathname === '/api/publish' && m === 'POST') {
      await readBody(req, MAX_JSON)
      return send(200, await publish({ root }))
    }
    const cm = /^\/api\/clients\/([^/]+)(\/assets)?$/.exec(pathname)
    if (cm) {
      const slug = decodeURIComponent(cm[1])
      if (!isSlug(slug)) throw new HttpError(400, { error: 'Bad slug' })
      const dir = join(clientsDir, slug)
      if (!cm[2] && m === 'GET') {
        if (!(await isFile(join(dir, 'client.js')))) throw new HttpError(404, { error: 'No such client' })
        let data
        try {
          data = await loadClient(slug)
        } catch (e) {
          throw new HttpError(422, { error: `client.js could not be loaded: ${e.message}` })
        }
        return send(200, { data, files: (await filesIn(dir)).filter((f) => f !== 'client.js') })
      }
      if (!cm[2] && m === 'PUT') {
        const body = await readJson(req)
        const exists = await isFile(join(dir, 'client.js'))
        if (body.create && exists) throw new HttpError(409, { error: 'Client already exists' })
        if (!body.create && !exists) throw new HttpError(404, { error: 'No such client' })
        const r = check(body.data, slug, await filesIn(dir))
        if (!r.ok) return send(422, { ok: false, errors: r.errors })
        await writeClient(slug, body.data)
        return send(200, { ok: true })
      }
      if (cm[2] && m === 'POST') {
        const name = String(url.searchParams.get('name') ?? '').toLowerCase().replace(/ /g, '-')
        if (!FILE_RE.test(name) || name.includes('..')) throw new HttpError(422, { error: 'File name must be svg, png, jpg, jpeg or webp (letters, digits, . _ -)' })
        let buf
        try {
          buf = await readBody(req, MAX_ASSET)
        } catch (e) {
          if (e.status === 413) throw new HttpError(422, { error: 'File is over 3 MB' })
          throw e
        }
        if (name.endsWith('.svg')) {
          const p = svgProblem(buf.toString('utf8'))
          if (p) throw new HttpError(422, { error: p })
        }
        await mkdir(dir, { recursive: true })
        await writeFile(join(dir, name), buf)
        return send(201, { file: name })
      }
    }
    throw new HttpError(404, { error: 'Not found' })
  }

  async function serveFile(res, file) {
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(await readFile(file))
  }

  const server = createServer(async (req, res) => {
    const send = (status, obj) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(obj))
    }
    try {
      const url = new URL(req.url, 'http://localhost')
      const { pathname } = url
      if (pathname.startsWith('/api/')) return await api(req, res, url, send)
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed')
      if (pathname === '/' || pathname.startsWith('/studio/')) {
        const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice('/studio/'.length))
        const full = resolve(studioDir, rel)
        if (!full.startsWith(studioDir + '/') || !(await isFile(full))) {
          if (pathname === '/') throw new HttpError(503, 'studio UI not built yet')
          throw new HttpError(404, 'Not found')
        }
        return await serveFile(res, full)
      }
      const pm = /^\/p\/([^/]+)\/([^/]+)$/.exec(pathname)
      if (pm) {
        const a = decodeURIComponent(pm[1])
        const b = decodeURIComponent(pm[2])
        let full = null
        if (a === 'fonts') {
          for (const f of Object.values(fonts)) for (const ff of f.files) if (ff.file === b) full = ff.path
        } else if (isSlug(a) && FILE_RE.test(b) && !b.includes('..')) {
          full = join(clientsDir, a, b)
        }
        if (!full || !(await isFile(full))) throw new HttpError(404, 'Not found')
        return await serveFile(res, full)
      }
      throw new HttpError(404, 'Not found')
    } catch (e) {
      if (res.headersSent) return res.end()
      if (e instanceof HttpError) {
        if (typeof e.body === 'string') {
          res.writeHead(e.status, { 'content-type': 'text/plain; charset=utf-8' })
          return res.end(e.body)
        }
        return send(e.status, e.body)
      }
      send(500, { error: String(e.message) })
    }
  })
  return server
}
