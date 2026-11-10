// Rename + redirects (section 8 of .claude/specs/mvp-showcase.md). Pure functions plus a tiny file helper.
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const RESERVED = ['assets', 'fonts', '404', 'index', 'api', 'media']
const isSlug = (s) => typeof s === 'string' && s.length >= 2 && s.length <= 40 && SLUG_RE.test(s)
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

// `folders` (optional): every folder name in clients/, so an address held by a non-live folder is refused too.
export function applyRename(redirects, from, to, liveSlugs, folders = []) {
  if (!isSlug(to) || RESERVED.includes(to) || to === from) {
    return { ok: false, status: 422, error: 'address must be 2-40 lowercase letters, digits and single hyphens, and not reserved or unchanged' }
  }
  if (!liveSlugs.includes(from)) return { ok: false, status: 404, error: 'page not found' }
  if (liveSlugs.includes(to) || folders.includes(to)) return { ok: false, status: 409, error: 'address already used by a page' }
  if (has(redirects, to) && redirects[to] !== from) {
    return { ok: false, status: 409, error: `old cards for "${redirects[to]}" use this address` }
  }
  const next = { ...redirects }
  next[from] = to
  for (const k of Object.keys(next)) if (next[k] === from) next[k] = to
  delete next[to]
  return { ok: true, redirects: next }
}

export function validateRedirects(redirects, liveSlugs) {
  const errors = []
  for (const [k, v] of Object.entries(redirects ?? {})) {
    if (!isSlug(k)) errors.push(`redirects: key "${k}" is not a valid address`)
    if (!isSlug(v)) errors.push(`redirects: value "${v}" for "${k}" is not a valid address`)
    if (liveSlugs.includes(k)) errors.push(`redirects: "${k}" is a live page and cannot also be an old address`)
    if (isSlug(v) && !liveSlugs.includes(v)) errors.push(`redirects: "${k}" points at "${v}", which is not a live page`)
  }
  return errors
}

// clients/_redirects.json: missing file = {}.
export async function readRedirects(clientsDir) {
  try {
    return JSON.parse(await readFile(join(clientsDir, '_redirects.json'), 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return {}
    throw e
  }
}

export async function writeRedirects(clientsDir, redirects) {
  const file = join(clientsDir, '_redirects.json')
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(redirects, null, 2) + '\n')
  await rename(tmp, file)
}
