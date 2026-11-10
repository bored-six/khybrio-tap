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
