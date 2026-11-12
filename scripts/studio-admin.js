// First admin for the studio login: npm run studio-admin -- you@example.com
// Creates the account as admin with a generated password, or makes an existing account admin with a new one.
// Contract: "First admin" under "Studio login (v4, Supabase)" in .claude/specs/contract.md.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadStudioEnv } from '../src/publish/env.js'
import { createSupabaseAuth } from '../src/studio/supabase.js'
import { generatePassword } from '../src/studio/login.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const email = String(process.argv[2] || '').trim().toLowerCase()
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run studio-admin -- you@example.com')
  process.exit(1)
}
const env = loadStudioEnv(root)
if (env.error || !env.auth) {
  console.error(env.error || 'Add SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to .env.local first.')
  process.exit(1)
}
const auth = createSupabaseAuth(env.auth)
const password = generatePassword()
try {
  await auth.createUser({ email, password, role: 'admin' })
  console.log(`Admin created: ${email}`)
} catch (e) {
  if (e.code !== 'exists') {
    console.error(`Supabase did not answer (${e.status ?? 'network'}). Check the keys and try again.`)
    process.exit(1)
  }
  // Already registered: find the account (any role) and promote it.
  let id = null
  for (let page = 1; page <= 20 && !id; page++) {
    const res = await fetch(`${env.auth.url}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: { apikey: env.auth.serviceKey, authorization: `Bearer ${env.auth.serviceKey}` },
    })
    if (!res.ok) { console.error(`Supabase answered ${res.status}.`); process.exit(1) }
    const list = (await res.json())?.users ?? []
    id = list.find((u) => String(u.email).toLowerCase() === email)?.id ?? null
    if (list.length < 200) break
  }
  if (!id) { console.error('That email is registered but could not be found.'); process.exit(1) }
  await auth.setRole(id, 'admin')
  await auth.setPassword(id, password)
  console.log(`Existing account is now admin: ${email}`)
}
console.log(`Password (shown once, store it somewhere safe): ${password}`)
