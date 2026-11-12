// Studio login (v4). Written from "Studio login (v4, Supabase)" in .claude/specs/contract.md, before the code.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createStudio } from '../src/studio/server.js'
import { SITE_SUBPATH } from './helpers.js'

// In-memory stand-in for the Supabase adapter, same shape as createSupabaseAuth's result.
function fakeAuth() {
  const users = new Map()
  let down = false
  const pub = (u) => ({ id: u.id, email: u.email, role: u.role, createdAt: u.createdAt, lastSignInAt: u.lastSignInAt, banned: u.banned })
  const up = () => { if (down) { const e = new Error('upstream'); e.code = 'upstream'; e.status = 503; throw e } }
  return {
    users,
    setDown: (v) => { down = v },
    add(email, password, role) {
      const u = { id: randomUUID(), email, password, role, createdAt: '2026-01-01T00:00:00Z', lastSignInAt: null, banned: false }
      users.set(u.id, u)
      return u
    },
    async signIn(email, password) {
      up()
      for (const u of users.values()) if (u.email === email && u.password === password) return pub(u)
      return null
    },
    async getUser(id) { up(); const u = users.get(id); return u ? pub(u) : null },
    async listUsers() { up(); return [...users.values()].filter((u) => u.role).map(pub) },
    async createUser({ email, password, role }) {
      up()
      for (const u of users.values()) if (u.email === email) { const e = new Error('exists'); e.code = 'exists'; throw e }
      return pub(this.add(email, password, role))
    },
    async setPassword(id, password) { up(); const u = users.get(id); u.password = password; return pub(u) },
    async setRole(id, role) { up(); const u = users.get(id); u.role = role; return pub(u) },
    async deleteUser(id) { up(); users.delete(id) },
  }
}

let root, server, port, auth, clock
const H = { 'x-khybrio-studio': '1' }

function req(method, path, { json, cookie, host, headers = {} } = {}) {
  return new Promise((res, rej) => {
    const h = { ...headers }
    if (host) h.host = host
    if (cookie) h.cookie = cookie
    let body
    if (json !== undefined) { body = JSON.stringify(json); h['content-type'] = 'application/json' }
    const r = http.request({ host: '127.0.0.1', port, path, method, headers: h }, (resp) => {
      let buf = ''
      resp.on('data', (d) => (buf += d))
      resp.on('end', () => {
        let data = null
        try { data = JSON.parse(buf) } catch {}
        res({ status: resp.statusCode, headers: resp.headers, text: buf, data })
      })
    })
    r.on('error', rej)
    r.end(body)
  })
}
const apiReq = (method, path, opts = {}) => req(method, path, { ...opts, headers: { ...H, ...(opts.headers || {}) } })
const cookieOf = (r) => (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('khybrio_studio='))
async function login(email, password, opts) {
  const r = await apiReq('POST', '/api/login', { json: { email, password }, ...opts })
  return { r, cookie: cookieOf(r) }
}

let admin, editor
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'khybrio-auth-'))
  await mkdir(join(root, 'clients', 'demo'), { recursive: true })
  await writeFile(join(root, 'clients', 'demo', 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
})
beforeEach(async () => {
  if (server) await new Promise((r) => server.close(r))
  auth = fakeAuth()
  admin = auth.add('owner@example.com', 'owner-pass', 'admin')
  editor = auth.add('helper@example.com', 'helper-pass', 'editor')
  auth.add('stranger@example.com', 'stranger-pass', null)
  clock = { t: 1_800_000_000_000 }
  server = createStudio({ root, site: SITE_SUBPATH, publish: async () => ({ ok: true, output: '' }), auth, publicOrigin: 'https://studio.example.com', now: () => clock.t })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  port = server.address().port
})
after(async () => {
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
})

test('publicOrigin without auth throws', () => {
  assert.throws(() => createStudio({ root, site: SITE_SUBPATH, publicOrigin: 'https://studio.example.com' }))
})

test('without auth the session route says login is off', async () => {
  const open = createStudio({ root, site: SITE_SUBPATH })
  await new Promise((r) => open.listen(0, '127.0.0.1', r))
  const p = open.address().port
  const r = await fetch(`http://127.0.0.1:${p}/api/session`, { headers: H })
  assert.deepEqual(await r.json(), { login: false, user: null })
  await new Promise((r) => open.close(r))
})

test('UI, fonts, session and login are open; everything else needs a session', async () => {
  assert.equal((await req('GET', '/studio/studio.js')).status, 200)
  assert.notEqual((await req('GET', '/p/fonts/fraunces.woff2')).status, 401)
  const s = await apiReq('GET', '/api/session')
  assert.equal(s.status, 200)
  assert.deepEqual(s.data, { login: true, user: null })
  for (const [m, p] of [['GET', '/api/state'], ['POST', '/api/publish'], ['GET', '/api/clients/demo'], ['GET', '/api/users'], ['POST', '/api/preview']]) {
    const r = await apiReq(m, p, m === 'GET' ? {} : { json: {} })
    assert.equal(r.status, 401, `${m} ${p}`)
    assert.equal(r.data.error, 'Sign in first')
  }
  assert.equal((await req('GET', '/p/demo/logo.png')).status, 401)
  assert.equal((await req('GET', '/qr/demo.png')).status, 401)
})

test('login sets a strict HttpOnly cookie; the session works and logout ends it', async () => {
  const { r, cookie } = await login('owner@example.com', 'owner-pass')
  assert.equal(r.status, 200)
  assert.deepEqual(r.data, { user: { id: admin.id, email: 'owner@example.com', role: 'admin' } })
  const raw = r.headers['set-cookie'].find((c) => c.startsWith('khybrio_studio='))
  assert.match(raw, /^khybrio_studio=[A-Za-z0-9_-]{43};/)
  for (const part of ['HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=43200']) assert.ok(raw.includes(part), part)
  assert.ok(!raw.includes('Secure'), 'no Secure on plain localhost')
  assert.equal((await apiReq('GET', '/api/state', { cookie })).status, 200)
  assert.equal((await req('GET', '/p/demo/logo.png', { cookie })).status, 200)
  assert.equal((await apiReq('GET', '/api/session', { cookie })).data.user.email, 'owner@example.com')
  assert.equal((await apiReq('POST', '/api/logout', { cookie, json: {} })).status, 200)
  assert.equal((await apiReq('GET', '/api/state', { cookie })).status, 401)
})

test('login through the public origin gets a Secure cookie and that host is accepted', async () => {
  const { r } = await login('owner@example.com', 'owner-pass', { host: 'studio.example.com', headers: { origin: 'https://studio.example.com' } })
  assert.equal(r.status, 200)
  assert.ok(r.headers['set-cookie'].find((c) => c.startsWith('khybrio_studio=')).includes('Secure'))
  const f = await login('owner@example.com', 'owner-pass', { headers: { 'x-forwarded-proto': 'https' } })
  assert.ok(f.r.headers['set-cookie'].find((c) => c.startsWith('khybrio_studio=')).includes('Secure'))
  assert.equal((await apiReq('GET', '/api/session', { headers: { origin: 'https://evil.example.com' } })).status, 403)
  assert.equal((await req('GET', '/studio/studio.js', { host: 'evil.example.com' })).status, 403)
})

test('wrong password, unknown email, no role and banned all get one message', async () => {
  auth.add('banned@example.com', 'b-pass', 'editor').banned = true
  for (const [e, p] of [['owner@example.com', 'nope'], ['nobody@example.com', 'x'], ['stranger@example.com', 'stranger-pass'], ['banned@example.com', 'b-pass']]) {
    const { r, cookie } = await login(e, p)
    assert.equal(r.status, 401, e)
    assert.equal(r.data.error, 'Wrong email or password')
    assert.equal(cookie, undefined)
  }
})

test('10 failures for one email lock that email for 15 minutes', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await login('owner@example.com', 'bad')).r.status, 401)
  const locked = await login('owner@example.com', 'owner-pass')
  assert.equal(locked.r.status, 429)
  assert.equal(locked.r.data.error, 'Too many tries. Wait 15 minutes.')
  assert.equal((await login('helper@example.com', 'helper-pass')).r.status, 200, 'other emails still work')
  clock.t += 15 * 60 * 1000 + 1
  assert.equal((await login('owner@example.com', 'owner-pass')).r.status, 200)
})

test('sessions last 12 hours', async () => {
  const { cookie } = await login('helper@example.com', 'helper-pass')
  clock.t += 12 * 3600 * 1000 - 1000
  auth.users.get(editor.id) // still there
  assert.equal((await apiReq('GET', '/api/state', { cookie })).status, 200)
  clock.t += 2000
  assert.equal((await apiReq('GET', '/api/state', { cookie })).status, 401)
})

test('re-check every 5 minutes: removed or demoted users lose access, Supabase down keeps the session', async () => {
  const { cookie } = await login('helper@example.com', 'helper-pass')
  auth.users.get(editor.id).role = null
  assert.equal((await apiReq('GET', '/api/state', { cookie })).status, 200, 'not re-checked yet')
  clock.t += 5 * 60 * 1000 + 1
  auth.setDown(true)
  assert.equal((await apiReq('GET', '/api/state', { cookie })).status, 503)
  auth.setDown(false)
  assert.equal((await apiReq('GET', '/api/state', { cookie })).status, 401)
})

test('editors cannot use team routes', async () => {
  const { cookie } = await login('helper@example.com', 'helper-pass')
  const r = await apiReq('GET', '/api/users', { cookie })
  assert.equal(r.status, 403)
  assert.equal(r.data.error, 'Admins only')
  assert.equal((await apiReq('POST', '/api/users', { cookie, json: { email: 'x@example.com', role: 'admin' } })).status, 403)
})

test('admin creates a login with a generated password that works once handed over', async () => {
  const { cookie } = await login('owner@example.com', 'owner-pass')
  const list = await apiReq('GET', '/api/users', { cookie })
  assert.deepEqual(list.data.users.map((u) => u.email), ['helper@example.com', 'owner@example.com'])
  const r = await apiReq('POST', '/api/users', { cookie, json: { email: 'new@example.com', role: 'editor' } })
  assert.equal(r.status, 201)
  assert.equal(r.data.user.email, 'new@example.com')
  assert.equal(r.data.user.role, 'editor')
  assert.match(r.data.password, /^[abcdefghjkmnpqrstuvwxyzACDEFGHJKMNPQRTUVWXYZ2346789]{5}(-[abcdefghjkmnpqrstuvwxyzACDEFGHJKMNPQRTUVWXYZ2346789]{5}){3}$/)
  assert.equal((await login('new@example.com', r.data.password)).r.status, 200)
  const dup = await apiReq('POST', '/api/users', { cookie, json: { email: 'new@example.com', role: 'editor' } })
  assert.equal(dup.status, 409)
  assert.equal(dup.data.error, 'That email already has an account')
  for (const bad of [{ email: 'not-an-email', role: 'editor' }, { email: 'a@example.com', role: 'owner' }, { email: 'a@example.com' }]) {
    assert.equal((await apiReq('POST', '/api/users', { cookie, json: bad })).status, 422, JSON.stringify(bad))
  }
})

test('reset password and remove end the other person\'s sessions', async () => {
  const a = await login('owner@example.com', 'owner-pass')
  const e = await login('helper@example.com', 'helper-pass')
  const reset = await apiReq('POST', `/api/users/${editor.id}/password`, { cookie: a.cookie, json: {} })
  assert.equal(reset.status, 200)
  assert.equal(typeof reset.data.password, 'string')
  assert.equal((await apiReq('GET', '/api/state', { cookie: e.cookie })).status, 401)
  assert.equal((await login('helper@example.com', 'helper-pass')).r.status, 401, 'old password gone')
  const e2 = await login('helper@example.com', reset.data.password)
  assert.equal(e2.r.status, 200)
  assert.equal((await apiReq('DELETE', `/api/users/${editor.id}`, { cookie: a.cookie })).status, 200)
  assert.equal((await apiReq('GET', '/api/state', { cookie: e2.cookie })).status, 401)
  assert.equal(auth.users.has(editor.id), false)
})

test('role change applies; admins cannot demote or delete themselves; ids must be UUIDs', async () => {
  const { cookie } = await login('owner@example.com', 'owner-pass')
  const r = await apiReq('PUT', `/api/users/${editor.id}`, { cookie, json: { role: 'admin' } })
  assert.equal(r.status, 200)
  assert.equal(r.data.user.role, 'admin')
  assert.equal((await apiReq('PUT', `/api/users/${editor.id}`, { cookie, json: { role: 'boss' } })).status, 422)
  const self1 = await apiReq('PUT', `/api/users/${admin.id}`, { cookie, json: { role: 'editor' } })
  assert.equal(self1.status, 409)
  assert.equal(self1.data.error, 'You cannot do that to your own account')
  assert.equal((await apiReq('DELETE', `/api/users/${admin.id}`, { cookie })).status, 409)
  assert.equal((await apiReq('DELETE', '/api/users/..%2f..', { cookie })).status, 400)
  assert.equal((await apiReq('DELETE', '/api/users/not-a-uuid', { cookie })).status, 400)
})

test('Supabase errors on team routes are 502 with a plain message', async () => {
  const { cookie } = await login('owner@example.com', 'owner-pass')
  auth.setDown(true)
  const r = await apiReq('GET', '/api/users', { cookie })
  assert.equal(r.status, 502)
  assert.equal(r.data.error, 'Supabase did not answer. Try again.')
})

test('the studio header rule still applies to login', async () => {
  const r = await req('POST', '/api/login', { json: { email: 'owner@example.com', password: 'owner-pass' } })
  assert.equal(r.status, 403)
})
