// Studio API: local dashboard backend. See "Studio" in .claude/specs/contract.md.
import { createServer } from 'node:http'
import { readdir, readFile, writeFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { createWriteStream, createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { validateClient, LIMITS } from '../validate.js'
import { migrateRaw } from '../migrate.js'
import { applyRename, readRedirects, writeRedirects } from '../redirects.js'
import { PALETTES } from '../palettes.js'
import { loadEnv } from '../publish/env.js'
import { createLogin } from './login.js'
import { createR2Store } from '../publish/r2.js'
import { publishLive } from '../publish/index.js'
import { renderPage } from '../render.js'
import { looks } from '../looks/index.js'
import { fonts } from '../fonts.js'
import { icon } from '../icons.js'
import { KINDS } from '../kinds.js'
import { sniff, inspectMp4, MEDIA } from '../assets.js'
import { STYLE, STYLE_KEYS } from '../style.js'
import { listClientFolders } from '../build.js'
import QRCode from 'qrcode'

const here = dirname(fileURLToPath(import.meta.url))
const studioDir = resolve(here, '../../studio')
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_JSON = 256 * 1024
const MEDIA_RE = /^[a-z0-9][a-z0-9._-]*\.(svg|png|jpe?g|webp|mp4)$/i
const ORPHAN_AGE_MS = 60 * 60 * 1000
const SLOW_START = 'This MP4 starts slowly on phones (index at the end). Re-export with "optimize for web" or "fast start".'
const mbText = (n) => `${n / (1024 * 1024)} MB`
let uploadSeq = 0
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
  '.mp4': 'video/mp4',
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

export async function defaultPublish({ root, site, force = false }) {
  const res = loadEnv(root)
  if (!res.ok) return { ok: false, output: `Cloudflare is not set up: missing ${res.missing.join(', ')} in .env.local` }
  const store = createR2Store({
    accountId: res.env.CF_ACCOUNT_ID,
    bucket: res.env.R2_BUCKET,
    accessKeyId: res.env.R2_ACCESS_KEY_ID,
    secretAccessKey: res.env.R2_SECRET_ACCESS_KEY,
  })
  return publishLive({ root, site, store, force })
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
  let parsed
  try {
    parsed = buf.length ? JSON.parse(buf.toString('utf8')) : {}
  } catch {
    throw new HttpError(400, { error: 'Invalid JSON' })
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, { error: 'Body must be a JSON object' })
  return parsed
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
const isFile = (p) => stat(p).then((s) => s.isFile(), () => false)

export function createStudio({ root, site, publish = defaultPublish, auth = null, publicOrigin = null, now = Date.now } = {}) {
  if (publicOrigin && !auth) throw new Error('createStudio: publicOrigin needs auth (an open studio must never be reachable from outside)')
  const login = auth ? createLogin({ auth, now, publicOrigin, HttpError }) : null
  const clientsDir = join(root, 'clients')
  const previewSite = { origin: 'http://localhost', base: '/p/', mainSite: site.mainSite }

  const filesIn = async (dir) => {
    try {
      return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isFile() && !d.name.startsWith('.up-')).map((d) => d.name).sort()
    } catch {
      return []
    }
  }
  const loadClient = async (slug) =>
    (await import(`${pathToFileURL(join(clientsDir, slug, 'client.js')).href}?v=${Date.now()}-${Math.random()}`)).default

  const bodyFontIds = Object.entries(fonts).filter(([, f]) => f.body).map(([id]) => id)
  const check = (data, folder, files) =>
    validateClient(data, { folder, looks: lookIds, fonts: fontIds, bodyFonts: bodyFontIds, files: files.filter((f) => f !== 'client.js') })

  // One write lock for every route that changes files under clients/.
  let lockTail = Promise.resolve()
  const withLock = (fn) => {
    const p = lockTail.then(fn)
    lockTail = p.then(() => {}, () => {})
    return p
  }
  let publishing = false
  let backup = { state: 'idle', at: null, output: '' }

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
      const base = { slug, name: '', tagline: '', look: '', theme: { bg: '', ink: '', accent: '' }, logo: null, blockCount: 0, warnings: [], liveUrl: `${site.origin}${site.base}${slug}/`, valid: false, errors: [] }
      let raw
      try {
        raw = await loadClient(slug)
      } catch (e) {
        clients.push({ ...base, errors: [`client.js could not be loaded: ${e.message}`] })
        continue
      }
      const r = check(raw, slug, await filesIn(join(clientsDir, slug)))
      const o = raw && typeof raw === 'object' ? raw : {}
      const m = migrateRaw(o)
      clients.push({
        ...base,
        name: typeof o.name === 'string' ? o.name : '',
        tagline: typeof o.tagline === 'string' ? o.tagline : '',
        look: typeof o.look === 'string' ? o.look : '',
        theme: { bg: o.theme?.bg ?? '', ink: o.theme?.ink ?? '', accent: o.theme?.accent ?? '' },
        logo: typeof o.logo === 'string' ? o.logo : null,
        blockCount: Array.isArray(m.blocks) ? m.blocks.length : 0,
        warnings: r.warnings ?? [],
        valid: !!r.ok,
        errors: r.ok ? [] : r.errors,
      })
    }
    return {
      site,
      looks: Object.entries(looks).map(([id, l]) => ({ id, label: l.label, supports: l.supports, styleDefaults: l.styleDefaults })),
      fonts: Object.entries(fonts).map(([id, f]) => ({ id, family: f.family, group: f.group, body: !!f.body })),
      kinds: Object.entries(KINDS).map(([id, k]) => ({ id, label: k.label ?? '', scheme: k.scheme, social: !!k.social })),
      palettes: PALETTES.map((p) => ({ id: p.id, label: p.label, bg: p.bg, ink: p.ink, accent: p.accent })),
      limits: LIMITS,
      style: Object.fromEntries(STYLE_KEYS.map((k) => [k, Object.keys(STYLE[k])])),
      media: MEDIA,
      backup,
      clients,
      pending: await pending(),
    }
  }

  async function writeClient(slug, data) {
    const dir = join(clientsDir, slug)
    await mkdir(dir, { recursive: true })
    const file = join(dir, 'client.js')
    await writeText(file, `export default ${JSON.stringify(data, null, 2)}\n`)
  }
  async function writeText(file, text) {
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
    await writeFile(tmp, text)
    await rename(tmp, file)
  }

  async function renameClient(from, to) {
    const folders = await listClientFolders(clientsDir).catch(() => [])
    const redirects = await readRedirects(clientsDir)
    const plan = applyRename(redirects, from, to, folders, folders)
    if (!plan.ok) throw new HttpError(plan.status, { error: plan.error })
    const oldDir = join(clientsDir, from)
    const newDir = join(clientsDir, to)
    const oldText = await readFile(join(oldDir, 'client.js'), 'utf8')
    let data
    try {
      data = migrateRaw(await loadClient(from))
    } catch (e) {
      throw new HttpError(422, { error: `client.js could not be loaded: ${e.message}` })
    }
    const done = []
    try {
      await rename(oldDir, newDir)
      done.push('folder')
      await writeClient(to, { ...data, slug: to })
      done.push('file')
      await writeRedirects(clientsDir, plan.redirects)
    } catch (e) {
      await rm(join(clientsDir, '_redirects.json.tmp'), { force: true }).catch(() => {})
      try {
        if (done.includes('folder')) {
          if (done.includes('file')) await writeText(join(newDir, 'client.js'), oldText)
          await rename(newDir, oldDir)
        }
      } catch {}
      throw new HttpError(500, { error: `rename failed and was undone: ${e.message}` })
    }
    try {
      const manifest = await readManifest()
      if (manifest[from]) {
        manifest[to] = { ...(manifest[to] ?? {}), ...manifest[from] }
        delete manifest[from]
        await writeManifest(manifest)
      }
    } catch {}
    return { ok: true, slug: to }
  }

  // Upload manifest: <root>/.studio/uploads.json = { slug: { file: uploadedAtMs } }. Only files listed here are ever cleaned up.
  const manifestFile = join(root, '.studio', 'uploads.json')
  async function readManifest() {
    try {
      const m = JSON.parse(await readFile(manifestFile, 'utf8'))
      return m && typeof m === 'object' && !Array.isArray(m) ? m : {}
    } catch {
      return {}
    }
  }
  async function writeManifest(m) {
    await mkdir(dirname(manifestFile), { recursive: true })
    await writeText(manifestFile, JSON.stringify(m, null, 2) + '\n')
  }

  // Delete files that (a) the server wrote via upload, (b) the saved data no longer references, (c) are over an hour old.
  // Anything not in the manifest (hand-placed files) is never touched.
  async function removeOrphans(slug, dir, data) {
    const manifest = await readManifest()
    const entries = manifest[slug]
    if (!entries || typeof entries !== 'object') return
    const bg = data?.background && typeof data.background === 'object' ? data.background : {}
    const used = new Set([data?.logo, data?.cover, bg.file, bg.poster].filter((v) => typeof v === 'string'))
    const cutoff = Date.now() - ORPHAN_AGE_MS
    let changed = false
    for (const [f, at] of Object.entries(entries)) {
      if (!MEDIA_RE.test(f) || f.includes('..') || f === 'client.js') continue // never a path, never anything we would not have written
      if (used.has(f) || typeof at !== 'number' || at > cutoff) continue
      await rm(join(dir, f), { force: true }).catch(() => {})
      delete entries[f]
      changed = true
    }
    if (changed) {
      if (!Object.keys(entries).length) delete manifest[slug]
      await writeManifest(manifest)
    }
  }

  // Stream the request body to a temp file (counter enforces the cap), then sniff, then move into place.
  async function receiveUpload(req, dir, name, slug) {
    const ext = extname(name).slice(1)
    const isVideo = ext === 'mp4'
    const cap = isVideo ? MEDIA.videoMax : MEDIA.imageMax
    await mkdir(dir, { recursive: true })
    const tmp = join(dir, `.up-${process.pid}-${++uploadSeq}`)
    const out = createWriteStream(tmp)
    const hash = createHash('md5')
    let size = 0
    let over = false
    let failed = null
    out.on('error', (e) => { failed = e })
    try {
      for await (const chunk of req) {
        if (over) continue // drain the rest without keeping it
        size += chunk.length
        if (size > cap) {
          over = true
          continue
        }
        hash.update(chunk)
        if (!out.write(chunk)) await once(out, 'drain').catch(() => {})
      }
      out.end()
      await once(out, 'close')
      if (failed) throw failed
      if (over) throw new HttpError(422, { error: `File is over ${mbText(cap)}` })
      if (size === 0) throw new HttpError(422, { error: 'File is empty' })
      const buf = await readFile(tmp)
      const warnings = []
      let final = name
      if (isVideo) {
        const r = inspectMp4(buf)
        if (!r.ok) throw new HttpError(422, { error: r.error })
        if (!r.faststart) warnings.push(SLOW_START)
        final = `${name.slice(0, -4)}-${hash.digest('hex').slice(0, 8)}.mp4`
      } else {
        const p = sniff(buf, ext)
        if (p) throw new HttpError(422, { error: p })
      }
      await withLock(async () => {
        await rename(tmp, join(dir, final))
        const manifest = await readManifest()
        manifest[slug] = { ...(manifest[slug] ?? {}), [final]: Date.now() }
        await writeManifest(manifest)
      })
      return { file: final, warnings }
    } catch (e) {
      // createWriteStream opens the file asynchronously: if the request died before the open finished,
      // rm() would run first and the open would then recreate the temp file. Wait for the stream to
      // close (destroy() defers the close until the open completes) before removing it.
      if (!out.closed) {
        const closed = once(out, 'close').catch(() => {})
        out.destroy()
        await closed
      }
      await rm(tmp, { force: true }).catch(() => {})
      throw e
    }
  }

  async function api(req, res, url, send) {
    if (req.headers['x-khybrio-studio'] !== '1') throw new HttpError(403, { error: 'Missing studio header' })
    const origin = req.headers.origin
    if (origin !== undefined) {
      const port = server.address()?.port
      if (origin !== `http://localhost:${port}` && origin !== `http://127.0.0.1:${port}` && !(publicOrigin && origin === publicOrigin)) {
        throw new HttpError(403, { error: 'Bad origin' })
      }
    }
    const { pathname } = url
    const m = req.method
    if (pathname === '/api/session' && m === 'GET') {
      return send(200, { login: !!login, user: login ? await login.current(req) : null })
    }
    if (login) {
      if (pathname === '/api/login' && m === 'POST') {
        const r = await login.signIn(req, await readJson(req))
        return send(200, { user: r.user }, { 'set-cookie': r.setCookie })
      }
      if (pathname === '/api/logout' && m === 'POST') return send(200, { ok: true }, { 'set-cookie': login.signOut(req) })
      const user = await login.current(req)
      if (!user) throw new HttpError(401, { error: 'Sign in first' })
      if (await login.team(req, pathname, user, readJson, send)) return
    }
    if (pathname === '/api/state' && m === 'GET') return send(200, await state())
    if (pathname === '/api/preview' && m === 'POST') {
      const body = await readJson(req)
      if (!isSlug(body.slug)) throw new HttpError(400, { error: 'Bad slug' })
      const files = await filesIn(join(clientsDir, body.slug))
      const r = check(body.data, body.slug, files)
      if (!r.ok) return send(200, { ok: false, errors: r.errors, warnings: r.warnings ?? [], html: null })
      return send(200, { ok: true, errors: [], warnings: r.warnings ?? [], html: renderPage(r.client, previewSite, { looks, fonts, icon }) })
    }
    if (pathname === '/api/publish' && m === 'POST') {
      const body = await readJson(req)
      if (publishing) throw new HttpError(409, { error: 'A publish is already running' })
      publishing = true
      try {
        const out = await publish({ root, site, force: body.force === true })
        const { push, ...rest } = out ?? {}
        if (push && typeof push.then === 'function') {
          backup = { state: 'pushing', at: null, output: '' }
          const mine = backup
          push.then(
            () => { if (backup === mine) backup = { state: 'idle', at: new Date().toISOString(), output: '' } },
            (e) => { if (backup === mine) backup = { state: 'failed', at: new Date().toISOString(), output: String(e?.message ?? e) } },
          )
        }
        return send(200, rest)
      } finally {
        publishing = false
      }
    }
    const cm = /^\/api\/clients\/([^/]+)(\/assets|\/rename)?$/.exec(pathname)
    if (cm) {
      const slug = decodeURIComponent(cm[1])
      if (!isSlug(slug)) throw new HttpError(400, { error: 'Bad slug' })
      const dir = join(clientsDir, slug)
      if (cm[2] === '/rename' && m === 'POST') {
        const body = await readJson(req)
        return send(200, await withLock(() => renameClient(slug, body.to)))
      }
      if (!cm[2] && m === 'GET') {
        if (!(await isFile(join(dir, 'client.js')))) throw new HttpError(404, { error: 'No such client' })
        let data
        try {
          data = await loadClient(slug)
        } catch (e) {
          throw new HttpError(422, { error: `client.js could not be loaded: ${e.message}` })
        }
        return send(200, { data: migrateRaw(data), files: (await filesIn(dir)).filter((f) => f !== 'client.js') })
      }
      if (!cm[2] && m === 'PUT') {
        const body = await readJson(req)
        return await withLock(async () => {
          const exists = await isFile(join(dir, 'client.js'))
          if (body.create && exists) throw new HttpError(409, { error: 'Client already exists' })
          if (body.create && has(await readRedirects(clientsDir), slug)) throw new HttpError(409, { error: 'address is an old address of another page' })
          if (!body.create && !exists) throw new HttpError(404, { error: 'No such client' })
          const r = check(body.data, slug, await filesIn(dir))
          if (!r.ok) return send(422, { ok: false, errors: r.errors, warnings: r.warnings ?? [] })
          const saved = migrateRaw(body.data)
          await writeClient(slug, saved)
          await removeOrphans(slug, dir, saved)
          return send(200, { ok: true, warnings: r.warnings ?? [] })
        })
      }
      if (cm[2] && m === 'POST') {
        const name = String(url.searchParams.get('name') ?? '').toLowerCase().replace(/ /g, '-')
        if (!MEDIA_RE.test(name) || name.includes('..')) throw new HttpError(422, { error: 'File name must be svg, png, jpg, jpeg, webp or mp4 (letters, digits, . _ -)' })
        return send(201, await receiveUpload(req, dir, name, slug))
      }
    }
    throw new HttpError(404, { error: 'Not found' })
  }

  async function serveFile(res, file) {
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(await readFile(file))
  }

  // Single byte range per RFC 7233, same rules as worker/handler.js. null = ignore header, 'bad' = unsatisfiable.
  function parseRange(header, size) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
    if (!m || (m[1] === '' && m[2] === '')) return null
    if (m[1] === '') {
      const n = Number(m[2])
      if (n === 0 || size === 0) return 'bad'
      return { start: Math.max(0, size - n), end: size - 1 }
    }
    const start = Number(m[1])
    const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
    if (start >= size || start > end) return 'bad'
    return { start, end }
  }

  async function serveMedia(req, res, file) {
    const size = (await stat(file)).size
    const headers = { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store', 'accept-ranges': 'bytes' }
    const header = req.method === 'GET' ? req.headers.range : undefined
    const r = header ? parseRange(header, size) : null
    if (r === 'bad') {
      res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` })
      return res.end()
    }
    const range = r ?? { start: 0, end: size - 1 }
    res.writeHead(r ? 206 : 200, { ...headers, 'content-length': String(size === 0 ? 0 : range.end - range.start + 1), ...(r ? { 'content-range': `bytes ${r.start}-${r.end}/${size}` } : {}) })
    if (req.method === 'HEAD' || size === 0) return res.end()
    const stream = createReadStream(file, range)
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  }

  const server = createServer(async (req, res) => {
    const send = (status, obj, extra = {}) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra })
      res.end(JSON.stringify(obj))
    }
    try {
      // DNS-rebinding guard: only answer to our own loopback names on our own port
      const port = req.socket.localPort
      const hostOk = req.headers.host === `localhost:${port}` || req.headers.host === `127.0.0.1:${port}` || (login?.publicHost && req.headers.host === login.publicHost)
      if (!hostOk) throw new HttpError(403, 'Forbidden host')
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
      // v4: client files and QR codes need a session; the UI and fonts above/below stay open so sign-in can draw.
      if (login && (pathname.startsWith('/qr/') || (pathname.startsWith('/p/') && !pathname.startsWith('/p/fonts/')))) {
        if (!(await login.current(req))) throw new HttpError(401, 'Sign in first')
      }
      // QR for a page's live URL (the same address the NFC chip gets). Public data, so plain GET:
      // an <img> cannot send the studio header. Only for a client whose client.js loads.
      const qm = /^\/qr\/([^/]+)\.(png|svg)$/.exec(pathname)
      if (qm) {
        const [, slug, ext] = qm
        if (!isSlug(slug) || !(await isFile(join(clientsDir, slug, 'client.js')))) throw new HttpError(404, 'Not found')
        try {
          await loadClient(slug)
        } catch {
          throw new HttpError(404, 'Not found')
        }
        const liveUrl = `${site.origin}${site.base}${slug}/`
        const opts = { errorCorrectionLevel: 'M', margin: 4, color: { dark: '#0f2b29', light: '#ffffff' } }
        const body = ext === 'png' ? await QRCode.toBuffer(liveUrl, { ...opts, type: 'png', width: 1200 }) : await QRCode.toString(liveUrl, { ...opts, type: 'svg' })
        const headers = { 'content-type': ext === 'png' ? 'image/png' : 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store' }
        if (url.searchParams.has('download')) headers['content-disposition'] = `attachment; filename="${slug}-qr.${ext}"`
        res.writeHead(200, headers)
        return res.end(body)
      }
      const pm = /^\/p\/([^/]+)\/([^/]+)$/.exec(pathname)
      if (pm) {
        const a = decodeURIComponent(pm[1])
        const b = decodeURIComponent(pm[2])
        let full = null
        if (a === 'fonts') {
          for (const f of Object.values(fonts)) for (const ff of f.files) if (ff.file === b) full = ff.path
        } else if (isSlug(a) && MEDIA_RE.test(b) && !b.includes('..')) {
          full = join(clientsDir, a, b)
        }
        if (!full || !(await isFile(full))) throw new HttpError(404, 'Not found')
        return extname(full).toLowerCase() === '.mp4' ? await serveMedia(req, res, full) : await serveFile(res, full)
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
