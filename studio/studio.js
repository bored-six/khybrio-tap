// Khybrio Studio front end. Vanilla ES module, no build step, no dependencies.
// Talks to src/studio/server.js (contract: "Studio" in .claude/specs/contract.md).
// Screens: #/ (home), #/new, #/edit/<slug>.

import { switchKind } from './link-rules.js'

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const RESERVED = ['assets', 'fonts', '404', 'index']
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const ASSET_RE = /^[a-z0-9][a-z0-9._-]*\.(svg|png|jpe?g|webp)$/i
const MAX_ASSET = 3 * 1024 * 1024
const MAX_LINKS = 12
const MAX_BRANCHES = 10
const PREVIEW_DELAY = 300

const app = document.getElementById('app')
const live = document.getElementById('live')
const say = (t) => { live.textContent = ''; setTimeout(() => { live.textContent = t }, 30) }

/* ---------------------------------------------------------------- icons */
// Same family as src/icons.js: 24 grid, 1.75 stroke, round caps/joins, rx 2.5, one r1.5 dot max.
// The link-kind glyphs are copied from src/icons.js (the studio can only load files from studio/).
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.5" fill="currentColor" stroke="none"/>`
const G = {
  review: '<path d="M12 3.4l2.47 5.8 6.28.56L16 13.9l1.41 6.14L12 16.8l-5.41 3.24L8 13.9 3.25 9.76l6.28-.56z"/>',
  maps: '<path d="M12 21.25s-6.5-5.85-6.5-11a6.5 6.5 0 0 1 13 0c0 5.15-6.5 11-6.5 11z"/>' + dot(12, 10.25),
  menu: '<path d="M8 8.5L12 4.25 16 8.5"/><rect x="3.5" y="8.5" width="17" height="12" rx="2.5"/><path d="M7.5 12.75h9M7.5 16.5h5.5"/>' + dot(12, 4.25),
  booking: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>' + dot(15.75, 15.25),
  order: '<path d="M5.2 8.5h13.6L18 19.1a1.5 1.5 0 0 1-1.5 1.4h-9A1.5 1.5 0 0 1 6 19.1z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  website: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 10h18M9.75 7h7.5"/>' + dot(6.6, 7),
  messenger:
    '<path d="M12 3.75c-4.8 0-8.25 3.45-8.25 7.85 0 2.4 1.05 4.5 2.75 5.9v3l2.9-1.5c.8.25 1.7.4 2.6.4 4.8 0 8.25-3.45 8.25-7.8S16.8 3.75 12 3.75z"/><path d="M7.75 13.5l2.85-3.1 2.6 2.2 3.05-3"/>',
  facebook: '<circle cx="12" cy="12" r="8.75"/><path d="M13.25 20.6v-9.85A2.75 2.75 0 0 1 16 8h.75M9.75 13H16"/>',
  instagram: '<rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.75"/><circle cx="12" cy="12" r="3.75"/>' + dot(16.9, 7.1),
  tiktok: '<path d="M13.5 3.75v11.5a3.75 3.75 0 1 1-3.75-3.75M13.5 3.75c.35 2.65 2.25 4.55 5 4.75"/>',
  phone: '<path d="M6.2 3.75h2.7l1.6 4.15-2.05 1.4a10.7 10.7 0 0 0 5.25 5.25l1.4-2.05 4.15 1.6v2.7c0 1.8-1.35 3.45-3.15 3.45C9.4 19.8 4.2 14.6 3.75 7.9V6.2c0-1.35 1.1-2.45 2.45-2.45z"/>',
  email: '<rect x="3.25" y="5.5" width="17.5" height="13" rx="2.5"/><path d="M4.25 7.5L12 13l7.75-5.5"/>',
  arrow: '<path d="M4.75 12h14.5M13.75 6.5L19.25 12l-5.5 5.5"/>',
  out: '<path d="M7 17L17 7M9.5 7H17v7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.75"/><path d="M12 7.5V12l3 1.75"/>',

  // studio-only glyphs, same rules
  plus: '<path d="M12 4.75v14.5M4.75 12h14.5"/>',
  back: '<path d="M19.25 12H4.75M10.25 6.5L4.75 12l5.5 5.5"/>',
  up: '<path d="M12 19.25V4.75M6.5 10.25L12 4.75l5.5 5.5"/>',
  down: '<path d="M12 4.75v14.5M6.5 13.75l5.5 5.5 5.5-5.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="M4.75 12.75l4.5 4.5 10-10.5"/>',
  // pencil: body, then the ferrule line
  edit: '<path d="M14.75 5.25l4 4L9 19H5v-4z"/><path d="M12.75 7.25l4 4"/>',
  // two cards, the back one open where the front one covers it
  copy: '<rect x="8.25" y="8.25" width="12.25" height="12.25" rx="2.5"/><path d="M15.75 8.25V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7.25a2.5 2.5 0 0 0 2.5 2.5h2.25"/>',
  // rounded triangle, bar, the dot is the point
  warn: '<path d="M10.27 4.5a2 2 0 0 1 3.46 0l7.05 12.25a2 2 0 0 1-1.73 3H4.95a2 2 0 0 1-1.73-3z"/><path d="M12 9v3.75"/>' + dot(12, 16.5),
  // contactless: three arcs at +-40 deg around the tap point (6,12), r 4.5 / 9 / 13.5
  tap: '<path d="M9.45 9.11a4.5 4.5 0 0 1 0 5.78"/><path d="M12.89 6.21a9 9 0 0 1 0 11.58"/><path d="M16.34 3.32a13.5 13.5 0 0 1 0 17.36"/>' + dot(6, 12),
  // frame, hill line, the sun is the dot
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.75 16.25l4.75-4.75 4.75 4.75 2.25-2.25 4.75 4.75"/>' + dot(15.25, 9.25),
}
// QR: three finder squares, the data corner is the dot
G.qr = '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5"/><path d="M14 14h2.75v2.75M20.5 14v6.5H14"/>' + dot(17.5, 17.5)
G.pin = G.maps

const svgMarkup = (name) =>
  `<svg class="ic" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${G[name] || G.arrow}</svg>`
// The studio mark: a tap card with the contactless arcs. 32 grid, used at 30px.
const MARK =
  '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true" focusable="false">' +
  '<rect x="3" y="7" width="26" height="18" rx="3.5"/>' +
  '<path d="M13.06 13.43a4 4 0 0 1 0 5.14M15.75 11.18a7.5 7.5 0 0 1 0 9.64M18.43 8.93a11 11 0 0 1 0 14.14"/>' +
  '<circle cx="10" cy="16" r="1.5" fill="currentColor" stroke="none"/></svg>'

function frag(markup) {
  const t = document.createElement('template')
  t.innerHTML = markup.trim()
  return t.content.firstChild
}
const icon = (name) => frag(svgMarkup(name))

/* ---------------------------------------------------------------- dom helper */
function h(tag, props, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) el.style.setProperty(p, x)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'readOnly') el[k] = v
    else if (k === 'dataset') Object.assign(el.dataset, v)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)))
  }
  return el
}

/* ---------------------------------------------------------------- api */
async function api(path, { method = 'GET', json, body, type } = {}) {
  const headers = { 'x-khybrio-studio': '1' }
  let payload = body
  if (json !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(json)
  } else if (type) headers['content-type'] = type
  let res
  try {
    res = await fetch(path, { method, headers, body: payload })
  } catch (e) {
    return { status: 0, ok: false, data: null, offline: true }
  }
  let data = null
  try { data = await res.json() } catch { data = null }
  return { status: res.status, ok: res.ok, data }
}

const S = { state: null, flash: null }
async function loadState() {
  const r = await api('/api/state')
  if (!r.ok || !r.data) throw new Error(r.offline ? 'The studio server is not running. Start it with npm run studio.' : `The server answered ${r.status}.`)
  S.state = r.data
  return r.data
}

/* ---------------------------------------------------------------- colour + text helpers */
function normHex(s) {
  s = String(s || '').trim().toLowerCase()
  if (!HEX_RE.test(s)) return null
  return s.length === 4 ? '#' + [...s.slice(1)].map((c) => c + c).join('') : s
}
function lum(hex) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
function slugify(s) {
  let out = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (out.length > 40) out = out.slice(0, 40).replace(/-+$/, '')
  return out
}
const slugProblem = (s) =>
  !s ? 'Pick an address' :
  !SLUG_RE.test(s) || s.length < 2 || s.length > 40 ? 'Use 2 to 40 lowercase letters, digits and single dashes' :
  RESERVED.includes(s) ? `"${s}" is reserved, pick another` : null
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const str = (v) => (typeof v === 'string' ? v : '')
const liveUrlFor = (site, slug) => `${site.origin}${site.base}${slug}/`

/* ---------------------------------------------------------------- error wording */
// API errors are "path: message". Paths drive placement; wording is softened for the owner.
function parseError(e) {
  const m = String(e).match(/^([A-Za-z_$][\w$]*(?:\[\d+\])?(?:\.[\w$]+)?)\s*:\s*([\s\S]*)$/)
  return m ? { path: m[1], msg: m[2] } : { path: '', msg: String(e) }
}
const FIELD_NAMES = {
  slug: 'Page address', name: 'Name', tagline: 'Tagline', look: 'Look', theme: 'Colours',
  'theme.bg': 'Background', 'theme.ink': 'Text colour', 'theme.accent': 'Accent', font: 'Fonts',
  'font.display': 'Display font', 'font.body': 'Body font', logo: 'Logo', cover: 'Cover',
  links: 'Links', branches: 'Branches', credit: 'Credit',
}
const SUB = { url: 'link address', label: 'button text', kind: 'kind', name: 'name', address: 'address', hours: 'hours', maps: 'maps link' }
function pathName(p) {
  const m = p.match(/^(links|branches)\[(\d+)\](?:\.(\w+))?$/)
  if (m) return `${m[1] === 'links' ? 'Link' : 'Branch'} ${Number(m[2]) + 1}${m[3] ? `, ${SUB[m[3]] || m[3]}` : ''}`
  return FIELD_NAMES[p] || p || 'Page'
}
function humanMsg(path, msg) {
  let m
  if (path === 'slug' && E && !E.D.slug) return 'Pick an address'
  if (/^must be 2-40 chars/.test(msg)) return 'Use 2 to 40 lowercase letters, digits and single dashes'
  if (/^required string$|^required$/.test(msg)) return path.endsWith('.url') ? 'Add the link address' : 'Required'
  const li = path.match(/^links\[(\d+)\]\.url$/)
  if (li && E && E.D.links[li[1]] && !E.D.links[li[1]].url.trim()) return 'Add the link address'
  if ((m = msg.match(/must be a valid (\w+:) URL/))) {
    if (m[1] === 'tel:') return 'Start with tel: then the number, like tel:+639171234567'
    if (m[1] === 'mailto:') return 'Start with mailto: then the email, like mailto:hello@shop.ph'
    return 'Must be a full web address starting with https://'
  }
  if (/must not contain whitespace/.test(msg)) return 'Remove the spaces from the address'
  if ((m = msg.match(/contrast against bg is ([\d.]+):1/))) return `Text is only ${m[1]}:1 on the background. Needs 4.5:1, go darker or lighter.`
  if ((m = msg.match(/best text contrast on accent is ([\d.]+):1/))) return `Button text is only ${m[1]}:1 on the accent. Needs 3:1.`
  if (/must be a hex colour/.test(msg)) return 'Use a hex colour like #1c4d4a'
  if ((m = msg.match(/file "(.+)" not found/))) return `"${m[1]}" is not in this page's folder. Upload it again.`
  if (/need 1 to 12 items/.test(msg)) return 'Add at least one link (12 at most)'
  if (/must be an https:\/\/ URL/.test(msg)) return 'Must be a full https:// address'
  if (/must equal the folder name/.test(msg)) return 'Address does not match this page'
  return msg
}
const say1 = (e) => { const p = parseError(e); return `${pathName(p.path)}: ${humanMsg(p.path, p.msg)}` }

/* ---------------------------------------------------------------- router */
let cleanup = []
let guard = null // () => boolean, false cancels navigation
let currentHash = location.hash || '#/'

function teardown() {
  for (const f of cleanup) try { f() } catch {}
  cleanup = []
  guard = null
}
async function route() {
  const hash = location.hash || '#/'
  if (guard && hash !== currentHash && !guard()) {
    history.replaceState(null, '', currentHash)
    return
  }
  currentHash = hash
  teardown()
  const m = hash.match(/^#\/edit\/([^/]+)$/)
  window.scrollTo(0, 0)
  if (hash === '#/new') return screenEditor('new')
  if (m && SLUG_RE.test(decodeURIComponent(m[1]))) return screenEditor('edit', decodeURIComponent(m[1]))
  if (hash !== '#/' && hash !== '') history.replaceState(null, '', '#/')
  return screenHome()
}
window.addEventListener('hashchange', route)

function topBar(...kids) {
  return h('header', { class: 'top' },
    h('a', { class: 'brand', href: '#/', 'aria-label': 'Khybrio Studio, all pages' }, frag(MARK),
      h('span', { class: 'wm' }, 'Khybrio', h('span', null, 'Studio'))),
    kids)
}

function failView(msg) {
  return [topBar(), h('main', { class: 'home' },
    h('div', { class: 'note bad', role: 'alert' }, icon('warn'), h('p', null, msg)),
    h('button', { class: 'btn', onclick: () => route() }, 'Try again'))]
}

/* ---------------------------------------------------------------- home */
async function screenHome() {
  let st
  try { st = await loadState() } catch (e) { app.replaceChildren(...failView(e.message)); return }
  const lookLabel = Object.fromEntries(st.looks.map((l) => [l.id, l.label]))
  const pending = new Set(st.pending || [])

  const main = h('main', { class: 'home', id: 'main' })
  main.append(h('div', { class: 'home-head' },
    h('div', null,
      h('h1', null, 'Tap pages'),
      h('p', null, st.clients.length
        ? `${plural(st.clients.length, 'page')}. Saving keeps a change here; publishing puts it on the cards.`
        : 'One page per client. Each NFC card opens one of these.')),
    h('a', { class: 'btn btn-primary btn-big', href: '#/new' }, icon('plus'), 'New page')))

  if (pending.size) main.append(publishBar(pending.size))
  if (S.flash) {
    const f = S.flash
    S.flash = null
    const note = h('div', { class: `note${f.bad ? ' bad' : ''}`, role: 'status' }, icon(f.bad ? 'warn' : 'check'),
      h('p', null, h('strong', null, f.title), ' ', h('span', null, f.text || '')),
      h('button', { class: 'btn btn-ghost btn-sm btn-icon x', 'aria-label': 'Dismiss', onclick: () => note.remove() }, icon('close')))
    main.append(note)
  }

  const rack = h('ul', { class: 'rack', 'aria-label': 'Client pages' })
  if (!st.clients.length) {
    rack.append(h('li', null, h('a', { class: 'empty', href: '#/new' },
      h('div', null, h('strong', null, 'No pages yet'), 'Make the first one.'))))
  }
  for (const c of st.clients) rack.append(clientCard(c, lookLabel, pending.has(c.slug)))
  main.append(rack)

  app.replaceChildren(topBar(), main)
}

function clientCard(c, lookLabel, isPending) {
  const t = c.theme || {}
  const bg = normHex(t.bg), ink = normHex(t.ink), accent = normHex(t.accent)
  const themed = bg && ink && accent
  const name = str(c.name) || c.slug
  const href = `#/edit/${c.slug}`
  const face = h('a', {
    class: `face${themed ? '' : ' broken'}`, href,
    style: themed ? { '--bg': bg, '--ink': ink, '--accent': accent } : null,
    title: themed ? `Background ${bg}, text ${ink}, accent ${accent}` : null,
    'aria-label': `Edit ${name}`,
  },
  c.logo
    ? h('img', { class: 'face-mark', src: `/p/${c.slug}/${encodeURIComponent(c.logo)}`, alt: '', loading: 'lazy' })
    : h('span', { class: 'face-mono', 'aria-hidden': 'true' }, [...name][0]?.toUpperCase() || '?'),
  h('span', { class: 'face-tap' }, icon('tap')),
  h('span', { class: 'face-name' }, name),
  c.tagline ? h('span', { class: 'face-tag' }, c.tagline) : null,
  h('span', { class: 'face-btn', 'aria-hidden': 'true' }))

  const meta = h('p', { class: 'cc-meta' },
    h('span', { class: 'slug' }, c.slug),
    c.look && lookLabel[c.look] ? [h('span', { class: 'sep', 'aria-hidden': 'true' }), h('span', null, lookLabel[c.look])] : null,
    typeof c.linkCount === 'number' ? [h('span', { class: 'sep', 'aria-hidden': 'true' }), h('span', null, plural(c.linkCount, 'link'))] : null)

  const copyBtn = h('button', { class: 'btn btn-sm', type: 'button' }, icon('copy'), h('span', null, 'Copy link'))
  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(c.liveUrl)
    const lbl = copyBtn.querySelector('span')
    copyBtn.firstChild.replaceWith(icon(ok ? 'check' : 'warn'))
    lbl.textContent = ok ? 'Copied' : 'Copy failed'
    say(ok ? `Copied ${c.liveUrl}` : 'Could not copy the link')
    clearTimeout(copyBtn._t)
    copyBtn._t = setTimeout(() => { copyBtn.firstChild.replaceWith(icon('copy')); lbl.textContent = 'Copy link' }, 1800)
  })

  return h('li', { class: 'cc' },
    face,
    h('div', null, meta,
      isPending ? h('p', { class: 'cc-meta', style: { 'margin-top': '4px' } }, h('span', { class: 'pending' }, 'Not published yet')) : null),
    c.valid === false
      ? h('p', { class: 'chip chip-warn' }, icon('warn'), h('span', null, c.errors && c.errors.length ? say1(c.errors[0]) : 'This page has a problem'))
      : null,
    h('div', { class: 'cc-acts' },
      h('a', { class: 'btn btn-sm', href }, icon('edit'), 'Edit'),
      h('a', { class: 'btn btn-sm', href: c.liveUrl, target: '_blank', rel: 'noopener', title: isPending ? 'Shows the last published version' : null }, icon('out'), 'Open live'),
      copyBtn,
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openQr(c, name) }, icon('qr'), 'QR code')))
}

// QR for the live link: the same address the NFC chip gets. SVG for print, PNG for chat and social.
function openQr(c, name) {
  const close = () => dlg.close()
  const dlg = h('dialog', { class: 'qr-dlg', 'aria-labelledby': 'qr-title', onclose: () => dlg.remove() },
    h('div', { class: 'qr-head' },
      h('h2', { id: 'qr-title' }, name),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Close', onclick: close }, icon('close'))),
    h('img', { class: 'qr-img', src: `/qr/${c.slug}.svg`, alt: `QR code for ${c.liveUrl}`, width: 280, height: 280 }),
    h('p', { class: 'qr-url' }, c.liveUrl),
    h('p', { class: 'qr-note' }, 'Same link as the NFC chip. Scan it once with your phone before printing.'),
    h('div', { class: 'qr-acts' },
      h('a', { class: 'btn btn-primary', href: `/qr/${c.slug}.svg?download=1`, download: `${c.slug}-qr.svg` }, 'Download for print (SVG)'),
      h('a', { class: 'btn', href: `/qr/${c.slug}.png?download=1`, download: `${c.slug}-qr.png` }, 'Download image (PNG)')))
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close() })
  document.body.append(dlg)
  dlg.showModal()
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch {}
  try {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } })
    ta.value = text
    document.body.append(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}

function publishBar(n) {
  const btn = h('button', { class: 'btn btn-cream', type: 'button' }, icon('tap'), h('span', null, 'Publish live'))
  const bar = h('section', { class: 'pub on-teal', 'aria-label': 'Publish' },
    h('span', { class: 'wet', 'aria-hidden': 'true' }),
    h('p', null, h('strong', null, `${plural(n, 'page')} changed.`), ' ', h('span', null, 'Saved here, not on the cards yet.')),
    btn)
  btn.addEventListener('click', async () => {
    bar.querySelector('.pub-out')?.remove()
    btn.disabled = true
    btn.setAttribute('aria-busy', 'true')
    bar.classList.add('working')
    btn.querySelector('span').textContent = 'Publishing'
    say('Publishing')
    const r = await api('/api/publish', { method: 'POST', json: {} })
    if (r.data && r.data.ok) {
      S.flash = { title: 'Published.', text: 'The live pages update within a few minutes.' }
      say('Published')
      return screenHome()
    }
    bar.classList.remove('working')
    btn.disabled = false
    btn.removeAttribute('aria-busy')
    btn.querySelector('span').textContent = 'Try again'
    const out = r.data && r.data.output ? String(r.data.output) : r.offline ? 'The studio server is not running.' : `The server answered ${r.status}.`
    bar.append(h('div', { class: 'pub-out', role: 'alert' }, h('strong', null, icon('warn'), 'Publish failed. Nothing new is live.'), h('pre', null, out)))
    say('Publish failed')
  })
  return bar
}

/* ---------------------------------------------------------------- editor model */
let rowId = 0
const PLACEHOLDER = {
  review: 'https://g.page/r/your-place/review',
  maps: 'https://maps.app.goo.gl/...',
  menu: 'https://...',
  booking: 'https://...',
  order: 'https://...',
  website: 'https://yourshop.ph',
  messenger: 'https://m.me/yourpage',
  facebook: 'https://facebook.com/yourpage',
  instagram: 'https://instagram.com/yourhandle',
  tiktok: 'https://tiktok.com/@yourhandle',
  phone: 'tel:+639171234567',
  email: 'mailto:hello@yourshop.ph',
}
const placeholderFor = (kind, scheme) => PLACEHOLDER[kind] || (scheme === 'tel:' ? 'tel:+63...' : scheme === 'mailto:' ? 'mailto:...' : 'https://...')

const newLink = (kind = 'messenger') => ({ id: ++rowId, kind, url: '', label: '' })
const newBranch = () => ({ id: ++rowId, name: '', address: '', hours: '', maps: '' })

function pickId(list, want) {
  const ids = list.map((x) => x.id)
  return ids.includes(want) ? want : ids[0]
}

function blankDraft(st) {
  const kinds = st.kinds.map((k) => k.id)
  return {
    slug: '', name: '', tagline: '',
    look: pickId(st.looks, 'card'),
    theme: { bg: '#f5f7f6', ink: '#0f2b29', accent: '#1c4d4a' },
    font: { display: pickId(st.fonts, 'fraunces'), body: pickId(st.fonts, 'inter') },
    logo: null, cover: null,
    links: [newLink(kinds.includes('messenger') ? 'messenger' : kinds[0])],
    branches: [],
    credit: true,
  }
}

function fromData(data, slug, st) {
  const d = data && typeof data === 'object' ? data : {}
  const th = d.theme && typeof d.theme === 'object' ? d.theme : {}
  const fo = d.font && typeof d.font === 'object' ? d.font : {}
  const links = Array.isArray(d.links) ? d.links : []
  const branches = Array.isArray(d.branches) ? d.branches : []
  return {
    slug,
    name: str(d.name), tagline: str(d.tagline),
    look: str(d.look) || pickId(st.looks, 'card'),
    theme: { bg: str(th.bg), ink: str(th.ink), accent: str(th.accent) },
    font: { display: str(fo.display) || pickId(st.fonts, 'fraunces'), body: str(fo.body) || pickId(st.fonts, 'inter') },
    logo: str(d.logo) || null, cover: str(d.cover) || null,
    links: links.length ? links.map((l) => ({ id: ++rowId, kind: str(l?.kind) || 'website', url: str(l?.url), label: str(l?.label) })) : [newLink()],
    branches: branches.map((b) => ({ id: ++rowId, name: str(b?.name), address: str(b?.address), hours: str(b?.hours), maps: str(b?.maps) })),
    credit: d.credit !== false,
  }
}

// Only contract keys, in file order. Empty optionals are dropped, never sent as "".
function payload(D) {
  const o = { slug: D.slug, name: D.name.trim() }
  if (D.tagline.trim()) o.tagline = D.tagline.trim()
  o.look = D.look
  const hx = (v) => normHex(v) || String(v).trim()
  o.theme = { bg: hx(D.theme.bg), ink: hx(D.theme.ink), accent: hx(D.theme.accent) }
  o.font = { display: D.font.display, body: D.font.body }
  if (D.logo) o.logo = D.logo
  if (D.cover) o.cover = D.cover
  o.links = D.links.map((l) => {
    const x = { kind: l.kind, url: l.url.trim() }
    if (l.label.trim()) x.label = l.label.trim()
    return x
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

/* ---------------------------------------------------------------- editor */
let E = null

async function screenEditor(mode, slug) {
  app.replaceChildren(topBar(), h('p', { class: 'boot' }, mode === 'new' ? 'Setting up a new page' : `Opening ${slug}`))
  let st
  try { st = S.state || (await loadState()) } catch (e) { app.replaceChildren(...failView(e.message)); return }
  let D
  if (mode === 'edit') {
    const r = await api(`/api/clients/${slug}`)
    if (r.status === 404) {
      S.flash = { bad: true, title: 'Page not found.', text: `There is no client called ${slug}.` }
      history.replaceState(null, '', '#/')
      currentHash = '#/'
      return screenHome()
    }
    if (!r.ok || !r.data) { app.replaceChildren(...failView(r.offline ? 'The studio server is not running.' : `Could not open ${slug} (server answered ${r.status}).`)); return }
    D = fromData(r.data.data, slug, st)
  } else D = blankDraft(st)

  E = {
    mode, st, D,
    attempted: mode === 'edit',
    slugTouched: false,
    uploaded: false,
    errors: [],
    lastHtml: null,
    seq: 0, applied: 0, timer: 0,
    saving: false,
    ver: { logo: Date.now(), cover: Date.now() },
    frames: [], front: 0,
    els: {},
  }
  E.initial = JSON.stringify(payload(D))
  buildEditor()
  runPreview()

  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() }
  }
  const onUnload = (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = '' } }
  window.addEventListener('keydown', onKey)
  window.addEventListener('beforeunload', onUnload)
  cleanup.push(() => window.removeEventListener('keydown', onKey), () => window.removeEventListener('beforeunload', onUnload),
    () => clearTimeout(E && E.timer), () => { E = null })
  guard = () => !isDirty() || confirm('Leave without saving? Your changes will be lost.')
}

const isDirty = () => E && JSON.stringify(payload(E.D)) !== E.initial

function changed() {
  const dirty = isDirty()
  E.els.state.textContent = dirty ? 'Unsaved changes' : E.mode === 'new' ? 'Not saved yet' : 'Saved'
  E.els.state.classList.toggle('dirty', dirty)
  clearTimeout(E.timer)
  E.timer = setTimeout(runPreview, PREVIEW_DELAY)
  E.els.pulse.className = 'pulse busy'
  E.els.pulseText.textContent = 'Updating'
}

function buildEditor() {
  const { D, mode } = E
  const stateEl = h('span', { class: 'save-state', 'aria-live': 'polite' }, mode === 'new' ? 'Not saved yet' : 'Saved')
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: save, title: 'Save (Cmd+S)' }, icon('check'), 'Save')
  const title = h('h1', { class: 'ed-title' }, mode === 'new' ? 'New page' : D.name || D.slug)
  E.els.state = stateEl
  E.els.save = [saveBtn]
  E.els.title = title

  const top = h('header', { class: 'top' },
    h('a', { class: 'back', href: '#/' }, icon('back'), 'All pages'),
    title, h('span', { class: 'grow' }), stateEl, saveBtn)

  const form = h('form', { class: 'form', novalidate: true, id: 'main', onsubmit: (e) => { e.preventDefault(); save() } })
  // touched = left at least once; errors only show on touched fields until the first save attempt
  form.addEventListener('focusout', (e) => {
    const f = e.target.closest?.('[data-path]')
    if (f && !f.dataset.touched) { f.dataset.touched = '1'; paintErrors() }
  })
  E.els.form = form
  E.els.summary = h('div', { class: 'summary', role: 'alert', hidden: true })
  form.append(E.els.summary)

  let n = 0
  const sec = (title, hint, ...body) =>
    h('fieldset', { class: 'sec' }, h('legend', null, h('span', { class: 'no' }, String(++n).padStart(2, '0')), title),
      hint ? h('p', { class: 'sec-hint' }, hint) : null, h('div', { class: 'sec-body' }, body))

  form.append(
    sec('Address', mode === 'new' ? 'Where the card points. Filled in from the name, change it if you like.' : null, addressField()),
    sec('Name', null, nameFields()),
    sec('Look', null, lookTiles()),
    sec('Colours', null, colourFields()),
    sec('Type', null, fontTiles()),
    sec('Images', 'SVG, PNG, JPG or WebP, up to 3 MB. Use JPG or WebP for the cover: Facebook ignores SVG previews.', imageFields()),
    sec('Links', 'The first link is the main button. The rest follow in this order.', linkSection()),
    sec('Branches', 'Optional. Leave empty for a single shop with no address shown.', branchSection()),
    sec('Footer', null, creditField()),
    h('div', { class: 'form-end' },
      h('a', { class: 'btn', href: '#/' }, 'Cancel'),
      (() => { const b = h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, icon('check'), 'Save page'); E.els.save.push(b); return b })()))

  app.replaceChildren(top, h('div', { class: 'ed' }, form, pressBed()))
}

/* ----- field scaffolding */
let fid = 0
function field({ label, path, control, hint, extra, cls }) {
  const id = control.id || (control.id = `f${++fid}`)
  const errId = `${id}-err`
  const hintId = hint ? `${id}-hint` : null
  control.setAttribute('aria-describedby', [hintId, errId].filter(Boolean).join(' '))
  return h('div', { class: `f${cls ? ' ' + cls : ''}`, dataset: { path } },
    typeof label === 'string' ? h('label', { for: id }, label) : label,
    control,
    hint ? h('p', { class: 'hint', id: hintId }, hint) : null,
    extra || null,
    h('p', { class: 'err', id: errId }))
}
const input = (props) => h('input', { class: 'in', type: 'text', autocomplete: 'off', spellcheck: 'false', ...props })

/* ----- 01 address */
function addressField() {
  const { D, st, mode } = E
  const pre = `${st.site.origin.replace(/^https?:\/\//, '')}${st.site.base}`
  const urlLine = h('span', { class: 'url' })
  const paintUrl = () => {
    urlLine.replaceChildren(`${st.site.origin}${st.site.base}`, h('strong', null, D.slug || 'your-address'), '/')
  }
  paintUrl()
  if (mode === 'edit') {
    const ctl = input({ value: D.slug, readOnly: true })
    return field({
      label: 'Page address', path: 'slug',
      control: ctl,
      hint: h('span', null, 'Locked: cards already point here. Live at ', urlLine),
    })
  }
  const ctl = input({ value: D.slug, maxlength: 40, placeholder: 'your-address', inputmode: 'url' })
  ctl.addEventListener('input', () => {
    const clean = ctl.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    if (clean !== ctl.value) ctl.value = clean
    E.slugTouched = ctl.value !== ''
    D.slug = ctl.value.replace(/^-+/, '')
    paintUrl(); changed()
  })
  ctl.addEventListener('blur', () => { ctl.value = D.slug = D.slug.replace(/-+/g, '-').replace(/-$/, ''); paintUrl() })
  const box = h('div', { class: 'addr' }, h('span', { class: 'addr-pre', 'aria-hidden': 'true' }, pre), ctl)
  const lockNote = h('p', { class: 'hint', hidden: true }, 'Locked because images were uploaded to this address. Remove them to change it.')
  E.els.slug = { ctl, box, paintUrl, lockNote }
  const f = field({
    label: 'Page address', path: 'slug', control: ctl,
    hint: h('span', null, 'Live at ', urlLine, '. It goes on the NFC chip, so it cannot change once a card is written.'),
    extra: lockNote,
  })
  // the control sits inside .addr; move it there after field() wired the label/aria
  f.replaceChild(box, ctl)
  box.append(ctl)
  return f
}
function lockSlug() {
  if (E.mode !== 'new' || !E.els.slug) return
  const locked = Boolean(E.uploaded && (E.D.logo || E.D.cover))
  E.els.slug.ctl.readOnly = locked
  E.els.slug.box.classList.toggle('locked', locked)
  E.els.slug.lockNote.hidden = !locked
}

/* ----- 02 name */
function nameFields() {
  const { D } = E
  const nameIn = input({ value: D.name, maxlength: 60, placeholder: 'Creamy Corner', spellcheck: 'true', autocomplete: 'organization' })
  nameIn.addEventListener('input', () => {
    D.name = nameIn.value
    if (E.mode === 'new' && !E.slugTouched && E.els.slug && !E.els.slug.ctl.readOnly) {
      D.slug = slugify(D.name)
      E.els.slug.ctl.value = D.slug
      E.els.slug.paintUrl()
    }
    E.els.title.textContent = E.mode === 'new' ? D.name.trim() || 'New page' : D.name.trim() || D.slug
    changed()
  })
  const count = h('span', { class: 'count' })
  const tagIn = h('textarea', { class: 'in', rows: 2, maxlength: 120, placeholder: 'Shakes, coffee and pastries. Open daily.', spellcheck: 'true' })
  tagIn.value = D.tagline
  const paintCount = () => { count.textContent = `${tagIn.value.length}/120` }
  paintCount()
  tagIn.addEventListener('input', () => { D.tagline = tagIn.value; paintCount(); changed() })
  const tagLabel = h('label', { for: (tagIn.id = `f${++fid}`), class: 'lbl lbl-row' }, h('span', null, 'Tagline ', h('span', { class: 'count' }, '(optional)')), count)
  return [
    field({ label: 'Business name', path: 'name', control: nameIn }),
    field({ label: tagLabel, path: 'tagline', control: tagIn }),
  ]
}

/* ----- 03 look */
// Schematics of each look, drawn in the draft's own colours (vars set on .tiles).
const LOOK_ART = {
  card: (id) =>
    `<defs><clipPath id="${id}"><rect width="60" height="96" rx="7"/></clipPath></defs><g clip-path="url(#${id})">` +
    `<rect width="60" height="96" fill="var(--t-bg)"/>` +
    `<g fill="none" stroke="var(--t-ink)" stroke-opacity=".16"><circle cx="15" cy="16" r="12"/><circle cx="15" cy="16" r="19"/><circle cx="15" cy="16" r="26"/></g>` +
    `<rect x="9" y="10" width="12" height="12" rx="3" fill="var(--t-ink)"/>` +
    `<rect x="9" y="29" width="32" height="5" rx="1.5" fill="var(--t-ink)"/>` +
    `<rect x="9" y="37" width="40" height="2.5" rx="1" fill="var(--t-ink)" fill-opacity=".45"/>` +
    `<rect x="9" y="46" width="42" height="10" rx="5" fill="var(--t-accent)"/>` +
    [62, 71, 80].map((y) => `<rect x="9" y="${y}" width="4" height="4" rx="1" fill="var(--t-ink)" fill-opacity=".6"/><rect x="16" y="${y + 1}" width="22" height="2" rx="1" fill="var(--t-ink)" fill-opacity=".6"/><rect x="9" y="${y + 6.5}" width="42" height=".7" fill="var(--t-ink)" fill-opacity=".2"/>`).join('') +
    `</g>`,
  'menu-board': (id) =>
    `<defs><clipPath id="${id}"><rect width="60" height="96" rx="7"/></clipPath></defs><g clip-path="url(#${id})">` +
    `<rect width="60" height="96" fill="var(--t-bg)"/>` +
    `<rect width="60" height="9" fill="var(--t-bg)"/>` +
    [0, 12, 24, 36, 48].map((x) => `<rect x="${x}" width="6" height="9" fill="var(--t-accent)"/><path d="M${x} 9a3 3 0 0 0 6 0z" fill="var(--t-accent)"/>`).join('') +
    `<path d="M17 36V26a13 13 0 0 1 26 0v10z" fill="var(--t-ink)" fill-opacity=".14"/>` +
    `<rect x="14" y="40" width="32" height="5" rx="1.5" fill="var(--t-ink)"/>` +
    `<rect x="24" y="48" width="12" height="1.2" rx=".6" fill="var(--t-accent)"/>` +
    `<rect x="9" y="53" width="42" height="9" rx="4.5" fill="var(--t-accent)"/>` +
    [68, 76, 84].map((y) => `<rect x="9" y="${y}" width="15" height="2.5" rx="1" fill="var(--t-ink)" fill-opacity=".7"/><path d="M27 ${y + 1.6}h17" stroke="var(--t-ink)" stroke-opacity=".45" stroke-width="1" stroke-dasharray="1 2"/><rect x="46" y="${y}" width="5" height="2.5" rx="1" fill="var(--t-ink)" fill-opacity=".7"/>`).join('') +
    `</g>`,
  _: (id) =>
    `<defs><clipPath id="${id}"><rect width="60" height="96" rx="7"/></clipPath></defs><g clip-path="url(#${id})">` +
    `<rect width="60" height="96" fill="var(--t-bg)"/>` +
    `<rect x="14" y="16" width="32" height="5" rx="1.5" fill="var(--t-ink)"/>` +
    `<rect x="9" y="30" width="42" height="10" rx="5" fill="var(--t-accent)"/>` +
    [48, 56, 64, 72].map((y) => `<rect x="9" y="${y}" width="42" height="4" rx="2" fill="var(--t-ink)" fill-opacity=".2"/>`).join('') +
    `</g>`,
}

function lookTiles() {
  const { D, st } = E
  const wrap = h('div', { class: 'tiles', role: 'radiogroup', 'aria-label': 'Look' })
  E.els.tiles = wrap
  for (const l of st.looks) {
    const radio = h('input', { type: 'radio', name: 'look', value: l.id, checked: D.look === l.id })
    radio.addEventListener('change', () => { if (radio.checked) { D.look = l.id; changed() } })
    const art = (LOOK_ART[l.id] || LOOK_ART._)(`clip-${l.id}`)
    wrap.append(h('label', { class: 'tile' }, radio,
      frag(`<svg class="tile-art" viewBox="0 0 60 96" aria-hidden="true" focusable="false">${art}</svg>`),
      h('span', { class: 'tile-name' }, l.label, frag(svgMarkup('check').replace('class="ic"', 'class="ic tick"')))))
  }
  paintTiles()
  return h('div', { class: 'f', dataset: { path: 'look' } }, wrap, h('p', { class: 'err' }))
}
function paintTiles() {
  const t = E.D.theme
  const s = E.els.tiles?.style
  if (!s) return
  s.setProperty('--t-bg', normHex(t.bg) || '#ffffff')
  s.setProperty('--t-ink', normHex(t.ink) || '#0f2b29')
  s.setProperty('--t-accent', normHex(t.accent) || '#1c4d4a')
}

/* ----- 04 colours */
function colourFields() {
  const { D } = E
  const rows = [
    ['bg', 'Background', 'The page itself'],
    ['ink', 'Text', 'Name, links, everything you read'],
    ['accent', 'Accent', 'The main button'],
  ].map(([k, label, hint]) => {
    const pick = h('input', { type: 'color', value: normHex(D.theme[k]) || '#000000', 'aria-label': `${label} colour picker` })
    const hex = input({ value: D.theme[k], maxlength: 7, placeholder: '#1c4d4a', 'aria-label': `${label} hex value` })
    pick.addEventListener('input', () => { hex.value = D.theme[k] = pick.value; afterColour() })
    hex.addEventListener('input', () => {
      let v = hex.value.trim()
      if (v && v[0] !== '#') v = '#' + v
      D.theme[k] = v
      const n = normHex(v)
      if (n) pick.value = n
      afterColour()
    })
    const labelId = `f${++fid}`
    hex.id = labelId
    return h('div', { class: 'f col', dataset: { path: `theme.${k}` } },
      h('label', { for: labelId }, label),
      h('span', { class: 'swatch' }, pick),
      hex,
      h('p', { class: 'hint' }, hint),
      h('p', { class: 'err' }))
  })
  const ratios = h('div', { class: 'ratios', 'aria-live': 'polite' })
  E.els.ratios = ratios
  paintRatios()
  return [h('div', { class: 'colours' }, rows), ratios]
}
function afterColour() { paintRatios(); paintTiles(); changed() }
function paintRatios() {
  const t = E.D.theme
  const bg = normHex(t.bg), ink = normHex(t.ink), ac = normHex(t.accent)
  const el = E.els.ratios
  if (!el) return
  if (!bg || !ink || !ac) { el.replaceChildren(); return }
  const text = ratio(ink, bg)
  // onAccent is whichever of ink/bg reads better on the accent (tie -> ink), as validate.js does
  const onInk = ratio(ink, ac), onBg = ratio(bg, ac)
  const on = onInk >= onBg ? ink : bg
  const btn = Math.max(onInk, onBg)
  const chip = (fg, back, r, need, what) =>
    h('span', { class: `ratio${r < need ? ' fail' : ''}` },
      h('span', { class: 'pair', style: { background: back, color: fg }, 'aria-hidden': 'true' }, 'Aa'),
      `${what} ${r.toFixed(2)}:1`, h('span', { class: 'count' }, ` needs ${need}`))
  el.replaceChildren(chip(ink, bg, text, 4.5, 'Text'), chip(on, ac, btn, 3, 'Button'))
}

/* ----- 05 type */
const FONT_STACK = {
  fraunces: 'Fraunces, Georgia, serif',
  inter: 'Inter, system-ui, sans-serif',
  'space-grotesk': '"Space Grotesk", system-ui, sans-serif',
}
function fontTiles() {
  const { D, st } = E
  const group = (key, label, sample) => {
    const wrap = h('div', { class: 'tiles', role: 'radiogroup', 'aria-label': label })
    for (const f of st.fonts) {
      const radio = h('input', { type: 'radio', name: `font-${key}`, value: f.id, checked: D.font[key] === f.id })
      radio.addEventListener('change', () => { if (radio.checked) { D.font[key] = f.id; changed() } })
      wrap.append(h('label', { class: 'tile' }, radio,
        h('span', { class: 'spec', style: { 'font-family': FONT_STACK[f.id] || `"${f.family}", system-ui`, 'font-weight': key === 'display' ? '600' : '400' } }, sample),
        h('span', { class: 'tile-name' }, f.family, frag(svgMarkup('check').replace('class="ic"', 'class="ic tick"')))))
    }
    return h('div', { class: 'f', dataset: { path: `font.${key}` } }, h('span', { class: 'lbl' }, label), wrap, h('p', { class: 'err' }))
  }
  return [group('display', 'Display: the name and headings', 'Aa'), group('body', 'Body: links and details', 'Aa')]
}

/* ----- 06 images */
function imageFields() {
  return h('div', { class: 'imgs' }, imageField('logo', 'Logo', 'Square works best'), imageField('cover', 'Cover', 'Wide photo, about 4:3'))
}
function imageField(key, label, hint) {
  const { D } = E
  const thumb = h('div', { class: 'thumb' })
  const fileLine = h('p', { class: 'img-file' })
  const status = h('p', { class: 'hint', 'aria-live': 'polite' })
  const fileIn = h('input', { type: 'file', accept: '.svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp', 'aria-label': `Choose ${label.toLowerCase()} file` })
  const pickLbl = h('span', null, 'Choose file')
  const pick = h('label', { class: 'btn btn-sm pick' }, icon('image'), pickLbl, fileIn)
  const remove = h('button', { class: 'btn btn-sm btn-ghost btn-danger', type: 'button' }, icon('close'), 'Remove')
  const err = h('p', { class: 'err' })
  const wrap = h('div', { class: `f img${key === 'cover' ? ' wide' : ''}`, dataset: { path: key } },
    thumb,
    h('div', { class: 'img-body' }, h('span', { class: 'lbl' }, label), fileLine,
      h('div', { class: 'img-acts' }, pick, remove), status),
    err)

  const paint = () => {
    const f = D[key]
    thumb.replaceChildren(f ? h('img', { src: `/p/${D.slug}/${encodeURIComponent(f)}?v=${E.ver[key]}`, alt: `${label} preview` }) : icon('image'))
    fileLine.textContent = f || hint
    pickLbl.textContent = f ? 'Replace' : 'Choose file'
    remove.hidden = !f
  }
  paint()

  fileIn.addEventListener('change', async () => {
    const file = fileIn.files && fileIn.files[0]
    fileIn.value = ''
    if (!file) return
    const local = (msg) => { status.textContent = ''; wrap.classList.add('bad'); err.replaceChildren(icon('warn'), h('span', null, msg)) }
    wrap.classList.remove('bad'); err.replaceChildren()
    const sp = slugProblem(D.slug)
    if (sp) return local('Set the page address first, the file is stored under it.')
    const clean = file.name.toLowerCase().replace(/\s+/g, '-')
    if (!ASSET_RE.test(clean) || clean.includes('..')) return local('Use an SVG, PNG, JPG or WebP file with a plain name.')
    if (file.size > MAX_ASSET) return local(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is 3 MB.`)
    status.textContent = 'Uploading'
    pick.classList.add('busy')
    const r = await api(`/api/clients/${D.slug}/assets?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, type: file.type || 'application/octet-stream' })
    pick.classList.remove('busy')
    if (!E) return
    if (r.status === 201 && r.data && r.data.file) {
      D[key] = r.data.file
      E.ver[key] = Date.now()
      E.uploaded = true
      status.textContent = 'Uploaded'
      setTimeout(() => { if (status.textContent === 'Uploaded') status.textContent = '' }, 1600)
      paint(); lockSlug(); changed()
    } else {
      local(r.data && r.data.error ? r.data.error : r.offline ? 'The studio server is not running.' : `Upload failed (server answered ${r.status}).`)
    }
  })
  remove.addEventListener('click', () => {
    D[key] = null
    paint(); lockSlug(); changed()
    pick.querySelector('input').focus()
  })
  return wrap
}

/* ----- 07 links */
function linkSection() {
  const list = h('ol', { class: 'rows', 'aria-label': 'Links' })
  const add = h('button', { class: 'btn', type: 'button' }, icon('plus'), 'Add link')
  const left = h('span', { class: 'hint' })
  E.els.links = { list, add, left }
  add.addEventListener('click', () => {
    if (E.D.links.length >= MAX_LINKS) return
    const used = new Set(E.D.links.map((l) => l.kind))
    const next = ['phone', 'facebook', 'instagram', 'maps', 'review', 'website', 'email', 'messenger'].find((k) => !used.has(k)) || 'website'
    const l = newLink(next)
    E.D.links.push(l)
    renderLinks({ id: l.id, part: 'url' })
    changed()
  })
  renderLinks()
  return h('div', { class: 'f', dataset: { path: 'links' } }, list, h('p', { class: 'err' }), h('div', { class: 'adds' }, add, left))
}

function renderLinks(focus) {
  const { D, st } = E
  const { list, add, left } = E.els.links
  const kinds = st.kinds
  const kindOf = (id) => kinds.find((k) => k.id === id) || { id, label: id, scheme: 'https:' }
  list.replaceChildren()
  D.links.forEach((l, i) => {
    const k = kindOf(l.kind)
    const n = i + 1
    const kindIcon = h('span', { class: 'row-ic' }, icon(G[l.kind] ? l.kind : 'arrow'))
    const sel = h('select', { class: 'in', 'data-part': 'kind' },
      kinds.map((x) => h('option', { value: x.id }, x.label)),
      kinds.some((x) => x.id === l.kind) ? null : h('option', { value: l.kind }, `${l.kind} (unknown)`))
    sel.value = l.kind
    const url = input({ value: l.url, placeholder: placeholderFor(l.kind, k.scheme), inputmode: k.scheme === 'tel:' ? 'tel' : k.scheme === 'mailto:' ? 'email' : 'url', 'data-part': 'url' })
    const label = input({ value: l.label, maxlength: 40, placeholder: k.label, spellcheck: 'true', 'data-part': 'label' })

    const hintEl = h('p', { class: 'hint link-hint', hidden: true, role: 'status' })
    sel.addEventListener('change', () => {
      const r = switchKind(l, sel.value, kinds)
      l.kind = r.kind; l.label = r.label; l.url = r.url
      const nk = kindOf(l.kind)
      url.value = r.url
      label.value = r.label
      url.placeholder = placeholderFor(l.kind, nk.scheme)
      label.placeholder = nk.label
      url.inputMode = nk.scheme === 'tel:' ? 'tel' : nk.scheme === 'mailto:' ? 'email' : 'url'
      hintEl.textContent = r.hint
      hintEl.hidden = !r.hint
      kindIcon.replaceChildren(icon(G[l.kind] ? l.kind : 'arrow'))
      changed()
    })
    url.addEventListener('input', () => { l.url = url.value; hintEl.hidden = true; changed() })
    url.addEventListener('blur', () => {
      // small kindness: a bare number on a phone link becomes tel:, a bare email becomes mailto:
      const v = url.value.trim()
      const sch = kindOf(l.kind).scheme
      if (sch === 'tel:' && /^\+?[\d\s()-]{6,}$/.test(v)) url.value = l.url = 'tel:' + v.replace(/[\s()-]/g, '')
      else if (sch === 'mailto:' && /^[^\s@:]+@[^\s@]+\.[^\s@]+$/.test(v)) url.value = l.url = 'mailto:' + v
      else if (sch === 'https:' && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)) url.value = l.url = 'https://' + v
      else return
      changed()
    })
    label.addEventListener('input', () => { l.label = label.value; changed() })

    const btn = (ic, text, part, disabled, fn) =>
      h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': `${text} link ${n}`, title: text, disabled, 'data-part': part, onclick: fn }, icon(ic))
    const move = (to) => {
      const [x] = D.links.splice(i, 1)
      D.links.splice(to, 0, x)
      const stay = to === 0 ? 'down' : to === D.links.length - 1 ? 'up' : to < i ? 'up' : 'down'
      renderLinks({ id: l.id, part: stay })
      say(`Link moved to position ${to + 1}${to === 0 ? ', now the main button' : ''}`)
      changed()
    }

    const sid = `f${++fid}`, uid = `f${++fid}`, lid = `f${++fid}`
    sel.id = sid; url.id = uid; label.id = lid
    const fieldOf = (path, lab, ctl, cls) => {
      ctl.setAttribute('aria-describedby', `${ctl.id}-err`)
      return h('div', { class: `f${cls ? ' ' + cls : ''}`, dataset: { path } }, h('label', { for: ctl.id }, lab), ctl, h('p', { class: 'err', id: `${ctl.id}-err` }))
    }
    list.append(h('li', { class: `row${i === 0 ? ' main' : ''}`, dataset: { path: `links[${i}]`, id: l.id } },
      h('div', { class: 'row-h' }, kindIcon,
        h('span', { class: 'row-t' }, i === 0 ? h('span', { class: 'tag' }, 'Main button') : `Link ${n}`),
        h('div', { class: 'row-acts' },
          btn('up', 'Move up', 'up', i === 0, () => move(i - 1)),
          btn('down', 'Move down', 'down', i === D.links.length - 1, () => move(i + 1)),
          btn('close', 'Remove', 'remove', D.links.length === 1, () => {
            D.links.splice(i, 1)
            const nx = D.links[i] || D.links[i - 1]
            renderLinks(nx ? { id: nx.id, part: 'kind' } : null)
            say(`Link ${n} removed`)
            changed()
          }))),
      h('div', { class: 'link-grid' },
        fieldOf(`links[${i}].kind`, 'Kind', sel),
        fieldOf(`links[${i}].url`, 'Link address', url),
        fieldOf(`links[${i}].label`, 'Button text (optional)', label, 'wide')),
      hintEl,
      h('p', { class: 'err' })))
  })
  add.disabled = D.links.length >= MAX_LINKS
  left.textContent = D.links.length >= MAX_LINKS ? '12 is the most a page can hold' : `${D.links.length} of ${MAX_LINKS}`
  if (focus) {
    const row = list.querySelector(`[data-id="${focus.id}"]`)
    let el = row && row.querySelector(`[data-part="${focus.part}"]`)
    if (el && el.disabled) el = row.querySelector('[data-part="up"]:not([disabled]), [data-part="down"]:not([disabled])')
    ;(el || add).focus()
  }
  paintErrors()
}

/* ----- 08 branches */
function branchSection() {
  const list = h('ul', { class: 'rows', 'aria-label': 'Branches' })
  const add = h('button', { class: 'btn', type: 'button' }, icon('plus'), 'Add branch')
  E.els.branches = { list, add }
  add.addEventListener('click', () => {
    if (E.D.branches.length >= MAX_BRANCHES) return
    const b = newBranch()
    E.D.branches.push(b)
    renderBranches({ id: b.id, part: 'name' })
    changed()
  })
  renderBranches()
  return h('div', { class: 'f', dataset: { path: 'branches' } }, list, h('p', { class: 'err' }), h('div', { class: 'adds' }, add))
}
function renderBranches(focus) {
  const { D } = E
  const { list, add } = E.els.branches
  list.replaceChildren()
  D.branches.forEach((b, i) => {
    const n = i + 1
    const mk = (k, lab, ph, extra = {}) => {
      const ctl = input({ value: b[k], placeholder: ph, 'data-part': k, ...extra })
      ctl.addEventListener('input', () => { b[k] = ctl.value; changed() })
      return field({ label: lab, path: `branches[${i}].${k}`, control: ctl })
    }
    list.append(h('li', { class: 'row', dataset: { path: `branches[${i}]`, id: b.id } },
      h('div', { class: 'row-h' }, icon('pin'), h('span', { class: 'row-t' }, `Branch ${n}`),
        h('div', { class: 'row-acts' },
          h('button', {
            class: 'btn btn-ghost btn-sm btn-danger', type: 'button', 'data-part': 'remove', 'aria-label': `Remove branch ${n}`,
            onclick: () => {
              D.branches.splice(i, 1)
              const nx = D.branches[i] || D.branches[i - 1]
              renderBranches(nx ? { id: nx.id, part: 'name' } : { add: true })
              say(`Branch ${n} removed`)
              changed()
            },
          }, icon('close'), 'Remove'))),
      h('div', { class: 'br-grid' },
        mk('name', 'Branch name', 'Pasonanca', { spellcheck: 'true' }),
        mk('hours', 'Hours (optional)', '8 AM to 9 PM', { spellcheck: 'true' }),
        mk('address', 'Address (optional)', 'Street, barangay', { spellcheck: 'true' }),
        mk('maps', 'Maps link (optional)', 'https://maps.app.goo.gl/...', { inputmode: 'url' })),
      h('p', { class: 'err' })))
  })
  add.disabled = D.branches.length >= MAX_BRANCHES
  if (focus) {
    const el = focus.add ? add : list.querySelector(`[data-id="${focus.id}"] [data-part="${focus.part}"]`)
    ;(el || add).focus()
  }
  paintErrors()
}

/* ----- 09 credit */
function creditField() {
  const { D } = E
  const cb = h('input', { type: 'checkbox', role: 'switch', checked: D.credit })
  cb.addEventListener('change', () => { D.credit = cb.checked; changed() })
  return h('div', { class: 'f', dataset: { path: 'credit' } },
    h('label', { class: 'switch' }, cb, h('span', { class: 'track', 'aria-hidden': 'true' }),
      h('span', null, h('strong', null, 'Show "Tap card by Khybrio" credit'), h('span', { class: 'hint' }, 'A small link to the Khybrio site at the bottom of the page.'))),
    h('p', { class: 'err' }))
}

/* ---------------------------------------------------------------- preview (press bed) */
function pressBed() {
  const mk = () => h('iframe', { title: 'Preview of the tap page', sandbox: 'allow-same-origin', tabindex: '-1', loading: 'eager' })
  E.frames = [mk(), mk()]
  E.front = 0
  E.els.empty = h('div', { class: 'screen-empty' },
    h('div', null, frag(MARK), h('strong', null, 'The page shows up here'), 'Give it a name and a working link.'))
  E.els.pulse = h('span', { class: 'pulse busy' })
  E.els.pulseText = h('span', null, 'Updating')
  E.els.pulse.append(E.els.pulseText)
  E.els.perrs = h('div', { class: 'press-errs', hidden: true, 'aria-live': 'polite' })
  return h('aside', { class: 'press on-teal', 'aria-label': 'Live preview' },
    h('div', { class: 'press-in' },
      h('div', { class: 'press-h' }, h('span', { title: '360 px is the most common Android screen width' }, h('strong', null, 'Preview'), ' 360 px'), E.els.pulse),
      E.els.perrs,
      h('div', { class: 'phone' }, h('div', { class: 'screen' }, E.els.empty, ...E.frames))))
}

async function runPreview() {
  if (!E) return
  const ed = E
  const my = ++ed.seq
  const data = payload(ed.D)
  const slugOk = !slugProblem(data.slug)
  const r = await api('/api/preview', { method: 'POST', json: { slug: slugOk ? data.slug : 'untitled-page', data } })
  if (ed !== E || my < ed.applied) return // screen left, or an older answer arriving after a newer one
  ed.applied = my
  const latest = my === ed.seq
  let errors
  if (r.ok && r.data && r.data.ok && r.data.html) {
    errors = []
    showHtml(r.data.html)
  } else if (r.data && Array.isArray(r.data.errors)) {
    errors = r.data.errors.filter((e) => slugOk || !/must equal the folder name/.test(e))
  } else {
    errors = [r.offline ? 'The studio server is not running.' : `Preview failed (server answered ${r.status}).`]
  }
  if (!slugOk && !errors.some((e) => e.startsWith('slug'))) errors.unshift(`slug: ${slugProblem(data.slug)}`)
  ed.errors = errors
  paintErrors()
  if (!latest) return
  const p = ed.els.pulse
  if (!errors.length) { p.className = 'pulse'; ed.els.pulseText.textContent = 'Up to date' }
  else { p.className = 'pulse stale'; ed.els.pulseText.textContent = ed.lastHtml ? 'Out of date' : 'Not ready yet' }
}

function showHtml(html) {
  E.lastHtml = html
  E.els.empty.hidden = true
  const front = E.frames[E.front]
  const back = E.frames[1 - E.front]
  let y = 0
  try { y = front.contentWindow.scrollY || 0 } catch {}
  back.onload = () => {
    if (!E) return
    try {
      const doc = back.contentDocument
      // the preview is a picture of the page: links must not navigate the frame away
      doc.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a')) e.preventDefault() })
      back.contentWindow.scrollTo(0, y)
    } catch {}
    back.classList.add('on')
    front.classList.remove('on')
    E.front = E.frames.indexOf(back)
  }
  back.srcdoc = html
}

/* ---------------------------------------------------------------- errors */
function findField(path) {
  const form = E.els.form
  const q = (p) => form.querySelector(`[data-path="${CSS.escape(p)}"]`)
  let el = q(path)
  if (!el) { const m = path.match(/^(.+)\.[\w$]+$/); if (m) el = q(m[1]) }
  if (!el) { const m = path.match(/^(\w+)\[\d+\]/); if (m) el = q(m[1]) }
  return el
}

function paintErrors() {
  if (!E || !E.els.form) return
  const form = E.els.form
  for (const el of form.querySelectorAll('[data-path].bad')) {
    el.classList.remove('bad')
    const er = el.querySelector(':scope > .err'); if (er) er.replaceChildren()
    for (const c of el.querySelectorAll(':scope > [aria-invalid], :scope > .addr > [aria-invalid]')) c.removeAttribute('aria-invalid')
  }
  const placed = new Map()
  const parsed = E.errors.map((e) => ({ raw: e, ...parseError(e) }))
  for (const p of parsed) {
    const el = findField(p.path)
    p.el = el
    if (!el) continue
    if (!E.attempted && !E.lastHtml && !el.dataset.touched && !el.closest('[data-touched]')) continue
    if (!placed.has(el)) placed.set(el, [])
    placed.get(el).push(humanMsg(p.path, p.msg) + (el.dataset.path !== p.path ? ` (${pathName(p.path)})` : ''))
  }
  for (const [el, msgs] of placed) {
    el.classList.add('bad')
    const er = el.querySelector(':scope > .err')
    if (er) er.replaceChildren(icon('warn'), h('span', null, msgs.join(' ')))
    const ctl = el.querySelector(':scope > .in, :scope > .addr > .in, :scope > select')
    if (ctl) ctl.setAttribute('aria-invalid', 'true')
  }

  // summary at the top of the form: after a save attempt, or once an edit broke a page that had rendered
  const sum = E.els.summary
  if ((E.attempted || E.lastHtml) && parsed.length) {
    sum.hidden = false
    sum.replaceChildren(
      h('h2', null, icon('warn'), E.attempted ? (parsed.length === 1 ? 'Not saved: one thing to fix' : `Not saved: ${parsed.length} things to fix`) : (parsed.length === 1 ? 'Preview is out of date: one thing to fix' : `Preview is out of date: ${parsed.length} things to fix`)),
      h('ul', null, parsed.map((p) => h('li', null,
        p.el ? h('button', { type: 'button', onclick: () => focusField(p.el) }, pathName(p.path)) : pathName(p.path),
        `: ${humanMsg(p.path, p.msg)}`))))
  } else { sum.hidden = true; sum.replaceChildren() }

  // the press bed always lists what keeps the page from rendering
  const pe = E.els.perrs
  if (!pe) return
  if (parsed.length) {
    pe.hidden = false
    pe.replaceChildren(
      h('h3', null, icon('warn'), E.lastHtml ? `Preview is out of date. Fix ${parsed.length === 1 ? 'this' : 'these ' + parsed.length + ' things'} below:` : `Before it can show: ${parsed.length === 1 ? 'one thing' : parsed.length + ' things'}`),
      h('ul', null, parsed.map((p) => h('li', null, h('span', null, `${pathName(p.path)}: `), humanMsg(p.path, p.msg)))))
  } else { pe.hidden = true; pe.replaceChildren() }
}

function focusField(el) {
  const ctl = el.querySelector('input:not([type="hidden"]):not([readonly]), select, textarea, button') || el
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  ctl.focus({ preventScroll: true })
}

/* ---------------------------------------------------------------- save */
async function save() {
  if (!E || E.saving) return
  const ed = E
  ed.attempted = true
  const data = payload(ed.D)
  const sp = slugProblem(data.slug)
  if (sp) {
    ed.errors = [`slug: ${sp}`, ...ed.errors.filter((e) => !e.startsWith('slug'))]
    paintErrors()
    focusField(findField('slug'))
    return
  }
  ed.saving = true
  for (const b of ed.els.save) b.disabled = true
  ed.els.state.textContent = 'Saving'
  const r = await api(`/api/clients/${data.slug}`, { method: 'PUT', json: { data, create: ed.mode === 'new' } })
  if (ed !== E) return
  ed.saving = false
  for (const b of ed.els.save) b.disabled = false
  if (r.status === 200) {
    ed.initial = JSON.stringify(data)
    S.flash = { title: `Saved ${data.name || data.slug}.`, text: 'It goes on the cards when you publish.' }
    guard = null
    location.hash = '#/'
    return
  }
  ed.els.state.textContent = 'Not saved'
  if (r.status === 422 && r.data && Array.isArray(r.data.errors)) ed.errors = r.data.errors
  else if (r.status === 409) ed.errors = [`slug: "${data.slug}" is already taken by another page. Pick another address.`]
  else if (r.status === 404) ed.errors = ['slug: this page no longer exists on disk. Go back and reopen it.']
  else if (r.status === 400) ed.errors = ['slug: the server refused this address.']
  else ed.errors = [r.offline ? 'The studio server is not running, nothing was saved.' : `Save failed (server answered ${r.status}).`]
  paintErrors()
  const first = ed.errors.map((e) => findField(parseError(e).path)).find(Boolean)
  if (first) focusField(first)
  else ed.els.summary.scrollIntoView({ block: 'start' })
  say(`Not saved. ${plural(ed.errors.length, 'problem')}.`)
}

route()
