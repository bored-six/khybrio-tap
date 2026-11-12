// Supabase adapter + studio env (v4). Written from "Studio login (v4, Supabase)" in .claude/specs/contract.md.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSupabaseAuth } from '../src/studio/supabase.js'
import { loadStudioEnv } from '../src/publish/env.js'

const CFG = { url: 'https://proj.supabase.co', anonKey: 'ANON-KEY-123', serviceKey: 'SERVICE-KEY-456' }
const ID = '0b5f8a62-3c1d-4e7a-9f00-1234567890ab'
const raw = (o = {}) => ({ id: ID, email: 'a@example.com', app_metadata: { studio_role: 'editor' }, created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null, banned_until: null, ...o })

function fakeFetch(handler) {
  const calls = []
  const fetch = async (url, init = {}) => {
    const c = { url: String(url), method: init.method || 'GET', headers: new Headers(init.headers), body: init.body ? JSON.parse(init.body) : undefined }
    calls.push(c)
    const [status, body] = handler(c)
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }
  return { fetch, calls }
}

test('signIn uses the anon key and maps the user', async () => {
  const f = fakeFetch(() => [200, { access_token: 't', user: raw() }])
  const a = createSupabaseAuth({ ...CFG, fetch: f.fetch })
  const u = await a.signIn('a@example.com', 'pw')
  assert.deepEqual(u, { id: ID, email: 'a@example.com', role: 'editor', createdAt: '2026-01-01T00:00:00Z', lastSignInAt: null, banned: false })
  assert.equal(f.calls[0].url, 'https://proj.supabase.co/auth/v1/token?grant_type=password')
  assert.equal(f.calls[0].method, 'POST')
  assert.equal(f.calls[0].headers.get('apikey'), 'ANON-KEY-123')
  assert.deepEqual(f.calls[0].body, { email: 'a@example.com', password: 'pw' })
})

test('signIn: 400/401 -> null; 500 -> upstream error without keys in the message', async () => {
  for (const s of [400, 401]) assert.equal(await createSupabaseAuth({ ...CFG, fetch: fakeFetch(() => [s, { error: 'invalid_grant' }]).fetch }).signIn('a', 'b'), null)
  await assert.rejects(createSupabaseAuth({ ...CFG, fetch: fakeFetch(() => [500, {}]).fetch }).signIn('a', 'b'), (e) => {
    assert.equal(e.code, 'upstream')
    assert.equal(e.status, 500)
    assert.ok(!e.message.includes('KEY'))
    return true
  })
})

test('roles: only admin/editor count; banned_until in the future = banned', async () => {
  const cases = [[{ app_metadata: { studio_role: 'admin' } }, 'admin'], [{ app_metadata: { studio_role: 'owner' } }, null], [{ app_metadata: {} }, null], [{ app_metadata: undefined }, null]]
  for (const [o, role] of cases) {
    const a = createSupabaseAuth({ ...CFG, fetch: fakeFetch(() => [200, raw(o)]).fetch })
    assert.equal((await a.getUser(ID)).role, role)
  }
  const b = createSupabaseAuth({ ...CFG, fetch: fakeFetch(() => [200, raw({ banned_until: '2999-01-01T00:00:00Z' })]).fetch })
  assert.equal((await b.getUser(ID)).banned, true)
  const c = createSupabaseAuth({ ...CFG, fetch: fakeFetch(() => [200, raw({ banned_until: '2000-01-01T00:00:00Z' })]).fetch })
  assert.equal((await c.getUser(ID)).banned, false)
})

test('admin calls use the service key; getUser 404 -> null', async () => {
  const f = fakeFetch(() => [404, { msg: 'not found' }])
  const a = createSupabaseAuth({ ...CFG, fetch: f.fetch })
  assert.equal(await a.getUser(ID), null)
  assert.equal(f.calls[0].url, `https://proj.supabase.co/auth/v1/admin/users/${ID}`)
  assert.equal(f.calls[0].headers.get('apikey'), 'SERVICE-KEY-456')
  assert.equal(f.calls[0].headers.get('authorization'), 'Bearer SERVICE-KEY-456')
})

test('createUser confirms the email and sets the studio role; existing email -> exists', async () => {
  const f = fakeFetch(() => [200, raw({ app_metadata: { studio_role: 'admin' } })])
  const u = await createSupabaseAuth({ ...CFG, fetch: f.fetch }).createUser({ email: 'a@example.com', password: 'pw', role: 'admin' })
  assert.equal(u.role, 'admin')
  assert.equal(f.calls[0].method, 'POST')
  assert.equal(f.calls[0].url, 'https://proj.supabase.co/auth/v1/admin/users')
  assert.deepEqual(f.calls[0].body, { email: 'a@example.com', password: 'pw', email_confirm: true, app_metadata: { studio_role: 'admin' } })
  const dup = fakeFetch(() => [422, { error_code: 'email_exists', msg: 'A user with this email address has already been registered' }])
  await assert.rejects(createSupabaseAuth({ ...CFG, fetch: dup.fetch }).createUser({ email: 'a@example.com', password: 'pw', role: 'editor' }), (e) => e.code === 'exists')
})

test('setPassword, setRole, deleteUser hit the right endpoints', async () => {
  const f = fakeFetch((c) => [200, c.method === 'DELETE' ? {} : raw()])
  const a = createSupabaseAuth({ ...CFG, fetch: f.fetch })
  await a.setPassword(ID, 'new-pw')
  await a.setRole(ID, 'admin')
  await a.deleteUser(ID)
  assert.deepEqual(f.calls.map((c) => [c.method, c.url.replace(CFG.url, ''), c.body]), [
    ['PUT', `/auth/v1/admin/users/${ID}`, { password: 'new-pw' }],
    ['PUT', `/auth/v1/admin/users/${ID}`, { app_metadata: { studio_role: 'admin' } }],
    ['DELETE', `/auth/v1/admin/users/${ID}`, undefined],
  ])
})

test('listUsers pages through 200 at a time and keeps studio roles only', async () => {
  const page = (n, count) => Array.from({ length: count }, (_, i) => raw({ id: `${n}-${i}`, email: `u${n}-${i}@example.com`, app_metadata: { studio_role: i % 2 ? 'editor' : undefined } }))
  const f = fakeFetch((c) => {
    const p = Number(new URL(c.url).searchParams.get('page'))
    return [200, { users: p === 1 ? page(1, 200) : page(2, 3) }]
  })
  const users = await createSupabaseAuth({ ...CFG, fetch: f.fetch }).listUsers()
  assert.equal(f.calls.length, 2)
  assert.equal(new URL(f.calls[0].url).searchParams.get('per_page'), '200')
  assert.equal(users.length, 101)
  assert.ok(users.every((u) => u.role === 'editor'))
})

test('loadStudioEnv: none, all, partial, public origin', async () => {
  const root = await mkdtemp(join(tmpdir(), 'khybrio-env-'))
  const w = (s) => writeFile(join(root, '.env.local'), s)
  try {
    let r = loadStudioEnv(root)
    assert.deepEqual(r, { auth: null, missing: [], publicOrigin: null, error: null })
    await w('SUPABASE_URL=https://proj.supabase.co\nSUPABASE_ANON_KEY=a\nSUPABASE_SERVICE_ROLE_KEY=s\n')
    r = loadStudioEnv(root)
    assert.deepEqual(r.auth, { url: 'https://proj.supabase.co', anonKey: 'a', serviceKey: 's' })
    assert.equal(r.error, null)
    await w('SUPABASE_URL=https://proj.supabase.co\n')
    r = loadStudioEnv(root)
    assert.equal(r.auth, null)
    assert.deepEqual(r.missing, ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])
    assert.match(r.error, /SUPABASE_ANON_KEY/)
    await w('STUDIO_PUBLIC_ORIGIN=https://studio.example.com\n')
    assert.match(loadStudioEnv(root).error, /login/i)
    await w('SUPABASE_URL=https://proj.supabase.co\nSUPABASE_ANON_KEY=a\nSUPABASE_SERVICE_ROLE_KEY=s\nSTUDIO_PUBLIC_ORIGIN=https://studio.example.com/\n')
    r = loadStudioEnv(root)
    assert.equal(r.publicOrigin, 'https://studio.example.com')
    assert.equal(r.error, null)
    for (const bad of ['http://studio.example.com', 'https://studio.example.com/path', 'nonsense']) {
      await w(`SUPABASE_URL=https://proj.supabase.co\nSUPABASE_ANON_KEY=a\nSUPABASE_SERVICE_ROLE_KEY=s\nSTUDIO_PUBLIC_ORIGIN=${bad}\n`)
      assert.ok(loadStudioEnv(root).error, bad)
    }
    await w('SUPABASE_URL=http://proj.supabase.co\nSUPABASE_ANON_KEY=a\nSUPABASE_SERVICE_ROLE_KEY=s\n')
    assert.match(loadStudioEnv(root).error, /SUPABASE_URL/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
