// Pure editor logic for the studio. No DOM, no fetch: browser + node safe, tested in test/editor-model.test.js.
// studio.js owns the screen; this file owns the rules (block list, limits, payload <-> draft, font groups, palettes, rename).

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const RESERVED = ['assets', 'fonts', '404', 'index', 'api', 'media']
const str = (v) => (typeof v === 'string' ? v : '')
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

export const BLOCK_TYPES = [
  { type: 'link', label: 'Link', hint: 'A button that opens an address' },
  { type: 'heading', label: 'Heading', hint: 'A short title line' },
  { type: 'text', label: 'Text', hint: 'A few lines of plain text' },
  { type: 'socials', label: 'Socials', hint: 'A row of icons' },
  { type: 'video', label: 'Video', hint: 'A YouTube or TikTok video' },
]

export function normHex(s) {
  s = String(s || '').trim().toLowerCase()
  if (!HEX_RE.test(s)) return null
  return s.length === 4 ? '#' + [...s.slice(1)].map((c) => c + c).join('') : s
}

export const slugProblem = (s) =>
  !s ? 'Pick an address' :
  !SLUG_RE.test(s) || s.length < 2 || s.length > 40 ? 'Use 2 to 40 lowercase letters, digits and single dashes' :
  RESERVED.includes(s) ? `"${s}" is reserved, pick another` : null

/* ---------------------------------------------------------------- blocks */
export const socialKinds = (kinds) => kinds.filter((k) => k.social)

function pickId(list, want) {
  const ids = list.map((x) => x.id)
  return ids.includes(want) ? want : ids[0]
}
const defaultLinkKind = (kinds) => pickId(kinds, 'website')

export function newBlock(type, { kinds, nextId }) {
  const id = nextId()
  if (type === 'link') return { id, type, kind: defaultLinkKind(kinds), url: '', label: '' }
  if (type === 'heading' || type === 'text') return { id, type, text: '' }
  if (type === 'video') return { id, type, url: '' }
  if (type === 'socials') return { id, type, items: [{ kind: socialKinds(kinds)[0]?.id ?? 'facebook', url: '' }] }
  throw new Error(`unknown block type ${type}`)
}

export function countByType(blocks) {
  const c = { link: 0, heading: 0, text: 0, socials: 0, video: 0 }
  for (const b of blocks) if (b && b.type in c) c[b.type]++
  return c
}

export function canAdd(blocks, type, limits) {
  if (blocks.length >= limits.blocks) return { ok: false, reason: `A page holds at most ${limits.blocks} blocks` }
  const c = countByType(blocks)
  const cap = { link: limits.links, video: limits.videos, socials: limits.socials }[type]
  if (cap !== undefined && c[type] >= cap) return { ok: false, reason: `A page holds at most ${cap} ${type} blocks` }
  return { ok: true, reason: '' }
}

export function addBlock(blocks, type, { limits, kinds, nextId }) {
  const can = canAdd(blocks, type, limits)
  if (!can.ok) return { ok: false, reason: can.reason, blocks }
  return { ok: true, reason: '', blocks: [...blocks, newBlock(type, { kinds, nextId })] }
}

export function moveBlock(blocks, i, dir) {
  const j = i + dir
  if (!Number.isInteger(i) || i < 0 || i >= blocks.length || j < 0 || j >= blocks.length) return [...blocks]
  const out = [...blocks]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

// A page needs 1 to 30 blocks, so the last one cannot be removed.
export function removeBlock(blocks, i) {
  if (blocks.length <= 1 || i < 0 || i >= blocks.length) return [...blocks]
  return blocks.filter((_, k) => k !== i)
}

export function addSocialItem(items, { limits, kinds }) {
  if (items.length >= limits.socialItems) return { ok: false, reason: `A socials row holds at most ${limits.socialItems} icons`, items }
  const sk = socialKinds(kinds)
  const used = new Set(items.map((x) => x.kind))
  const kind = (sk.find((k) => !used.has(k.id)) || sk[0])?.id ?? 'facebook'
  return { ok: true, reason: '', items: [...items, { kind, url: '' }] }
}
export const removeSocialItem = (items, i) => (items.length <= 1 || i < 0 || i >= items.length ? [...items] : items.filter((_, k) => k !== i))

/* ---------------------------------------------------------------- draft <-> data */
export function blankDraft(st, nextId) {
  const kinds = st.kinds
  const body = pickId(st.fonts, 'inter')
  return {
    slug: '', name: '', tagline: '',
    look: pickId(st.looks, 'card'),
    theme: { bg: '#f5f7f6', ink: '#0f2b29', accent: '#1c4d4a' },
    font: { heading: pickId(st.fonts, 'fraunces'), tagline: body, body },
    logo: null, cover: null,
    blocks: [{ id: nextId(), type: 'link', kind: pickId(kinds, 'messenger'), url: '', label: '' }],
    branches: [],
    credit: true,
  }
}

export function fromData(data, slug, st, nextId) {
  const d = isObj(data) ? data : {}
  const th = isObj(d.theme) ? d.theme : {}
  const fo = isObj(d.font) ? d.font : {}
  const blocks = []
  for (const b of Array.isArray(d.blocks) ? d.blocks : []) {
    if (!isObj(b)) continue
    const id = nextId()
    if (b.type === 'link') blocks.push({ id, type: 'link', kind: str(b.kind) || defaultLinkKind(st.kinds), url: str(b.url), label: str(b.label) })
    else if (b.type === 'heading' || b.type === 'text') blocks.push({ id, type: b.type, text: str(b.text) })
    else if (b.type === 'video') blocks.push({ id, type: 'video', url: str(b.url) })
    else if (b.type === 'socials') {
      const items = (Array.isArray(b.items) ? b.items : []).filter(isObj).map((x) => ({ kind: str(x.kind), url: str(x.url) }))
      blocks.push({ id, type: 'socials', items: items.length ? items : newBlock('socials', { kinds: st.kinds, nextId: () => 0 }).items })
    }
  }
  const body = str(fo.body) || pickId(st.fonts, 'inter')
  return {
    slug,
    name: str(d.name), tagline: str(d.tagline),
    look: str(d.look) || pickId(st.looks, 'card'),
    theme: { bg: str(th.bg), ink: str(th.ink), accent: str(th.accent) },
    font: { heading: str(fo.heading) || pickId(st.fonts, 'fraunces'), tagline: str(fo.tagline) || body, body },
    logo: str(d.logo) || null, cover: str(d.cover) || null,
    blocks: blocks.length ? blocks : [{ id: nextId(), type: 'link', kind: defaultLinkKind(st.kinds), url: '', label: '' }],
    branches: (Array.isArray(d.branches) ? d.branches : []).filter(isObj).map((b) => ({ id: nextId(), name: str(b.name), address: str(b.address), hours: str(b.hours), maps: str(b.maps) })),
    credit: d.credit !== false,
  }
}

// Only contract keys, in file order. Empty optionals are dropped, never sent as "". Blocks are never dropped
// (so an error at blocks[i] is the i-th card on screen).
export function payload(D) {
  const o = { slug: D.slug, name: D.name.trim() }
  if (D.tagline.trim()) o.tagline = D.tagline.trim()
  o.look = D.look
  const hx = (v) => normHex(v) || String(v).trim()
  o.theme = { bg: hx(D.theme.bg), ink: hx(D.theme.ink), accent: hx(D.theme.accent) }
  o.font = { heading: D.font.heading, tagline: D.font.tagline, body: D.font.body }
  if (D.logo) o.logo = D.logo
  if (D.cover) o.cover = D.cover
  o.blocks = D.blocks.map((b) => {
    if (b.type === 'link') {
      const x = { type: 'link', kind: b.kind, url: b.url.trim() }
      if (b.label.trim()) x.label = b.label.trim()
      return x
    }
    if (b.type === 'heading' || b.type === 'text') return { type: b.type, text: b.text.trim() }
    if (b.type === 'video') return { type: 'video', url: b.url.trim() }
    return { type: 'socials', items: b.items.map((i) => ({ kind: i.kind, url: i.url.trim() })) }
  })
  const br = D.branches
    .map((b) => {
      const x = {}
      for (const k of ['name', 'address', 'hours', 'maps']) if (b[k].trim()) x[k] = b[k].trim()
      return x
    })
    .filter((x) => Object.keys(x).length)
  if (br.length) o.branches = br
  o.credit = D.credit
  return o
}

/* ---------------------------------------------------------------- fonts */
const GROUP_ORDER = ['serif', 'sans', 'display', 'script', 'mono']
const GROUP_LABEL = { serif: 'Serif', sans: 'Sans', display: 'Display', script: 'Script', mono: 'Mono' }

export function groupFonts(fonts, { bodyOnly = false } = {}) {
  const by = new Map()
  for (const f of fonts) {
    if (bodyOnly && !f.body) continue
    if (!by.has(f.group)) by.set(f.group, [])
    by.get(f.group).push(f)
  }
  const keys = [...by.keys()].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  return keys.map((group) => ({ group, label: GROUP_LABEL[group] || group, fonts: by.get(group) }))
}

// @font-face rules so each option can preview in its own face. /p/fonts/ serves the files by name:
// variable fonts are {id}.woff2, static ones {id}-{weight}.woff2 (every static family has a 400).
// The browser only downloads a face once something on the page uses it.
export const previewFamily = (id) => `studio-font-${id}`
export function fontFaceCss(fonts) {
  return fonts
    .filter((f) => /^[a-z0-9-]+$/.test(f.id))
    .map((f) => `@font-face{font-family:"${previewFamily(f.id)}";font-weight:100 900;font-display:swap;src:url(/p/fonts/${f.id}.woff2) format("woff2"),url(/p/fonts/${f.id}-400.woff2) format("woff2")}`)
    .join('\n')
}

/* ---------------------------------------------------------------- palettes */
export const applyPalette = (theme, p) => ({ ...theme, bg: p.bg, ink: p.ink, accent: p.accent })
export function matchPalette(theme, palettes) {
  const t = [normHex(theme.bg), normHex(theme.ink), normHex(theme.accent)]
  if (t.some((x) => !x)) return null
  const hit = palettes.find((p) => normHex(p.bg) === t[0] && normHex(p.ink) === t[1] && normHex(p.accent) === t[2])
  return hit ? hit.id : null
}

/* ---------------------------------------------------------------- rename */
export function renameGate({ from, to, dirty }) {
  if (to === from) return { ok: false, reason: '' }
  if (dirty) return { ok: false, reason: 'Save your changes first, then change the address' }
  const p = slugProblem(to)
  return p ? { ok: false, reason: p } : { ok: true, reason: '' }
}

/* ---------------------------------------------------------------- preview CSP */
// The preview iframe runs on the studio origin (it needs allow-same-origin + allow-scripts for the video embeds),
// so the page inside must not be able to run script or reach out. The meta CSP is placed first in <head>.
export const PREVIEW_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; " +
  'frame-src https://www.youtube-nocookie.com https://www.tiktok.com; base-uri \'none\'; form-action \'none\''
const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`
export function withPreviewCsp(html) {
  const s = String(html)
  const head = /<head(?=[\s>])[^>]*>/i.exec(s)
  if (head) return s.slice(0, head.index + head[0].length) + CSP_META + s.slice(head.index + head[0].length)
  const root = /<html(?=[\s>])[^>]*>/i.exec(s)
  if (root) return s.slice(0, root.index + root[0].length) + `<head>${CSP_META}</head>` + s.slice(root.index + root[0].length)
  return `<head>${CSP_META}</head>${s}`
}
