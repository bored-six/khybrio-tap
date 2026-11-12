// Supabase accounts for the studio login. Plain fetch against Supabase Auth (GoTrue), no SDK.
// Contract: "Studio login (v4, Supabase)" in .claude/specs/contract.md. Keys never appear in errors.

export const ROLES = ['admin', 'editor']
const PER_PAGE = 200
const MAX_PAGES = 20

function upstream(status) {
  const e = new Error(`Supabase answered ${status}`)
  e.code = 'upstream'
  e.status = status
  return e
}

function toUser(u, now = Date.now()) {
  const r = u?.app_metadata?.studio_role
  const until = u?.banned_until ? Date.parse(u.banned_until) : NaN
  return {
    id: u.id,
    email: u.email,
    role: ROLES.includes(r) ? r : null,
    createdAt: u.created_at ?? null,
    lastSignInAt: u.last_sign_in_at ?? null,
    banned: Number.isFinite(until) && until > now,
  }
}

export function createSupabaseAuth({ url, anonKey, serviceKey, fetch = globalThis.fetch }) {
  const base = String(url).replace(/\/+$/, '')

  async function call(path, { method = 'GET', body, key = serviceKey, admin = true } = {}) {
    const headers = { apikey: key, 'content-type': 'application/json' }
    if (admin) headers.authorization = `Bearer ${key}`
    let res
    try {
      res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    } catch {
      throw upstream(0)
    }
    let data = null
    try { data = await res.json() } catch { data = null }
    return { status: res.status, ok: res.ok, data }
  }
  const must = (r) => {
    if (!r.ok) throw upstream(r.status)
    return r.data
  }
  const userPath = (id) => `/auth/v1/admin/users/${encodeURIComponent(id)}`

  return {
    async signIn(email, password) {
      const r = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, key: anonKey, admin: false })
      if (r.status === 400 || r.status === 401) return null
      const d = must(r)
      return d?.user ? toUser(d.user) : null
    },
    async getUser(id) {
      const r = await call(userPath(id))
      if (r.status === 404) return null
      return toUser(must(r))
    },
    async listUsers() {
      const out = []
      for (let page = 1; page <= MAX_PAGES; page++) {
        const d = must(await call(`/auth/v1/admin/users?page=${page}&per_page=${PER_PAGE}`))
        const list = Array.isArray(d?.users) ? d.users : []
        for (const u of list) {
          const m = toUser(u)
          if (m.role) out.push(m)
        }
        if (list.length < PER_PAGE) break
      }
      return out
    },
    async createUser({ email, password, role }) {
      const r = await call('/auth/v1/admin/users', { method: 'POST', body: { email, password, email_confirm: true, app_metadata: { studio_role: role } } })
      const code = r.data?.error_code ?? r.data?.code
      if (!r.ok && (code === 'email_exists' || code === 'user_already_exists' || /already been registered/i.test(String(r.data?.msg ?? r.data?.message ?? '')))) {
        const e = new Error('That email already has an account')
        e.code = 'exists'
        throw e
      }
      return toUser(must(r))
    },
    async setPassword(id, password) {
      return toUser(must(await call(userPath(id), { method: 'PUT', body: { password } })))
    },
    async setRole(id, role) {
      return toUser(must(await call(userPath(id), { method: 'PUT', body: { app_metadata: { studio_role: role } } })))
    },
    async deleteUser(id) {
      must(await call(userPath(id), { method: 'DELETE' }))
    },
  }
}
