import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

export const KEYS = ['CF_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']

// Reads root/.env.local. Returns names of missing keys only; values are never logged or echoed.
export function loadEnv(root) {
  let parsed = {}
  try {
    parsed = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'))
  } catch {
    parsed = {}
  }
  const env = {}
  const missing = []
  for (const k of KEYS) {
    const v = typeof parsed[k] === 'string' ? parsed[k].trim() : ''
    if (v) env[k] = v
    else missing.push(k)
  }
  return { ok: missing.length === 0, env, missing }
}

// Studio login (v4). All three Supabase keys or none; a public origin only with login on.
export const STUDIO_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
export function loadStudioEnv(root) {
  let parsed = {}
  try {
    parsed = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'))
  } catch {
    parsed = {}
  }
  const val = (k) => (typeof parsed[k] === 'string' ? parsed[k].trim() : '')
  const missing = STUDIO_KEYS.filter((k) => !val(k))
  const out = { auth: null, missing: [], publicOrigin: null, error: null }
  if (missing.length && missing.length < STUDIO_KEYS.length) {
    out.missing = missing
    out.error = `Studio login is half set up: missing ${missing.join(', ')} in .env.local (set all three Supabase keys, or none).`
    return out
  }
  if (!missing.length) {
    let u
    try { u = new URL(val('SUPABASE_URL')) } catch { u = null }
    if (!u || u.protocol !== 'https:') {
      out.error = 'SUPABASE_URL in .env.local must be an https:// address.'
      return out
    }
    out.auth = { url: val('SUPABASE_URL').replace(/\/+$/, ''), anonKey: val('SUPABASE_ANON_KEY'), serviceKey: val('SUPABASE_SERVICE_ROLE_KEY') }
  }
  const po = val('STUDIO_PUBLIC_ORIGIN')
  if (po) {
    if (!out.auth) {
      out.error = 'STUDIO_PUBLIC_ORIGIN is set but login is off. Add the three Supabase keys first: an open studio must never be reachable from outside.'
      return out
    }
    let u
    try { u = new URL(po) } catch { u = null }
    if (!u || u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash || u.username || u.password) {
      out.error = 'STUDIO_PUBLIC_ORIGIN must look like https://studio.example.com (https, no path).'
      return out
    }
    out.publicOrigin = u.origin
  }
  return out
}
