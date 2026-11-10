import { KINDS } from './kinds.js'
import { parseHex, contrastRatio } from './color.js'

const ALLOWED = ['slug', 'name', 'tagline', 'look', 'theme', 'font', 'logo', 'cover', 'links', 'branches', 'credit']
const RESERVED = ['assets', 'fonts', '404', 'index']
const FILE_RE = /^[a-z0-9][a-z0-9._-]*\.(svg|png|jpe?g|webp)$/i
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isStr = (v) => typeof v === 'string'

function protocolOf(url) {
  if (!isStr(url) || /[\s\u0000-\u001f\u007f]/.test(url)) return null
  try {
    return new URL(url).protocol
  } catch {
    return null
  }
}

export function validateSite(raw) {
  const errors = []
  const s = isObj(raw) ? raw : {}
  const origin = s.origin
  if (!isStr(origin) || !/^https:\/\/[^/\s]+$/.test(origin)) errors.push('origin: must be an https:// URL with no path and no trailing slash')
  if (!isStr(s.base) || !s.base.startsWith('/') || !s.base.endsWith('/')) errors.push('base: must start and end with "/"')
  if (protocolOf(s.mainSite) !== 'https:') errors.push('mainSite: must be an https:// URL')
  return { ok: errors.length === 0, site: errors.length ? null : { origin, base: s.base, mainSite: s.mainSite }, errors }
}

export function validateClient(raw, { folder, looks = [], fonts = [], files = [] } = {}) {
  const errors = []
  const err = (m) => errors.push(m)
  if (!isObj(raw)) return { ok: false, client: null, errors: ['client: must be an object'] }

  for (const k of Object.keys(raw)) if (!ALLOWED.includes(k)) err(`${k}: unknown key (allowed: ${ALLOWED.join(', ')})`)

  // slug
  const slug = raw.slug
  if (!isStr(slug) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 40) {
    err('slug: must be 2-40 chars of lowercase letters, digits and single hyphens')
  } else if (RESERVED.includes(slug)) err(`slug: "${slug}" is reserved`)
  else if (slug !== folder) err(`slug: "${slug}" must equal the folder name "${folder}"`)

  // name, tagline
  const name = isStr(raw.name) ? raw.name.trim() : ''
  if (!name) err('name: required')
  else if (name.length > 60) err('name: max 60 characters')
  let tagline = null
  if (raw.tagline !== undefined) {
    if (!isStr(raw.tagline)) err('tagline: must be a string')
    else if (raw.tagline.length > 120) err('tagline: max 120 characters')
    else tagline = raw.tagline
  }

  if (!isStr(raw.look) || !looks.includes(raw.look)) err(`look: must be one of ${looks.join(', ')}`)

  // theme
  const theme = { bg: null, ink: null, accent: null, onAccent: null }
  if (!isObj(raw.theme)) err('theme: required object with bg, ink, accent')
  else {
    for (const k of ['bg', 'ink', 'accent']) {
      theme[k] = parseHex(raw.theme[k])
      if (!theme[k]) err(`theme.${k}: must be a hex colour like #1c4d4a`)
    }
    if (theme.bg && theme.ink) {
      const r = contrastRatio(theme.ink, theme.bg)
      if (r < 4.5) err(`theme.ink: contrast against bg is ${r.toFixed(2)}:1, needs at least 4.5:1`)
    }
    if (theme.accent && theme.ink && theme.bg) {
      const ci = contrastRatio(theme.ink, theme.accent)
      const cb = contrastRatio(theme.bg, theme.accent)
      const useInk = ci >= cb
      theme.onAccent = useInk ? theme.ink : theme.bg
      const best = useInk ? ci : cb
      if (best < 3) err(`theme.accent: best text contrast on accent is ${best.toFixed(2)}:1, needs at least 3:1`)
    }
  }

  // fonts
  const font = { display: 'fraunces', body: 'inter' }
  if (raw.font !== undefined) {
    if (!isObj(raw.font)) err('font: must be an object')
    else
      for (const k of ['display', 'body']) {
        if (raw.font[k] === undefined) continue
        if (!isStr(raw.font[k]) || !fonts.includes(raw.font[k])) err(`font.${k}: must be one of ${fonts.join(', ')}`)
        else font[k] = raw.font[k]
      }
  }

  // logo, cover
  const fileField = (key) => {
    const v = raw[key]
    if (v === undefined || v === null) return null
    if (!isStr(v) || !FILE_RE.test(v) || v.includes('..')) {
      err(`${key}: must be a plain file name ending in svg, png, jpg, jpeg or webp`)
      return null
    }
    if (!files.includes(v)) {
      err(`${key}: file "${v}" not found in the client folder`)
      return null
    }
    return v
  }
  const logo = fileField('logo')
  const cover = fileField('cover')

  // links
  const links = []
  if (!Array.isArray(raw.links) || raw.links.length < 1 || raw.links.length > 12) err('links: need 1 to 12 items')
  else
    raw.links.forEach((l, i) => {
      const p = `links[${i}]`
      if (!isObj(l)) return err(`${p}: must be an object`)
      const def = isStr(l.kind) && Object.hasOwn(KINDS, l.kind) ? KINDS[l.kind] : null
      if (!def) err(`${p}.kind: must be one of ${Object.keys(KINDS).join(', ')}`)
      if (!isStr(l.url)) err(`${p}.url: required string`)
      else if (/[\s\u0000-\u001f\u007f]/.test(l.url)) err(`${p}.url: must not contain whitespace or control characters`)
      else if (def) {
        const proto = protocolOf(l.url)
        if (proto !== def.scheme) err(`${p}.url: must be a valid ${def.scheme} URL for kind "${l.kind}"`)
      }
      let label = def ? def.label : ''
      if (l.label !== undefined) {
        if (!isStr(l.label) || !l.label.trim() || l.label.length > 40) err(`${p}.label: must be 1-40 characters`)
        else label = l.label
      }
      if (def) links.push({ kind: l.kind, url: l.url, label })
    })

  // branches
  const branches = []
  if (raw.branches !== undefined) {
    if (!Array.isArray(raw.branches) || raw.branches.length > 10) err('branches: must be an array of at most 10')
    else
      raw.branches.forEach((b, i) => {
        const p = `branches[${i}]`
        if (!isObj(b)) return err(`${p}: must be an object`)
        const out = { name: null, address: null, maps: null, hours: null }
        if (!isStr(b.name) || !b.name.trim()) err(`${p}.name: required`)
        else out.name = b.name.trim()
        for (const k of ['address', 'hours']) {
          if (b[k] === undefined || b[k] === null) continue
          if (!isStr(b[k])) err(`${p}.${k}: must be a string`)
          else out[k] = b[k]
        }
        if (b.maps !== undefined && b.maps !== null) {
          if (protocolOf(b.maps) !== 'https:') err(`${p}.maps: must be an https:// URL`)
          else out.maps = b.maps
        }
        branches.push(out)
      })
  }

  let credit = true
  if (raw.credit !== undefined) {
    if (typeof raw.credit !== 'boolean') err('credit: must be true or false')
    else credit = raw.credit
  }

  if (errors.length) return { ok: false, client: null, errors }
  return { ok: true, client: { slug, name, tagline, look: raw.look, theme, font, logo, cover, links, branches, credit }, errors }
}
