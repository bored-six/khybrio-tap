import { KINDS } from './kinds.js'
import { parseHex, contrastRatio, worstContrast, minDim, gradientMinContrast } from './color.js'
import { STYLE, STYLE_KEYS } from './style.js'
import { migrateRaw } from './migrate.js'
import { parseVideo, embedSrc } from './embed.js'

export const LIMITS = { blocks: 30, links: 20, videos: 3, socials: 2, socialItems: 8, heading: 60, text: 280, label: 40 }
const BLOCK_TYPES = ['link', 'heading', 'text', 'socials', 'video']
const BLOCK_KEYS = { link: ['type', 'kind', 'url', 'label'], heading: ['type', 'text'], text: ['type', 'text'], socials: ['type', 'items'], video: ['type', 'url'] }
const ALLOWED = ['slug', 'name', 'tagline', 'look', 'theme', 'font', 'logo', 'cover', 'blocks', 'branches', 'credit', 'background', 'style']
const RESERVED = ['assets', 'fonts', '404', 'index', 'api', 'media']
export const FILE_RE = /^[a-z0-9][a-z0-9._-]*\.(svg|png|jpe?g|webp)$/i
const IMG_BG_RE = /^[a-z0-9][a-z0-9._-]*\.(png|jpe?g|webp)$/i
const VID_BG_RE = /^[a-z0-9][a-z0-9._-]*\.mp4$/
const BG_TYPES = ['color', 'gradient', 'image', 'video']
const BG_KEYS = { color: ['type'], gradient: ['type', 'stops', 'shape', 'angle'], image: ['type', 'file', 'blur', 'dim', 'focus'], video: ['type', 'file', 'poster', 'blur', 'dim', 'focus'] }
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi
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
  if (!isStr(s.base) || !/^\/([A-Za-z0-9._~-]+\/)*$/.test(s.base)) errors.push('base: must start and end with "/" and contain only letters, digits, . _ ~ -')
  if (protocolOf(s.mainSite) !== 'https:') errors.push('mainSite: must be an https:// URL')
  return { ok: errors.length === 0, site: errors.length ? null : { origin, base: s.base, mainSite: s.mainSite }, errors }
}

export function validateClient(input, { folder, looks = [], fonts = [], bodyFonts = fonts, files = [] } = {}) {
  const errors = []
  const warnings = []
  const err = (m) => errors.push(m)
  if (!isObj(input)) return { ok: false, client: null, errors: ['client: must be an object'], warnings }
  const raw = migrateRaw(input)

  for (const k of Object.keys(raw)) if (k !== 'links' && !ALLOWED.includes(k)) err(`${k}: unknown key (allowed: ${ALLOWED.join(', ')})`)
  if (raw.links !== undefined) err('links: v1 key, use blocks')
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
      if (r < 4.5) warnings.push(`theme.ink: contrast against bg is ${r.toFixed(2)}:1, 4.5:1 recommended for body text`)
    }
    if (theme.accent && theme.ink && theme.bg) {
      const ci = contrastRatio(theme.ink, theme.accent)
      const cb = contrastRatio(theme.bg, theme.accent)
      const useInk = ci >= cb
      theme.onAccent = useInk ? theme.ink : theme.bg
      const best = useInk ? ci : cb
      if (best < 3) warnings.push(`theme.accent: best text contrast on accent is ${best.toFixed(2)}:1, 3:1 recommended for button text`)
      const ab = contrastRatio(theme.accent, theme.bg)
      if (ab < 3) warnings.push(`theme.accent: accent against bg is ${ab.toFixed(2)}:1, 3:1 recommended so buttons stand out`)
    }
  }

  // fonts
  const font = { heading: 'fraunces', tagline: null, body: 'inter' }
  if (raw.font !== undefined) {
    if (!isObj(raw.font)) err('font: must be an object')
    else {
      for (const k of Object.keys(raw.font)) {
        if (k === 'display') err('font.display: v1 key, use font.heading')
        else if (!['heading', 'tagline', 'body'].includes(k)) err(`font.${k}: unknown key`)
      }
      for (const [k, list] of [['heading', fonts], ['body', bodyFonts], ['tagline', fonts]]) {
        if (raw.font[k] === undefined) continue
        if (!isStr(raw.font[k]) || !list.includes(raw.font[k])) err(`font.${k}: must be one of ${list.join(', ')}`)
        else font[k] = raw.font[k]
      }
    }
  }
  if (font.tagline === null) font.tagline = font.body

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

  // background
  let background = { type: 'color' }
  if (raw.background !== undefined) {
    const b = raw.background
    if (!isObj(b) || b.type === undefined) err('background: must be an object with a type')
    else if (!isStr(b.type) || !BG_TYPES.includes(b.type)) err('background.type: must be one of color, gradient, image, video')
    else {
      const before = errors.length
      const type = b.type
      for (const k of Object.keys(b)) if (!BG_KEYS[type].includes(k)) err(`background.${k}: unknown key`)
      const pending = []
      if (type === 'gradient') {
        let stops = null
        if (!Array.isArray(b.stops) || b.stops.length < 2 || b.stops.length > 3) err('background.stops: need 2 or 3 colours')
        else {
          stops = b.stops.map((v, i) => {
            if (isStr(v) && ['bg', 'ink', 'accent'].includes(v)) return { ref: v, hex: theme[v] }
            const hex = parseHex(v)
            if (!hex) err(`background.stops[${i}]: must be bg, ink, accent or a hex colour`)
            return { ref: null, hex }
          })
        }
        let shape = 'linear'
        if (b.shape !== undefined) {
          if (b.shape !== 'linear' && b.shape !== 'radial') err('background.shape: must be linear or radial')
          else shape = b.shape
        }
        let angle = shape === 'linear' ? 180 : null
        if (b.angle !== undefined) {
          if (shape === 'radial' && b.shape === 'radial') err('background.angle: only used with shape linear')
          else if (!isInt(b.angle, 0, 359)) err('background.angle: must be a whole number 0-359')
          else if (shape === 'linear') angle = b.angle
        }
        background = { type, stops, shape, angle }
        pending.push(() => {
          if (!stops || !theme.ink || stops.some((x) => !x.hex)) return
          const min = gradientMinContrast(theme.ink, stops.map((x) => x.hex))
          if (min < 4.5) warnings.push(`background.stops: text contrast drops to ${min.toFixed(2)}:1 on part of the gradient, 4.5:1 recommended`)
        })
      } else if (type === 'image' || type === 'video') {
        const check = (key, value, re, nameMsg) => {
          if (!isStr(value) || !re.test(value) || value.includes('..')) {
            err(`background.${key}: ${nameMsg}`)
            return null
          }
          if (!files.includes(value)) {
            err(`background.${key}: file "${value}" not found in the client folder`)
            return null
          }
          return value
        }
        const imgMsg = 'must be a png, jpg, jpeg or webp file name'
        const file = type === 'image' ? check('file', b.file, IMG_BG_RE, imgMsg) : check('file', b.file, VID_BG_RE, 'must be an .mp4 file name')
        let poster
        if (type === 'video') {
          if (b.poster === undefined) err('background.poster: required for a video background')
          else poster = check('poster', b.poster, IMG_BG_RE, imgMsg)
        }
        const maxBlur = type === 'image' ? 24 : 12
        let blur = 0
        if (b.blur !== undefined) {
          if (!isInt(b.blur, 0, maxBlur)) err(`background.blur: must be a whole number 0-${maxBlur}`)
          else blur = b.blur
        }
        let dim = 40
        if (b.dim !== undefined) {
          if (!isInt(b.dim, 0, 80)) err('background.dim: must be a whole number 0-80')
          else dim = b.dim
        }
        let focus = [50, 50]
        if (b.focus !== undefined) {
          if (!Array.isArray(b.focus) || b.focus.length !== 2 || !isInt(b.focus[0], 0, 100) || !isInt(b.focus[1], 0, 100)) {
            err('background.focus: must be [x, y] with whole numbers 0-100')
          } else focus = [b.focus[0], b.focus[1]]
        }
        background = type === 'image' ? { type, file, blur, dim, focus } : { type, file, poster, blur, dim, focus }
        pending.push(() => {
          if (!theme.ink || !theme.bg) return
          const n = minDim(theme.ink, theme.bg)
          if (dim >= n) return
          const r = worstContrast(theme.ink, theme.bg, dim).toFixed(2)
          const tail = n > 80 ? 'even 80% dim cannot guarantee 4.5:1 with these colours' : `dim ${n}% or more keeps 4.5:1`
          warnings.push(`background.dim: text can drop to ${r}:1 over the busiest part of the picture, ${tail}`)
        })
      }
      if (errors.length === before) pending.forEach((f) => f())
      else background = { type: 'color' }
    }
  }

  // style
  const style = Object.fromEntries(STYLE_KEYS.map((k) => [k, null]))
  if (raw.style !== undefined) {
    if (!isObj(raw.style)) err('style: must be an object')
    else
      for (const [k, v] of Object.entries(raw.style)) {
        if (!STYLE_KEYS.includes(k)) err(`style.${k}: unknown key`)
        else if (v === undefined) continue
        else if (!isStr(v) || !Object.hasOwn(STYLE[k], v)) err(`style.${k}: must be one of ${Object.keys(STYLE[k]).join(', ')}`)
        else style[k] = v
      }
  }

  // blocks
  const blocks = []
  const count = { link: 0, video: 0, socials: 0 }
  const checkUrl = (p, kind, url) => {
    if (!isStr(url)) return err(`${p}.url: required string`)
    if (/[\s\u0000-\u001f\u007f]/.test(url)) return err(`${p}.url: must not contain whitespace or control characters`)
    if (protocolOf(url) !== KINDS[kind].scheme) err(`${p}.url: must be a valid ${KINDS[kind].scheme} URL for kind "${kind}"`)
  }
  const kindOf = (v) => (isStr(v) && Object.hasOwn(KINDS, v) ? v : null)
  if (!Array.isArray(raw.blocks) || raw.blocks.length < 1 || raw.blocks.length > LIMITS.blocks) err(`blocks: need 1 to ${LIMITS.blocks} items`)
  if (Array.isArray(raw.blocks)) {
    raw.blocks.forEach((b, i) => {
      const p = `blocks[${i}]`
      if (!isObj(b)) return err(`${p}: must be an object`)
      if (!isStr(b.type) || !BLOCK_TYPES.includes(b.type)) return err(`${p}.type: must be one of ${BLOCK_TYPES.join(', ')}`)
      count[b.type] !== undefined && count[b.type]++
      for (const k of Object.keys(b)) if (!BLOCK_KEYS[b.type].includes(k)) err(`${p}.${k}: unknown key`)

      if (b.type === 'link') {
        const kind = kindOf(b.kind)
        if (!kind) err(`${p}.kind: must be one of ${Object.keys(KINDS).join(', ')}`)
        else checkUrl(p, kind, b.url)
        if (!kind && !isStr(b.url)) err(`${p}.url: required string`)
        let label = kind ? KINDS[kind].label : ''
        if (b.label !== undefined) {
          if (!isStr(b.label) || !b.label.trim() || b.label.length > LIMITS.label) err(`${p}.label: must be 1-${LIMITS.label} characters`)
          else label = b.label
        } else if (kind === 'custom') err(`${p}.label: required for kind "custom"`)
        if (kind) blocks.push({ type: 'link', kind, url: b.url, label, primary: false })
      } else if (b.type === 'heading') {
        const t = isStr(b.text) ? b.text.trim() : ''
        if (!t || t.length > LIMITS.heading || /[\r\n]/.test(t)) err(`${p}.text: must be 1-${LIMITS.heading} characters on one line`)
        else blocks.push({ type: 'heading', text: t })
      } else if (b.type === 'text') {
        const t = isStr(b.text) ? b.text.replace(/\r\n?/g, '\n').trim() : ''
        if (!t || t.length > LIMITS.text || (t.match(/\n/g) || []).length > 4) err(`${p}.text: must be 1-${LIMITS.text} characters with at most 4 line breaks`)
        else blocks.push({ type: 'text', text: t })
      } else if (b.type === 'socials') {
        if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > LIMITS.socialItems) return err(`${p}.items: need 1 to ${LIMITS.socialItems} items`)
        const items = []
        b.items.forEach((it, j) => {
          const q = `${p}.items[${j}]`
          if (!isObj(it)) return err(`${q}: must be an object`)
          for (const k of Object.keys(it)) if (k !== 'kind' && k !== 'url') err(`${q}.${k}: unknown key`)
          const kind = kindOf(it.kind)
          if (!kind || !KINDS[kind].social) return err(`${q}.kind: must be one of ${Object.keys(KINDS).filter((x) => KINDS[x].social).join(', ')}`)
          const before = errors.length
          checkUrl(q, kind, it.url)
          if (errors.length === before) items.push({ kind, url: it.url, label: KINDS[kind].label })
        })
        if (items.length === b.items.length) blocks.push({ type: 'socials', items })
      } else {
        const v = isStr(b.url) ? parseVideo(b.url) : null
        if (!v) err(`${p}.url: required string`)
        else if (v.error) err(`${p}.url: ${v.error}`)
        else blocks.push({ type: 'video', url: b.url, provider: v.provider, id: v.id, vertical: v.vertical, src: embedSrc(v.provider, v.id) })
      }
    })
    if (count.link > LIMITS.links) err(`blocks: at most ${LIMITS.links} link blocks`)
    if (count.video > LIMITS.videos) err(`blocks: at most ${LIMITS.videos} video blocks`)
    if (count.socials > LIMITS.socials) err(`blocks: at most ${LIMITS.socials} socials blocks`)
    const first = blocks.find((b) => b.type === 'link')
    if (first) first.primary = true
  }

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

  if (errors.length) return { ok: false, client: null, errors, warnings }
  return { ok: true, client: { slug, name, tagline, look: raw.look, theme, font, logo, cover, blocks, branches, credit, background, style }, errors, warnings }
}
