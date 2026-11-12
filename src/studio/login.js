// Studio sessions, sign-in limits and the admin Team routes (v4).
// Contract: "Studio login (v4, Supabase)" in .claude/specs/contract.md. Sessions live in memory only.
import { randomBytes, randomInt } from 'node:crypto'
import { ROLES } from './supabase.js'

const COOKIE = 'khybrio_studio'
const TTL_MS = 12 * 60 * 60 * 1000
const RECHECK_MS = 5 * 60 * 1000
const WINDOW_MS = 15 * 60 * 1000
const PER_EMAIL = 10
const GLOBAL = 100
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKMNPQRTUVWXYZ2346789'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UPSTREAM = 'Supabase did not answer. Try again.'

// 20 characters in 4 groups of 5, no look-alike characters (0/O, 1/l/I, 5/S, B/8).
export function generatePassword() {
  let s = ''
  for (let i = 0; i < 20; i++) {
    if (i && i % 5 === 0) s += '-'
    s += ALPHABET[randomInt(ALPHABET.length)]
  }
  return s
}

const brief = (u) => ({ id: u.id, email: u.email, role: u.role })

export function createLogin({ auth, now, publicOrigin, HttpError }) {
  const sessions = new Map() // token -> { user, expires, checked }
  const fails = new Map() // email -> [timestamps]
  let globalFails = []
  const publicHost = publicOrigin ? new URL(publicOrigin).host : null
  const recent = (list) => list.filter((t) => now() - t < WINDOW_MS)

  function tokenOf(req) {
    for (const part of String(req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=')
      if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim()
    }
    return null
  }
  const viaPublic = (req) => (publicHost !== null && req.headers.host === publicHost) || req.headers['x-forwarded-proto'] === 'https'
  const cookie = (req, token, maxAge) =>
    `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${viaPublic(req) ? '; Secure' : ''}`
  const endSessionsOf = (id) => { for (const [t, s] of sessions) if (s.user.id === id) sessions.delete(t) }
  function sweep() {
    for (const [t, s] of sessions) if (now() >= s.expires) sessions.delete(t)
    if (fails.size > 1000) for (const [e, list] of fails) { const r = recent(list); if (r.length) fails.set(e, r); else fails.delete(e) }
  }

  // The signed-in user, or null. Re-reads the account from Supabase every 5 minutes of use.
  async function current(req) {
    const token = tokenOf(req)
    const s = token && sessions.get(token)
    if (!s) return null
    if (now() >= s.expires) { sessions.delete(token); return null }
    if (now() - s.checked > RECHECK_MS) {
      let u
      try {
        u = await auth.getUser(s.user.id)
      } catch {
        throw new HttpError(503, { error: UPSTREAM })
      }
      if (!u || u.banned || !u.role) { sessions.delete(token); return null }
      s.user = brief(u)
      s.checked = now()
    }
    return s.user
  }

  async function signIn(req, body) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    globalFails = recent(globalFails)
    const mine = recent(fails.get(email) || [])
    fails.set(email, mine)
    if (mine.length >= PER_EMAIL || globalFails.length >= GLOBAL) throw new HttpError(429, { error: 'Too many tries. Wait 15 minutes.' })
    let u = null
    if (email && password && email.length <= 254 && password.length <= 200) {
      try {
        u = await auth.signIn(email, password)
      } catch {
        throw new HttpError(502, { error: UPSTREAM })
      }
    }
    if (!u || u.banned || !u.role) {
      mine.push(now())
      globalFails.push(now())
      throw new HttpError(401, { error: 'Wrong email or password' })
    }
    fails.delete(email)
    sweep()
    const token = randomBytes(32).toString('base64url')
    sessions.set(token, { user: brief(u), expires: now() + TTL_MS, checked: now() })
    return { user: brief(u), setCookie: cookie(req, token, TTL_MS / 1000) }
  }

  function signOut(req) {
    const token = tokenOf(req)
    if (token) sessions.delete(token)
    return cookie(req, '', 0)
  }

  const call = async (fn) => {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof HttpError) throw e
      if (e?.code === 'exists') throw new HttpError(409, { error: 'That email already has an account' })
      throw new HttpError(502, { error: UPSTREAM })
    }
  }

  // /api/users[...] for admins. Returns true when the path was a Team route.
  async function team(req, pathname, user, readJson, send) {
    const one = /^\/api\/users\/([^/]+)(\/password)?$/.exec(pathname)
    if (pathname !== '/api/users' && !one) return false
    if (user.role !== 'admin') throw new HttpError(403, { error: 'Admins only' })
    const m = req.method
    if (!one) {
      if (m === 'GET') {
        const users = await call(() => auth.listUsers())
        send(200, { users: users.sort((a, b) => a.email.localeCompare(b.email)) })
        return true
      }
      if (m === 'POST') {
        const body = await readJson(req)
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
        if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(422, { error: 'Enter a valid email address' })
        if (!ROLES.includes(body.role)) throw new HttpError(422, { error: 'Role must be admin or editor' })
        const password = generatePassword()
        const created = await call(() => auth.createUser({ email, password, role: body.role }))
        send(201, { user: created, password })
        return true
      }
      throw new HttpError(404, { error: 'Not found' })
    }
    let id = ''
    try { id = decodeURIComponent(one[1]) } catch { id = '' }
    if (!UUID_RE.test(id)) throw new HttpError(400, { error: 'Bad id' })
    if (one[2] && m === 'POST') {
      const password = generatePassword()
      await call(() => auth.setPassword(id, password))
      endSessionsOf(id)
      send(200, { password })
      return true
    }
    if (!one[2] && m === 'PUT') {
      const body = await readJson(req)
      if (!ROLES.includes(body.role)) throw new HttpError(422, { error: 'Role must be admin or editor' })
      if (id === user.id) throw new HttpError(409, { error: 'You cannot do that to your own account' })
      const updated = await call(() => auth.setRole(id, body.role))
      for (const s of sessions.values()) if (s.user.id === id) s.user = { ...s.user, role: body.role }
      send(200, { user: updated })
      return true
    }
    if (!one[2] && m === 'DELETE') {
      if (id === user.id) throw new HttpError(409, { error: 'You cannot do that to your own account' })
      await call(() => auth.deleteUser(id))
      endSessionsOf(id)
      send(200, { ok: true })
      return true
    }
    throw new HttpError(404, { error: 'Not found' })
  }

  return { current, signIn, signOut, team, publicHost }
}
