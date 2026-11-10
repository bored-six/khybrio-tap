// Khybrio Studio front end. Vanilla ES module, no build step, no dependencies.
// Talks to src/studio/server.js (contract: "Studio" in .claude/specs/contract.md, v2 delta in mvp-showcase.md).
// Screens: #/ (home), #/new, #/edit/<slug>.
//
// Layout of this file, so a restyle never has to touch the logic:
//   - DATA LOGIC (do not restyle): api(), loadState(), payload/fromData (studio/editor-model.js), save(), renameTo(),
//     runPublish(), runPreview(), the block/palette/font rules in studio/editor-model.js.
//   - PRESENTATION: everything that calls h(...) to build markup, the class names, the icons.

import { switchKind, placeholderFor } from './link-rules.js'
import { MAX_SIDE, TARGET_BYTES, targetSize, outputName, qualitySteps, shouldReencode, isHeic } from './image-prep.js'
import {
  BLOCK_TYPES, normHex, slugProblem, renameGate, canAdd, addBlock, moveBlock, removeBlock,
  addSocialItem, removeSocialItem, socialKinds, countByType, payload, fromData, blankDraft,
  groupFonts, fontFaceCss, previewFamily, applyPalette, matchPalette, withPreviewCsp,
} from './editor-model.js'

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const ASSET_RE = /^[a-z0-9][a-z0-9._-]*\.(svg|png|jpe?g|webp)$/i
const MAX_ASSET = 3 * 1024 * 1024
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
// block-type glyphs: link = a button (pill + arrow), heading = H, text = three lines, socials = three rings, video = play frame
G.link = '<rect x="2.75" y="7" width="18.5" height="10" rx="5"/><path d="M8 12h7.5M13.25 9.75L15.5 12l-2.25 2.25"/>'
G.heading = '<path d="M6.5 5v14M17.5 5v14M6.5 12h11"/>'
G.text = '<path d="M4.5 7h15M4.5 12h15M4.5 17h9"/>'
G.socials = '<circle cx="5.25" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="18.75" cy="12" r="2.5"/>'
G.video = '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M10.25 9.5v5l4.25-2.5z"/>'
// studio chrome: chevron; a phone (the preview); a calm note (ring, bar, the dot on top)
G.chev = '<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>'
G.device = '<rect x="6.25" y="2.75" width="11.5" height="18.5" rx="2.5"/><path d="M10.5 17.75h3"/>'
G.note = '<circle cx="12" cy="12" r="8.75"/><path d="M12 11.25v5"/>' + dot(12, 7.75)

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
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const str = (v) => (typeof v === 'string' ? v : '')
const liveUrlFor = (site, slug) => `${site.origin}${site.base}${slug}/`

/* ---------------------------------------------------------------- error wording */
// API errors and warnings are "path: message". Paths drive placement; wording is softened for the owner.
function parseError(e) {
  const m = String(e).match(/^([A-Za-z_$][\w$]*(?:\[\d+\]|\.[\w$]+)*)\s*:\s*([\s\S]*)$/)
  return m ? { path: m[1], msg: m[2] } : { path: '', msg: String(e) }
}
const FIELD_NAMES = {
  slug: 'Page address', name: 'Name', tagline: 'Tagline', look: 'Look', theme: 'Colours',
  'theme.bg': 'Background', 'theme.ink': 'Text colour', 'theme.accent': 'Accent', font: 'Fonts',
  'font.heading': 'Heading font', 'font.tagline': 'Tagline font', 'font.body': 'Body font', logo: 'Logo', cover: 'Cover',
  blocks: 'Blocks', branches: 'Branches', credit: 'Credit',
}
const SUB = { url: 'address', label: 'button text', kind: 'kind', text: 'text', items: 'icons', name: 'name', address: 'address', hours: 'hours', maps: 'maps link' }
const TYPE_NAME = { link: 'Link', heading: 'Heading', text: 'Text', socials: 'Socials', video: 'Video' }
function pathName(p) {
  let m = p.match(/^branches\[(\d+)\](?:\.(\w+))?$/)
  if (m) return `Branch ${Number(m[1]) + 1}${m[2] ? `, ${SUB[m[2]] || m[2]}` : ''}`
  m = p.match(/^blocks\[(\d+)\](?:\.items\[(\d+)\])?(?:\.(\w+))?$/)
  if (m) {
    const b = E && E.D.blocks[m[1]]
    return `${b ? TYPE_NAME[b.type] : 'Block'} ${Number(m[1]) + 1}${m[2] !== undefined ? `, icon ${Number(m[2]) + 1}` : ''}${m[3] ? `, ${SUB[m[3]] || m[3]}` : ''}`
  }
  return FIELD_NAMES[p] || p || 'Page'
}
function humanMsg(path, msg) {
  let m
  if (path === 'slug' && E && !E.D.slug) return 'Pick an address'
  if (/^must be 2-40 chars/.test(msg)) return 'Use 2 to 40 lowercase letters, digits and single dashes'
  const bu = path.match(/^blocks\[(\d+)\]\.url$/)
  const blk = bu && E && E.D.blocks[bu[1]]
  if (blk && typeof blk.url === 'string' && !blk.url.trim()) return blk.type === 'video' ? 'Add the video link' : 'Add the link address'
  const bl = path.match(/^blocks\[(\d+)\]\.label$/)
  const lb = bl && E && E.D.blocks[bl[1]]
  if (lb && lb.kind === 'custom' && !lb.label.trim()) return 'A custom link needs button text'
  if (/^required string$|^required$/.test(msg)) return path.endsWith('.url') ? 'Add the link address' : 'Required'
  if ((m = msg.match(/must be a valid (\w+:) URL/))) {
    if (m[1] === 'tel:') return 'Start with tel: then the number, like tel:+639171234567'
    if (m[1] === 'mailto:') return 'Start with mailto: then the email, like mailto:hello@shop.ph'
    if (m[1] === 'viber:') return 'Start with viber://chat?number=%2B639171234567'
    return 'Must be a full web address starting with https://'
  }
  if (/must not contain whitespace/.test(msg)) return 'Remove the spaces from the address'
  if ((m = msg.match(/contrast against bg is ([\d.]+):1/))) return `Text is only ${m[1]}:1 on the background. 4.5:1 is easier to read, go darker or lighter.`
  if ((m = msg.match(/best text contrast on accent is ([\d.]+):1/))) return `Button text is only ${m[1]}:1 on the accent. 3:1 is easier to read.`
  if ((m = msg.match(/accent against bg is ([\d.]+):1/))) return `The button is only ${m[1]}:1 against the background. 3:1 helps it stand out.`
  if (/must be a hex colour/.test(msg)) return 'Use a hex colour like #1c4d4a'
  if ((m = msg.match(/file "(.+)" not found/))) return `"${m[1]}" is not in this page's folder. Upload it again.`
  if (/need 1 to \d+ items/.test(msg) && path === 'blocks') return 'A page needs at least one block (30 at most)'
  if (/must be an https:\/\/ URL/.test(msg)) return 'Must be a full https:// address'
  if (/^Client already exists$/.test(msg)) return 'Another page already uses this address. Pick another.'
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
      h('h1', null, 'Tap ', h('em', null, 'pages')),
      h('p', null, st.clients.length
        ? `${plural(st.clients.length, 'page')}. Saving keeps a change here; publishing puts it on the cards.`
        : 'One page per client. Each NFC card opens one of these.')),
    h('a', { class: 'btn btn-primary btn-big', href: '#/new' }, icon('plus'), 'New page')))

  if (pending.size) main.append(publishBar(pending.size))
  if (S.flash) { const f = S.flash; S.flash = null; main.append(flashNote(f)) }
  { const bn = backupNote(st.backup); if (bn) main.append(bn) }

  const rack = h('ul', { class: 'rack', 'aria-label': 'Client pages' })
  for (const c of st.clients) rack.append(clientCard(c, lookLabel, pending.has(c.slug)))
  rack.append(h('li', null, h('a', { class: 'newcard', href: '#/new' },
    h('span', { class: 'plus', 'aria-hidden': 'true' }, icon('plus')),
    h('span', null, h('strong', null, st.clients.length ? 'New page' : 'No pages yet'), st.clients.length ? 'Start from a blank card.' : 'Make the first one.'))))
  main.append(rack)

  app.replaceChildren(topBar(), main)
}

// whichever of ink/bg reads better on the accent (tie -> ink), as validate.js does
const onAccent = (bg, ink, ac) => (ratio(ink, ac) >= ratio(bg, ac) ? ink : bg)

// A client is its tap card with its phone leaning on it: the card wears the theme, the phone shows the look.
function clientCard(c, lookLabel, isPending) {
  const t = c.theme || {}
  const bg = normHex(t.bg), ink = normHex(t.ink), accent = normHex(t.accent)
  const themed = bg && ink && accent
  const name = str(c.name) || c.slug
  const href = `#/edit/${c.slug}`
  const face = h('a', {
    class: `face${themed ? '' : ' broken'}`, href,
    style: themed ? { '--f-bg': bg, '--f-ink': ink, '--f-accent': accent, '--t-bg': bg, '--t-ink': ink, '--t-accent': accent, '--t-on': onAccent(bg, ink, accent) } : null,
    title: themed ? `Background ${bg}, text ${ink}, accent ${accent}` : null,
    'aria-label': `Edit ${name}`,
  },
  c.logo
    ? h('img', { class: 'face-mark', src: `/p/${c.slug}/${encodeURIComponent(c.logo)}`, alt: '', loading: 'lazy' })
    : h('span', { class: 'face-mono', 'aria-hidden': 'true' }, [...name][0]?.toUpperCase() || '?'),
  themed ? frag(`<svg class="face-look" viewBox="0 0 60 96" aria-hidden="true" focusable="false">${(LOOK_ART[c.look] || LOOK_ART._)(`fl-${c.slug}`)}</svg>`) : null,
  h('span', { class: 'face-name' }, name),
  c.tagline ? h('span', { class: 'face-tag' }, c.tagline) : null)

  const meta = h('p', { class: 'cc-meta' },
    h('span', { class: 'slug' }, c.slug),
    c.look && lookLabel[c.look] ? [h('span', { class: 'sep', 'aria-hidden': 'true' }), h('span', null, lookLabel[c.look])] : null,
    h('span', { class: 'sep', 'aria-hidden': 'true' }), h('span', null, plural(c.blockCount ?? 0, 'block')),
    isPending ? h('span', { class: 'pending' }, 'Not published yet') : null)

  const copyBtn = h('button', { class: 'tool', type: 'button' }, icon('copy'), h('span', null, 'Copy link'))
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
    meta,
    c.valid === false
      ? h('p', { class: 'chip chip-warn' }, icon('warn'), h('span', null, c.errors && c.errors.length ? say1(c.errors[0]) : 'This page has a problem'))
      : null,
    h('div', { class: 'cc-acts' },
      h('a', { class: 'tool', href }, icon('edit'), h('span', null, 'Edit')),
      h('a', { class: 'tool', href: c.liveUrl, target: '_blank', rel: 'noopener', title: isPending ? 'Shows the last published version' : null }, icon('out'), h('span', null, 'Open live')),
      copyBtn,
      h('button', { class: 'tool', type: 'button', onclick: () => openQr(c, name) }, icon('qr'), h('span', null, 'QR code'))))
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

// DATA: one publish call. Returns the server answer (or a stand-in on network failure).
const callPublish = (force) => api('/api/publish', { method: 'POST', json: force ? { force: true } : {} })

const BACKUP_WORDS = {
  committed: 'saved to git, pushing to GitHub in the background',
  nothing: 'nothing new to back up',
  failed: 'the git backup failed (the live site is fine)',
}
function publishSummary(d) {
  const l = d.live || {}
  const up = Array.isArray(l.uploaded) ? l.uploaded.length : Number(l.uploaded) || 0
  const del = Array.isArray(l.deleted) ? l.deleted.length : Number(l.deleted) || 0
  return `${plural(up, 'file')} uploaded, ${del} removed, ${Number(l.ms) || 0} ms. Backup: ${BACKUP_WORDS[d.backup] || d.backup || 'unknown'}.`
}
function publishFailure(r) {
  const d = r.data
  if (d && d.output) return String(d.output)
  if (d && d.error) return String(d.error)
  return r.offline ? 'The studio server is not running.' : `The server answered ${r.status}.`
}

// PRESENTATION + wiring for the home screen's publish bar.
function publishBar(n) {
  const btn = h('button', { class: 'btn btn-cream', type: 'button' }, icon('tap'), h('span', null, 'Publish live'))
  const bar = h('section', { class: 'pub on-teal', 'aria-label': 'Publish' },
    h('span', { class: 'wet', 'aria-hidden': 'true' }),
    h('p', null, h('strong', null, `${plural(n, 'page')} changed.`), ' ', h('span', null, 'Saved here, not on the cards yet.')),
    btn)
  const run = async (force) => {
    bar.querySelector('.pub-out')?.remove()
    btn.disabled = true
    btn.setAttribute('aria-busy', 'true')
    bar.classList.add('working')
    btn.querySelector('span').textContent = 'Publishing'
    say('Publishing')
    const r = await callPublish(force)
    if (r.data && r.data.ok) {
      const d = r.data
      S.flash = { bad: false, title: 'Live.', text: publishSummary(d) }
      say(`Published. ${publishSummary(d)}`)
      return screenHome()
    }
    bar.classList.remove('working')
    btn.disabled = false
    btn.removeAttribute('aria-busy')
    btn.querySelector('span').textContent = 'Try again'
    const out = publishFailure(r)
    const box = h('div', { class: 'pub-out', role: 'alert' }, h('strong', null, icon('warn'), 'Publish failed. Nothing new is live.'), h('pre', null, out))
    if (/Refusing to delete/.test(out)) {
      box.append(h('button', {
        class: 'btn btn-sm', type: 'button', 'data-part': 'force-publish',
        onclick: () => { if (confirm(`${out}\n\nPublish anyway? Those pages will disappear from the live site.`)) run(true) },
      }, 'Publish anyway'))
    }
    bar.append(box)
    say('Publish failed')
  }
  btn.addEventListener('click', () => run(false))
  return bar
}

function flashNote(f) {
  const note = h('div', { class: `note${f.bad ? ' bad' : ''}`, role: 'status' }, icon(f.bad ? 'warn' : 'check'),
    h('p', null, h('strong', null, f.title), ' ', h('span', null, f.text || '')),
    h('button', { class: 'btn btn-ghost btn-sm btn-icon x', 'aria-label': 'Dismiss', onclick: () => note.remove() }, icon('close')))
  return note
}

function backupNote(b) {
  if (!b || b.state === 'idle') return null
  if (b.state === 'pushing') return h('div', { class: 'note', role: 'status' }, icon('tap'), h('p', null, h('strong', null, 'Backup running.'), ' ', h('span', null, 'Pushing the saved pages to GitHub in the background.')))
  return h('div', { class: 'note bad', role: 'status' }, icon('warn'), h('p', null, h('strong', null, 'GitHub backup failed.'), ' ', h('span', null, 'The live pages are fine. ' + (b.output || ''))))
}

/* ---------------------------------------------------------------- editor */
let E = null
let rowId = 0
const nextId = () => ++rowId
const newBranch = () => ({ id: nextId(), name: '', address: '', hours: '', maps: '' })

// DATA: load a page (or a blank draft) and start the editor.
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
    D = fromData(r.data.data, slug, st, nextId)
  } else D = blankDraft(st, nextId)
  ensureFontFaces(st)

  E = {
    mode, st, D,
    attempted: mode === 'edit',
    slugTouched: false,
    uploaded: false,
    errors: [],
    warnings: [],
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

// Every edit handler ends here.
function changed() {
  const dirty = isDirty()
  E.els.state.textContent = dirty ? 'Unsaved changes' : E.mode === 'new' ? 'Not saved yet' : 'Saved'
  E.els.state.classList.toggle('dirty', dirty)
  clearTimeout(E.timer)
  E.timer = setTimeout(runPreview, PREVIEW_DELAY)
  E.els.pulse.className = 'pulse busy'
  E.els.pulseText.textContent = 'Updating'
  E.els.address?.refresh()
}

// The preview font faces, so each font option can show itself. Loaded lazily by the browser, only when used.
function ensureFontFaces(st) {
  if (document.getElementById('studio-font-faces')) return
  const el = document.createElement('style')
  el.id = 'studio-font-faces'
  el.textContent = fontFaceCss(st.fonts)
  document.head.append(el)
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
    h('a', { class: 'back', href: '#/', 'aria-label': 'All pages' }, icon('back'), h('span', null, 'All pages')),
    title, h('span', { class: 'grow' }), stateEl, saveBtn)

  const form = h('form', { class: 'form', novalidate: true, id: 'main', onsubmit: (e) => { e.preventDefault(); save() } })
  // touched = left at least once; errors only show on touched fields until the first save attempt
  form.addEventListener('focusout', (e) => {
    const f = e.target.closest?.('[data-path]')
    if (f && !f.dataset.touched) { f.dataset.touched = '1'; paintErrors() }
  })
  E.els.form = form
  E.els.summary = h('div', { class: 'summary', role: 'alert', hidden: true })
  E.els.warnSummary = h('div', { class: 'summary summary-warn', role: 'status', hidden: true })
  form.append(E.els.summary, E.els.warnSummary)
  if (S.flash) { form.append(flashNote(S.flash)); S.flash = null }

  // PRESENTATION: every section is a sheet with a numeral; the rail jumps between them.
  const secs = []
  const sec = (name, hint, ...body) => {
    const no = String(secs.length + 1).padStart(2, '0')
    const el = h('fieldset', { class: 'sec' }, h('legend', null, h('span', { class: 'no', 'aria-hidden': 'true' }, no), name),
      hint ? h('p', { class: 'sec-hint' }, hint) : null, h('div', { class: 'sec-body' }, body))
    secs.push({ no, name, el })
    return el
  }

  form.append(
    sec('Basics', null, nameFields(), addressField()),
    sec('Look', 'Six layouts, drawn here in this page\'s colours. Switch any time, nothing is lost.', lookTiles()),
    sec('Colours', 'Start from a swatch, then bend it. Any colour is allowed.', colourFields()),
    sec('Type', 'Heading is the name and headings, tagline is the line under the name, body is everything else.', fontPickers()),
    sec('Images', 'Any photo works: it is shrunk and converted here before it uploads. SVG is kept as is. Use a photo for the cover: Facebook ignores SVG previews.', imageFields()),
    sec('Blocks', null, blockSection()),
    sec('Branches', 'Optional. Leave empty for a single shop with no address shown.', branchSection()),
    sec('Footer', null, creditField()),
    h('div', { class: 'form-end' },
      h('a', { class: 'btn', href: '#/' }, 'Cancel'),
      (() => { const b = h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, icon('check'), 'Save page'); E.els.save.push(b); return b })()))

  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  const railIn = h('div', { class: 'rail-in' }, h('p', { class: 'rail-t', 'aria-hidden': 'true' }, 'Sections'))
  for (const s of secs) {
    s.btn = h('button', { class: 'rail-i', type: 'button', onclick: () => s.el.scrollIntoView({ block: 'start', behavior: calm() ? 'auto' : 'smooth' }) },
      h('i', { 'aria-hidden': 'true' }, s.no), s.name)
    railIn.append(s.btn)
  }
  const rail = h('nav', { class: 'rail', 'aria-label': 'Sections' }, railIn)
  let spyRaf = 0
  const spy = () => {
    spyRaf = 0
    let cur = secs[0]
    for (const s of secs) if (s.el.getBoundingClientRect().top < 220) cur = s
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = secs[secs.length - 1]
    for (const s of secs) {
      if (s === cur) s.btn.setAttribute('aria-current', 'true')
      else s.btn.removeAttribute('aria-current')
    }
    // when the rail lies flat it scrolls sideways to keep the current chip in view
    if (railIn.scrollWidth > railIn.clientWidth) railIn.scrollTo({ left: cur.btn.offsetLeft - railIn.offsetLeft - 16, behavior: calm() ? 'auto' : 'smooth' })
  }
  const onScroll = () => { if (!spyRaf) spyRaf = requestAnimationFrame(spy) }
  window.addEventListener('scroll', onScroll, { passive: true })

  // PRESENTATION: on narrow screens the stage is a drawer opened by a floating button.
  const stage = pressBed()
  const fab = h('button', { class: 'fab', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'stage' },
    icon('device'), 'Preview', h('span', { class: 'dot', 'aria-hidden': 'true' }))
  const ed = h('div', { class: 'ed' }, rail, form, stage, fab)
  const setStage = (on, focus = true) => {
    ed.classList.toggle('show-stage', on)
    fab.setAttribute('aria-expanded', String(on))
    form.inert = rail.inert = top.inert = on
    document.documentElement.style.overflow = on ? 'hidden' : ''
    if (focus) (on ? E.els.stageClose : fab).focus()
  }
  fab.addEventListener('click', () => setStage(true))
  E.els.stageClose.addEventListener('click', () => setStage(false))
  const onEsc = (e) => { if (e.key === 'Escape' && ed.classList.contains('show-stage')) setStage(false) }
  const wide = matchMedia('(min-width: 1041px)')
  const onWide = () => { if (wide.matches && ed.classList.contains('show-stage')) setStage(false, false) }
  window.addEventListener('keydown', onEsc)
  wide.addEventListener('change', onWide)
  cleanup.push(() => window.removeEventListener('scroll', onScroll), () => window.removeEventListener('keydown', onEsc),
    () => wide.removeEventListener('change', onWide), () => { document.documentElement.style.overflow = '' })

  app.replaceChildren(top, ed)
  paintTiles()
  spy()
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
  if (mode === 'edit') return renameField(pre, paintUrl, urlLine)
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
    hint: h('span', null, 'Live at ', urlLine, '. Pick it before you write a card: later changes keep the old address forwarding here.'),
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

// Edit mode: the address can change, but only through the rename route, and only with nothing unsaved.
function renameField(pre, paintUrl, urlLine) {
  const { D } = E
  const from = D.slug
  const ctl = input({ value: from, maxlength: 40, inputmode: 'url', 'data-part': 'rename-input' })
  const btn = h('button', { class: 'btn', type: 'button', 'data-part': 'rename-go' }, icon('edit'), 'Change address')
  const note = h('p', { class: 'hint rename-note', 'aria-live': 'polite' })
  const err = h('p', { class: 'err rename-err', role: 'alert' })
  const box = h('div', { class: 'addr addr-rename' }, h('span', { class: 'addr-pre', 'aria-hidden': 'true' }, pre), ctl, btn)
  const refresh = () => {
    const to = ctl.value.trim()
    const dirty = isDirty()
    const g = renameGate({ from, to, dirty })
    ctl.disabled = dirty
    btn.disabled = !g.ok
    note.textContent = dirty
      ? 'Save your changes first, then you can change the address.'
      : g.reason || 'Cards already written keep working: the old address forwards to the new one.'
    paintUrl()
  }
  E.els.address = { ctl, btn, note, err, refresh }
  ctl.addEventListener('input', () => {
    const clean = ctl.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    if (clean !== ctl.value) ctl.value = clean
    err.replaceChildren()
    refresh()
  })
  btn.addEventListener('click', () => renameTo(ctl.value.trim()))
  const f = field({
    label: 'Page address', path: 'slug', control: ctl,
    hint: h('span', null, 'Live at ', urlLine),
    extra: [note, err],
  })
  f.replaceChild(box, ctl)
  box.insertBefore(ctl, btn)
  refresh()
  return f
}

// DATA: rename = POST, then reload the editor at the new address. The old one keeps working (server leaves a redirect).
async function renameTo(to) {
  const ed = E
  const from = ed.D.slug
  const g = renameGate({ from, to, dirty: isDirty() })
  if (!g.ok) return
  const { btn, err } = ed.els.address
  if (!confirm(`Change the address from "${from}" to "${to}"?\n\nThe old address keeps working: it forwards to the new one, so cards already written are fine.`)) return
  btn.disabled = true
  btn.setAttribute('aria-busy', 'true')
  err.replaceChildren()
  const r = await api(`/api/clients/${from}/rename`, { method: 'POST', json: { to } })
  if (ed !== E) return
  btn.removeAttribute('aria-busy')
  if (r.ok && r.data && r.data.ok) {
    S.flash = { title: 'Address changed.', text: `This page is now at ${to}. ${from} still forwards here. Publish to put it live.` }
    S.state = null
    guard = null
    location.hash = `#/edit/${r.data.slug}`
    return
  }
  err.replaceChildren(icon('warn'), h('span', null, r.data && r.data.error ? r.data.error : r.offline ? 'The studio server is not running.' : `Could not change the address (server answered ${r.status}).`))
  ed.els.address.refresh()
}

/* ----- 02 name */
function nameFields() {
  const { D } = E
  const nameIn = input({ class: 'in name-in', value: D.name, maxlength: 60, placeholder: 'Creamy Corner', spellcheck: 'true', autocomplete: 'organization' })
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
  // magazine front page: thick rule, nameplate, ruled tagline, one accent lead story, numbered contents
  masthead: (id) =>
    `<defs><clipPath id="${id}"><rect width="60" height="96" rx="7"/></clipPath></defs><g clip-path="url(#${id})">` +
    `<rect width="60" height="96" fill="var(--t-bg)"/>` +
    `<g fill="var(--t-ink)"><rect x="7" y="8" width="46" height="2.2"/><rect x="7" y="12.5" width="6" height="6"/>` +
    `<rect x="39" y="14.7" width="14" height="1.6" fill-opacity=".7"/><rect x="7" y="21" width="46" height=".7"/>` +
    `<rect x="10" y="25" width="40" height="8.5" rx="1"/><rect x="7" y="37" width="46" height=".7"/>` +
    `<rect x="17" y="40" width="26" height="1.8" fill-opacity=".55"/><rect x="7" y="44" width="46" height=".7"/></g>` +
    `<rect x="7" y="49" width="46" height="13" fill="var(--t-accent)"/><rect x="11" y="53.6" width="24" height="3.8" fill="var(--t-on)"/>` +
    `<path d="M43 55.5h5.5M46.5 53.5l2 2-2 2" fill="none" stroke="var(--t-on)" stroke-width="1.1"/>` +
    [68, 77, 86].map((y) => `<g fill="var(--t-ink)"><rect x="7" y="${y}" width="5" height="3" fill-opacity=".55"/><rect x="15" y="${y}" width="${y === 77 ? 19 : 26}" height="3"/><rect x="7" y="${y + 6}" width="46" height=".7"/></g>`).join('') +
    `</g>`,
  // gig poster: accent field with the stacked name and a sticker, ink tape, hard-shadow slabs
  poster: (id) =>
    `<defs><clipPath id="${id}"><rect width="60" height="96" rx="7"/></clipPath></defs><g clip-path="url(#${id})">` +
    `<rect width="60" height="96" fill="var(--t-bg)"/><rect width="60" height="38" fill="var(--t-accent)"/>` +
    `<circle cx="48.4" cy="11.4" r="6" fill="var(--t-ink)"/><circle cx="47" cy="10" r="6" fill="var(--t-bg)" stroke="var(--t-ink)" stroke-width="1.5"/>` +
    `<rect x="6" y="15" width="34" height="8" fill="var(--t-on)"/><rect x="6" y="25" width="24" height="8" fill="var(--t-on)"/>` +
    `<rect y="37" width="60" height="10.5" fill="var(--t-ink)"/><rect x="6" y="41.2" width="30" height="2.2" fill="var(--t-bg)"/>` +
    `<rect x="9.5" y="56.5" width="44" height="12" fill="var(--t-accent)"/><rect x="7" y="54" width="44" height="12" fill="var(--t-ink)"/>` +
    `<rect x="17" y="54" width=".9" height="12" fill="var(--t-bg)"/><rect x="21" y="58" width="21" height="4" fill="var(--t-bg)"/>` +
    [73, 84].map((y) => `<rect x="8.9" y="${y + 1.9}" width="44" height="8" fill="var(--t-ink)"/><rect x="7" y="${y}" width="44" height="8" fill="var(--t-bg)" stroke="var(--t-ink)" stroke-width="1.3"/>` +
      `<rect x="15.6" y="${y}" width="1.3" height="8" fill="var(--t-ink)"/><rect x="20" y="${y + 2.9}" width="${y === 73 ? 18 : 13}" height="2.2" fill="var(--t-ink)"/>`).join('') +
    `</g>`,
  // phone home screen: soft cover, logo punched into it, one accent tile, a grid of toned tiles with wells
  tiles: (id) =>
    `<defs><clipPath id="${id}"><rect width="60" height="96" rx="7"/></clipPath></defs><g clip-path="url(#${id})">` +
    `<rect width="60" height="96" fill="var(--t-bg)"/>` +
    `<rect x="4" y="4" width="52" height="23" rx="8" fill="var(--t-ink)" fill-opacity=".14"/>` +
    `<rect x="8" y="19" width="13" height="13" rx="4.5" fill="var(--t-ink)" stroke="var(--t-bg)" stroke-width="2"/>` +
    `<rect x="7" y="36.5" width="28" height="5" rx="1.5" fill="var(--t-ink)"/><rect x="7" y="44" width="38" height="2.2" rx="1" fill="var(--t-ink)" fill-opacity=".45"/>` +
    `<rect x="4" y="51" width="52" height="13" rx="6.5" fill="var(--t-accent)"/><rect x="10" y="55.7" width="22" height="3.6" rx="1.2" fill="var(--t-on)"/>` +
    `<circle cx="48.5" cy="57.5" r="3.8" fill="var(--t-on)"/>` +
    [4, 31].map((x) => `<rect x="${x}" y="67" width="25" height="25" rx="7.5" fill="var(--t-ink)" fill-opacity=".1"/><circle cx="${x + 7.5}" cy="74.5" r="4" fill="var(--t-bg)"/>` +
      `<rect x="${x + 4}" y="84.5" width="${x === 4 ? 14 : 11}" height="2.6" rx="1" fill="var(--t-ink)" fill-opacity=".75"/>`).join('') +
    `</g>`,
  // printed slip on a counter: torn ends, dashed rules, an accent ticket stub, line items, a barcode
  receipt: (id) =>
    `<defs><clipPath id="${id}"><rect width="60" height="96" rx="7"/></clipPath></defs><g clip-path="url(#${id})">` +
    `<rect width="60" height="96" fill="var(--t-bg)"/><rect width="60" height="96" fill="var(--t-ink)" fill-opacity=".2"/>` +
    `<path d="M9 10l3-3 3 3 3-3 3 3 3-3 3 3 3-3 3 3 3-3 3 3 3-3 3 3 3-3 3 3V86l-3 3-3-3-3 3-3-3-3 3-3-3-3 3-3-3-3 3-3-3-3 3-3-3-3 3-3-3z" fill="var(--t-bg)"/>` +
    `<rect x="19" y="15" width="22" height="5" rx="1" fill="var(--t-ink)"/><rect x="17" y="22.5" width="26" height="1.8" rx=".9" fill="var(--t-ink)" fill-opacity=".5"/>` +
    `<path d="M13 28.5h34M13 67.5h34" fill="none" stroke="var(--t-ink)" stroke-width=".9" stroke-dasharray="2.2 1.6"/>` +
    `<rect x="13" y="32.5" width="34" height="11" rx="2" fill="var(--t-accent)"/><circle cx="13" cy="38" r="2.3" fill="var(--t-bg)"/><circle cx="47" cy="38" r="2.3" fill="var(--t-bg)"/>` +
    `<rect x="20" y="36.3" width="20" height="3.4" rx="1" fill="var(--t-on)"/>` +
    [48.5, 55, 61.5].map((y, i) => `<g fill="var(--t-ink)" fill-opacity=".75"><rect x="13" y="${y}" width="3.5" height="2.4"/><rect x="19" y="${y}" width="${[15, 11, 17][i]}" height="2.4"/><rect x="42" y="${y}" width="5" height="2.4"/></g>`).join('') +
    `<path d="M15 71.5v8M17.2 71.5v8M20.4 71.5v8M22.2 71.5v8M25.8 71.5v8M28.2 71.5v8M30 71.5v8M33.4 71.5v8M35.4 71.5v8M38.8 71.5v8M40.6 71.5v8M43.4 71.5v8M45 71.5v8" fill="none" stroke="var(--t-ink)" stroke-width="1.1"/>` +
    `<path d="M18.8 71.5v8M27 71.5v8M37 71.5v8" fill="none" stroke="var(--t-ink)" stroke-width="1.9"/>` +
    `<rect x="20" y="82" width="20" height="1.6" rx=".8" fill="var(--t-ink)" fill-opacity=".5"/>` +
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
      h('span', { class: 'tile-name' }, frag(svgMarkup('check').replace('class="ic"', 'class="ic tick"')), l.label)))
  }
  paintTiles()
  return h('div', { class: 'f', dataset: { path: 'look' } }, wrap, h('p', { class: 'err' }))
}
// The draft's colours, handed to the look sketches and the stage rings.
function paintTiles() {
  const t = E.D.theme
  const bg = normHex(t.bg) || '#ffffff', ink = normHex(t.ink) || '#0f2b29', ac = normHex(t.accent) || '#1c4d4a'
  for (const el of [E.els.tiles, E.els.stage]) {
    if (!el) continue
    el.style.setProperty('--t-bg', bg)
    el.style.setProperty('--t-ink', ink)
    el.style.setProperty('--t-accent', ac)
    el.style.setProperty('--t-on', onAccent(bg, ink, ac))
  }
}

/* ----- 04 colours */
function colourFields() {
  const { D, st } = E
  E.els.colour = {}
  const chips = h('div', { class: 'palettes', role: 'group', 'aria-label': 'Colour presets' },
    st.palettes.map((p) => h('button', {
      class: 'pal', type: 'button', 'data-palette': p.id, 'aria-pressed': 'false',
      title: `${p.label}: background ${p.bg}, text ${p.ink}, accent ${p.accent}`,
      style: { '--p-bg': p.bg, '--p-ink': p.ink, '--p-ac': p.accent },
      onclick: () => pickPalette(p),
    },
    h('span', { class: 'pal-card', 'aria-hidden': 'true' }, h('span', { class: 'pal-aa' }, 'Aa'), h('span', { class: 'pal-btn' })),
    h('span', { class: 'pal-name' }, p.label))))
  E.els.palettes = chips
  const rows = [
    ['bg', 'Background', 'The page itself'],
    ['ink', 'Text', 'Name, links, everything you read'],
    ['accent', 'Accent', 'The main button'],
  ].map(([k, label, hint]) => {
    const pick = h('input', { type: 'color', value: normHex(D.theme[k]) || '#000000', 'aria-label': `${label} colour picker` })
    const hex = input({ value: D.theme[k], maxlength: 7, placeholder: '#1c4d4a', 'aria-label': `${label} hex value` })
    E.els.colour[k] = { pick, hex }
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
  paintPalettes()
  return [chips, h('div', { class: 'colours' }, rows), ratios]
}
// A preset only fills the three colours. They stay free to edit afterwards.
function pickPalette(p) {
  E.D.theme = applyPalette(E.D.theme, p)
  for (const k of ['bg', 'ink', 'accent']) {
    const c = E.els.colour[k]
    c.hex.value = E.D.theme[k]
    const n = normHex(E.D.theme[k])
    if (n) c.pick.value = n
  }
  say(`${p.label} colours applied`)
  afterColour()
}
function paintPalettes() {
  const hit = matchPalette(E.D.theme, E.st.palettes)
  for (const b of E.els.palettes.querySelectorAll('[data-palette]')) b.setAttribute('aria-pressed', String(b.dataset.palette === hit))
}
function afterColour() { paintRatios(); paintTiles(); paintPalettes(); changed() }
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
const FONT_SAMPLE = { heading: 'Your business name', tagline: 'A short line about what you do', body: 'Links and details read like this.' }
function fontPickers() {
  const { D, st } = E
  const fam = (id) => `"${previewFamily(id)}", system-ui, sans-serif`
  const paints = []
  const one = (key, label, bodyOnly) => {
    const groups = groupFonts(st.fonts, { bodyOnly })
    const sel = h('select', { class: 'in font-select', 'data-part': `font-${key}` })
    for (const g of groups) {
      sel.append(h('optgroup', { label: g.label },
        g.fonts.map((f) => h('option', { value: f.id, style: { 'font-family': fam(f.id) } }, f.family))))
    }
    if (![...sel.options].some((o) => o.value === D.font[key])) sel.append(h('option', { value: D.font[key] }, `${D.font[key]} (not available here)`))
    sel.value = D.font[key]
    const sample = h('p', { class: 'font-sample', 'aria-hidden': 'true' })
    // the specimen tray: every face drawn in itself. Built on first open, so closed pickers load no font files.
    const tray = h('div', { class: 'faces', id: `faces-${key}`, role: 'group', 'aria-label': `${label} faces`, hidden: true })
    const browse = h('button', { class: 'btn font-browse', type: 'button', 'aria-expanded': 'false', 'aria-controls': `faces-${key}` }, h('span', null, 'See the faces'), icon('chev'))
    browse.addEventListener('click', () => {
      if (!tray.firstChild) {
        for (const g of groups) {
          tray.append(h('p', { class: 'faces-g' }, g.label), h('div', { class: 'faces-row' }, g.fonts.map((f) =>
            h('button', {
              class: 'face-opt', type: 'button', 'data-font': f.id, 'aria-pressed': String(f.id === D.font[key]),
              onclick: () => { sel.value = f.id; sel.dispatchEvent(new Event('change')) },
            },
            h('span', { class: 'face-ag', 'aria-hidden': 'true', style: { 'font-family': fam(f.id), 'font-weight': key === 'heading' ? '600' : '400' } }, 'Ag'),
            h('span', { class: 'face-n' }, f.family)))))
        }
      }
      const open = tray.hidden
      tray.hidden = !open
      browse.setAttribute('aria-expanded', String(open))
      browse.firstChild.textContent = open ? 'Hide the faces' : 'See the faces'
    })
    const paint = () => {
      const own = key === 'heading' ? D.name.trim() : key === 'tagline' ? D.tagline.trim() : ''
      sample.textContent = own || FONT_SAMPLE[key]
      sample.style.fontFamily = sel.style.fontFamily = fam(D.font[key])
      sample.style.fontWeight = key === 'heading' ? '600' : '400'
      sample.style.fontSize = key === 'heading' ? '' : key === 'tagline' ? '20px' : '16px'
      for (const b of tray.querySelectorAll('[data-font]')) b.setAttribute('aria-pressed', String(b.dataset.font === D.font[key]))
    }
    paint()
    paints.push(paint)
    sel.addEventListener('change', () => { D.font[key] = sel.value; paint(); changed() })
    return field({ label, path: `font.${key}`, control: sel, extra: [browse, sample, tray], cls: 'font' })
  }
  // the samples speak the page's own name and tagline, so they follow what is typed
  E.els.form.addEventListener('input', () => { for (const p of paints) p() })
  return [one('heading', 'Heading font', false), one('tagline', 'Tagline font', false), one('body', 'Body font', true)]
}

/* ----- 06 images */
const HEIC_MSG = 'This looks like an iPhone HEIC photo. Open it in Photos and export as JPEG, or use Safari, which can read it.'
const sizeText = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
class PrepError extends Error {}

async function decodeImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch { /* fall through to <img> */ }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally { URL.revokeObjectURL(url) }
}
const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q))

// Shrinks and re-encodes a raster photo in the browser. Resolves { blob, name }.
async function prepareImage(file, key) {
  let src
  try { src = await decodeImage(file) } catch {
    throw new PrepError(isHeic(file) ? HEIC_MSG : 'That file could not be read as a picture. Try a JPG or PNG.')
  }
  const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight
  const { width, height } = targetSize(sw, sh, MAX_SIDE[key])
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, width, height)
  if (src.close) src.close()
  let type = 'image/webp'
  let blob = await toBlob(canvas, type, 0.82)
  if (!blob || blob.type !== 'image/webp') { type = 'image/jpeg'; blob = await toBlob(canvas, type, 0.82) }
  if (!blob) throw new PrepError('This browser could not convert the photo. Try a smaller JPG.')
  for (const q of qualitySteps().slice(1)) {
    if (blob.size <= TARGET_BYTES) break
    blob = await toBlob(canvas, type, q) || blob
  }
  return { blob, name: outputName(file.name, type === 'image/webp' ? 'webp' : 'jpg') }
}

function imageFields() {
  return h('div', { class: 'imgs' }, imageField('logo', 'Logo', 'Square works best'), imageField('cover', 'Cover', 'Wide photo, about 4:3'))
}
function imageField(key, label, hint) {
  const { D } = E
  const thumb = h('div', { class: 'thumb' })
  const fileLine = h('p', { class: 'img-file' })
  const status = h('p', { class: 'hint', 'aria-live': 'polite' })
  const fileIn = h('input', { type: 'file', accept: 'image/*,.heic,.heif', 'aria-label': `Choose ${label.toLowerCase()} file` })
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

  const upload = async (file) => {
    const local = (msg) => { status.textContent = ''; wrap.classList.add('bad'); err.replaceChildren(icon('warn'), h('span', null, msg)) }
    wrap.classList.remove('bad'); err.replaceChildren()
    const sp = slugProblem(D.slug)
    if (sp) return local('Set the page address first, the file is stored under it.')
    let body = file, name = file.name.toLowerCase().replace(/\s+/g, '-'), type = file.type || 'application/octet-stream'
    pick.classList.add('busy')
    try {
      if (shouldReencode(file)) {
        status.textContent = 'Preparing photo...'
        try {
          const out = await prepareImage(file, key)
          body = out.blob; name = out.name; type = out.blob.type
        } catch (e) {
          pick.classList.remove('busy')
          return local(e instanceof PrepError ? e.message : 'That file could not be prepared. Try a JPG or PNG.')
        }
      } else if (!ASSET_RE.test(name) || name.includes('..')) {
        pick.classList.remove('busy')
        return local('Choose a photo, or an SVG with a plain file name.')
      }
      if (body.size > MAX_ASSET) {
        pick.classList.remove('busy')
        return local(`That file is ${sizeText(body.size)}. The limit is 3 MB.`)
      }
      status.textContent = 'Uploading...'
      const r = await api(`/api/clients/${D.slug}/assets?name=${encodeURIComponent(name)}`, { method: 'POST', body, type })
      pick.classList.remove('busy')
      if (!E) return
      if (r.status === 201 && r.data && r.data.file) {
        D[key] = r.data.file
        E.ver[key] = Date.now()
        E.uploaded = true
        status.textContent = `Uploaded, ${sizeText(body.size)}`
        setTimeout(() => { if (status.textContent.startsWith('Uploaded')) status.textContent = '' }, 4000)
        paint(); lockSlug(); changed()
      } else {
        local(r.data && r.data.error ? r.data.error : r.offline ? 'The studio server is not running.' : `Upload failed (server answered ${r.status}).`)
      }
    } catch (e) {
      pick.classList.remove('busy')
      local('Something went wrong while uploading. Try again.')
    }
  }
  fileIn.addEventListener('change', () => {
    const file = fileIn.files && fileIn.files[0]
    fileIn.value = ''
    if (file) upload(file)
  })
  let depth = 0
  wrap.addEventListener('dragenter', (e) => { if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); depth++; wrap.classList.add('drop') })
  wrap.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } })
  wrap.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) wrap.classList.remove('drop') })
  wrap.addEventListener('drop', (e) => {
    e.preventDefault(); depth = 0; wrap.classList.remove('drop')
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
    if (file) upload(file)
  })
  remove.addEventListener('click', () => {
    D[key] = null
    paint(); lockSlug(); changed()
    pick.querySelector('input').focus()
  })
  return wrap
}

/* ----- 07 blocks */
const BLOCK_ICON = { link: 'link', heading: 'heading', text: 'text', socials: 'socials', video: 'video' }
const FIRST_PART = { link: 'url', heading: 'text', text: 'text', socials: 'kind-0', video: 'url' }
const HEAD_PARTS = ['toggle', 'up', 'down', 'remove']
const kindLabel = (k) => k.label || 'Custom link'
const schemeInput = (scheme) => (scheme === 'tel:' ? 'tel' : scheme === 'mailto:' ? 'email' : 'url')

function blockSection() {
  const list = h('ol', { class: 'rows blocks', 'aria-label': 'Blocks' })
  const menu = h('div', { class: 'add-menu', role: 'group', 'aria-label': 'Add a block' })
  const count = h('span', { class: 'hint block-count', 'aria-live': 'polite' })
  const btns = {}
  for (const t of BLOCK_TYPES) {
    btns[t.type] = h('button', { class: 'add-tile', type: 'button', 'data-add': t.type, title: t.hint, onclick: () => addOfType(t) },
      h('span', { class: 'block-ic', 'aria-hidden': 'true' }, icon(BLOCK_ICON[t.type])), h('strong', null, t.label), h('small', null, t.hint))
    menu.append(btns[t.type])
  }
  // PRESENTATION state: which cards are open. A new page starts open; an existing one starts as a tidy stack.
  E.open = new Set(E.mode === 'new' ? E.D.blocks.map((b) => b.id) : [])
  const all = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-part': 'toggle-all' })
  all.addEventListener('click', () => {
    E.open = new Set(E.open.size < E.D.blocks.length ? E.D.blocks.map((b) => b.id) : [])
    renderBlocks()
    all.focus()
  })
  E.els.blocks = { list, menu, count, btns, all }
  renderBlocks()
  return h('div', { class: 'f', dataset: { path: 'blocks' } },
    h('div', { class: 'blocks-bar' }, h('span', { class: 'hint' }, 'Top to bottom, the way the page shows them. The first link is the main button.'), all),
    list, h('p', { class: 'err' }),
    h('div', { class: 'add-tray' }, h('p', { class: 'add-title' }, 'Add a block', count), menu))
}
const paintToggleAll = () => { E.els.blocks.all.textContent = E.open.size < E.D.blocks.length ? 'Open all' : 'Close all' }

function addOfType(t) {
  const { D, st } = E
  const r = addBlock(D.blocks, t.type, { limits: st.limits, kinds: st.kinds, nextId })
  if (!r.ok) { say(r.reason); return }
  D.blocks = r.blocks
  const added = D.blocks[D.blocks.length - 1]
  renderBlocks({ id: added.id, part: FIRST_PART[t.type] })
  say(`${t.label} block added at position ${D.blocks.length}`)
  changed()
}

function renderBlocks(focus) {
  const { D, st } = E
  const { list, count, btns } = E.els.blocks
  // a card that is about to take focus inside its body opens first; cards that are gone leave the open set
  if (focus && !HEAD_PARTS.includes(focus.part)) E.open.add(focus.id)
  for (const id of E.open) if (!D.blocks.some((b) => b.id === id)) E.open.delete(id)
  paintToggleAll()
  list.replaceChildren()
  const firstLink = D.blocks.findIndex((b) => b.type === 'link')
  D.blocks.forEach((b, i) => list.append(blockCard(b, i, i === firstLink)))

  const counts = countByType(D.blocks)
  const reasons = []
  for (const t of BLOCK_TYPES) {
    const can = canAdd(D.blocks, t.type, st.limits)
    btns[t.type].disabled = !can.ok
    btns[t.type].title = can.ok ? t.hint : can.reason
    if (!can.ok && !reasons.includes(can.reason)) reasons.push(can.reason)
  }
  count.textContent = `${D.blocks.length} of ${st.limits.blocks} blocks (links ${counts.link}/${st.limits.links}, videos ${counts.video}/${st.limits.videos}, socials ${counts.socials}/${st.limits.socials}).${reasons.length ? ' ' + reasons.join('. ') + '.' : ''}`

  if (focus) {
    const row = list.querySelector(`[data-id="${focus.id}"]`)
    let el = row && row.querySelector(`[data-part="${focus.part}"]`)
    if (el && el.disabled) el = row.querySelector('[data-part="up"]:not([disabled]), [data-part="down"]:not([disabled])')
    ;(el || btns.link).focus()
  }
  paintErrors()
}

// One labelled control with its own error slot. Path matches the validator's, so errors land on it.
function subField(path, label, ctl, { cls, hint } = {}) {
  ctl.id = ctl.id || `f${++fid}`
  const hintId = hint ? `${ctl.id}-hint` : null
  ctl.setAttribute('aria-describedby', [hintId, `${ctl.id}-err`].filter(Boolean).join(' '))
  return h('div', { class: `f${cls ? ' ' + cls : ''}`, dataset: { path } },
    h('label', { for: ctl.id }, label), ctl,
    hint ? h('p', { class: 'hint', id: hintId }, hint) : null,
    h('p', { class: 'err', id: `${ctl.id}-err` }))
}

function counter(ctl, max) {
  const el = h('span', { class: 'count' })
  const paint = () => { el.textContent = `${ctl.value.length}/${max}` }
  paint()
  ctl.addEventListener('input', paint)
  return el
}

// What a closed card says about itself.
function blockSummary(b) {
  const bare = (u) => u.trim().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  if (b.type === 'link') {
    const k = kindLabel(E.st.kinds.find((x) => x.id === b.kind) || {})
    const label = b.label.trim()
    return { title: label || k, sub: [label ? k : 'Link', bare(b.url) || 'no address yet'].join(' · ') }
  }
  if (b.type === 'heading') return { title: b.text.trim(), sub: 'Heading' }
  if (b.type === 'text') return { title: b.text.trim().split('\n')[0], sub: 'Text' }
  if (b.type === 'video') return { title: bare(b.url), sub: 'Video' }
  const names = b.items.map((it) => (E.st.kinds.find((x) => x.id === it.kind) || {}).label || it.kind)
  return { title: names.join(', '), sub: `Socials · ${plural(b.items.length, 'icon')}` }
}

function blockCard(b, i, isMain) {
  const { D } = E
  const n = i + 1
  const meta = BLOCK_TYPES.find((t) => t.type === b.type)
  const lc = meta.label.toLowerCase()
  const btn = (ic, text, part, disabled, fn) =>
    h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': `${text} ${lc} block ${n}`, title: text, disabled, 'data-part': part, onclick: fn }, icon(ic))
  const move = (dir) => {
    D.blocks = moveBlock(D.blocks, i, dir)
    const to = i + dir
    const stay = to === 0 ? 'down' : to === D.blocks.length - 1 ? 'up' : dir < 0 ? 'up' : 'down'
    renderBlocks({ id: b.id, part: stay })
    say(`${meta.label} moved to position ${to + 1} of ${D.blocks.length}`)
    changed()
  }
  const open = E.open.has(b.id)
  const bodyId = `blk-${b.id}`
  const kindIcon = h('span', { class: 'block-ic', 'aria-hidden': 'true' }, icon(b.type === 'link' && G[b.kind] ? b.kind : BLOCK_ICON[b.type]))
  const body = b.type === 'link' ? linkBody(b, i, kindIcon)
    : b.type === 'socials' ? socialsBody(b, i)
    : b.type === 'video' ? videoBody(b, i)
    : textBody(b, i)
  const sumT = h('strong'), sumS = h('span')
  const paintSum = () => {
    const s = blockSummary(b)
    sumT.textContent = s.title || 'Nothing here yet'
    sumT.classList.toggle('empty', !s.title)
    sumS.textContent = s.sub
  }
  paintSum()
  const toggle = h('button', { class: 'block-toggle', type: 'button', 'data-part': 'toggle', 'aria-expanded': String(open), 'aria-controls': bodyId },
    h('span', { class: 'block-no', 'aria-hidden': 'true' }, n), kindIcon, h('span', { class: 'block-sum' }, sumT, sumS),
    isMain ? h('span', { class: 'tag' }, 'Main button') : null,
    frag(svgMarkup('chev').replace('class="ic"', 'class="ic chev"')))
  const li = h('li', { class: `block block-${b.type}${isMain ? ' main' : ''}${open ? '' : ' shut'}`, dataset: { path: `blocks[${i}]`, id: b.id, type: b.type } },
    h('div', { class: 'block-h' }, toggle,
      h('div', { class: 'row-acts' },
        btn('up', 'Move up', 'up', i === 0, () => move(-1)),
        btn('down', 'Move down', 'down', i === D.blocks.length - 1, () => move(1)),
        btn('close', 'Remove', 'remove', D.blocks.length === 1, () => {
          D.blocks = removeBlock(D.blocks, i)
          const nx = D.blocks[i] || D.blocks[i - 1]
          renderBlocks(nx ? { id: nx.id, part: 'remove' } : null)
          say(`${meta.label} ${n} removed`)
          changed()
        }))),
    h('div', { class: 'block-body', id: bodyId }, body),
    h('p', { class: 'err' }))
  toggle.addEventListener('click', () => {
    const shut = li.classList.toggle('shut')
    toggle.setAttribute('aria-expanded', String(!shut))
    if (shut) E.open.delete(b.id)
    else E.open.add(b.id)
    paintToggleAll()
  })
  // the closed card's line follows whatever is typed, picked or removed inside it
  for (const ev of ['input', 'change', 'click']) li.addEventListener(ev, () => queueMicrotask(paintSum))
  return li
}

function linkBody(b, i, kindIcon) {
  const { st } = E
  const kinds = st.kinds
  const kindOf = (id) => kinds.find((k) => k.id === id) || { id, label: id, scheme: 'https:' }
  const k = kindOf(b.kind)
  const sel = h('select', { class: 'in', 'data-part': 'kind' },
    kinds.map((x) => h('option', { value: x.id }, kindLabel(x))),
    kinds.some((x) => x.id === b.kind) ? null : h('option', { value: b.kind }, `${b.kind} (unknown)`))
  sel.value = b.kind
  const url = input({ value: b.url, placeholder: placeholderFor(b.kind, k.scheme), inputmode: schemeInput(k.scheme), 'data-part': 'url' })
  const label = input({ value: b.label, maxlength: st.limits.label, placeholder: k.label || 'Button text', spellcheck: 'true', 'data-part': 'label' })
  const hintEl = h('p', { class: 'hint link-hint', hidden: true, role: 'status' })
  const schemeHint = h('span', { class: 'scheme-hint' })
  const labelField = subField(`blocks[${i}].label`, '', label, { cls: 'wide' })
  const labelLbl = labelField.querySelector('label')
  const paintKind = (kind) => {
    const nk = kindOf(kind)
    url.placeholder = placeholderFor(kind, nk.scheme)
    label.placeholder = nk.label || 'Button text'
    url.inputMode = schemeInput(nk.scheme)
    schemeHint.textContent = `Starts with ${nk.scheme === 'https:' ? 'https://' : nk.scheme}. Example: ${placeholderFor(kind, nk.scheme)}`
    labelLbl.textContent = kind === 'custom' ? 'Button text (required)' : 'Button text (optional)'
    kindIcon.replaceChildren(icon(G[kind] ? kind : 'link'))
  }
  paintKind(b.kind)
  sel.addEventListener('change', () => {
    const r = switchKind(b, sel.value, kinds)
    b.kind = r.kind; b.label = r.label; b.url = r.url
    url.value = r.url
    label.value = r.label
    paintKind(b.kind)
    const msg = r.hint || (r.needsLabel ? 'A custom link needs button text.' : '')
    hintEl.textContent = msg
    hintEl.hidden = !msg
    changed()
  })
  url.addEventListener('input', () => { b.url = url.value; hintEl.hidden = true; changed() })
  url.addEventListener('blur', () => {
    // small kindness: a bare number on a phone link becomes tel:, a bare email becomes mailto:, a bare domain https://
    const fixed = switchKind({ kind: b.kind, label: '', url: url.value }, b.kind, kinds).url
    if (fixed !== url.value) { url.value = b.url = fixed; changed() }
  })
  label.addEventListener('input', () => { b.label = label.value; changed() })
  return h('div', { class: 'link-grid' },
    subField(`blocks[${i}].kind`, 'Kind', sel),
    subField(`blocks[${i}].url`, 'Link address', url, { hint: schemeHint }),
    labelField,
    hintEl)
}

function textBody(b, i) {
  const { st } = E
  const isHeading = b.type === 'heading'
  const ctl = isHeading
    ? input({ value: b.text, maxlength: st.limits.heading, placeholder: 'Our menu', spellcheck: 'true', 'data-part': 'text' })
    : h('textarea', { class: 'in', rows: 4, maxlength: st.limits.text, placeholder: 'A few lines about the shop. Plain text only.', spellcheck: 'true', 'data-part': 'text' })
  if (!isHeading) ctl.value = b.text
  ctl.addEventListener('input', () => { b.text = ctl.value; changed() })
  const f = subField(`blocks[${i}].text`, isHeading ? 'Heading' : 'Text', ctl, { hint: isHeading ? 'One short line.' : 'Plain text, up to 4 line breaks.' })
  f.querySelector('label').append(' ', counter(ctl, isHeading ? st.limits.heading : st.limits.text))
  return f
}

function videoBody(b, i) {
  const url = input({ value: b.url, placeholder: 'https://youtu.be/...', inputmode: 'url', 'data-part': 'url' })
  url.addEventListener('input', () => { b.url = url.value; changed() })
  return subField(`blocks[${i}].url`, 'Video link', url, { hint: 'A YouTube or TikTok video. For TikTok open the video and copy the full address; short vm.tiktok.com links are refused.' })
}

function socialsBody(b, i) {
  const { st } = E
  const sk = socialKinds(st.kinds)
  const kindOf = (id) => st.kinds.find((k) => k.id === id) || { id, label: id, scheme: 'https:' }
  const items = h('ul', { class: 'social-items', 'aria-label': `Icons in socials block ${i + 1}` })
  const addBtn = h('button', { class: 'btn btn-sm', type: 'button', 'data-part': 'add-icon' }, icon('plus'), 'Add icon')
  const left = h('span', { class: 'hint' })
  const paint = (focusPart) => {
    items.replaceChildren()
    b.items.forEach((it, j) => {
      const sel = h('select', { class: 'in', 'data-part': `kind-${j}` },
        sk.map((x) => h('option', { value: x.id }, x.label)),
        sk.some((x) => x.id === it.kind) ? null : h('option', { value: it.kind }, `${it.kind} (not an icon kind)`))
      sel.value = it.kind
      const url = input({ value: it.url, placeholder: placeholderFor(it.kind, kindOf(it.kind).scheme), inputmode: schemeInput(kindOf(it.kind).scheme), 'data-part': `url-${j}` })
      sel.addEventListener('change', () => {
        const r = switchKind({ kind: it.kind, label: '', url: it.url }, sel.value, st.kinds)
        it.kind = r.kind; it.url = r.url
        url.value = r.url
        url.placeholder = placeholderFor(it.kind, kindOf(it.kind).scheme)
        changed()
      })
      url.addEventListener('input', () => { it.url = url.value; changed() })
      url.addEventListener('blur', () => {
        const fixed = switchKind({ kind: it.kind, label: '', url: url.value }, it.kind, st.kinds).url
        if (fixed !== url.value) { url.value = it.url = fixed; changed() }
      })
      const rm = h('button', {
        class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'data-part': `remove-${j}`, disabled: b.items.length === 1,
        'aria-label': `Remove icon ${j + 1} from socials block ${i + 1}`, title: 'Remove icon',
        onclick: () => { b.items = removeSocialItem(b.items, j); paint(`remove-${Math.min(j, b.items.length - 1)}`); say(`Icon ${j + 1} removed`); changed() },
      }, icon('close'))
      items.append(h('li', { class: 'social-item', dataset: { path: `blocks[${i}].items[${j}]` } },
        subField(`blocks[${i}].items[${j}].kind`, 'Icon', sel),
        subField(`blocks[${i}].items[${j}].url`, 'Address', url),
        rm, h('p', { class: 'err' })))
    })
    addBtn.disabled = b.items.length >= st.limits.socialItems
    left.textContent = `${b.items.length} of ${st.limits.socialItems} icons`
    if (focusPart) items.querySelector(`[data-part="${focusPart}"]`)?.focus()
    if (E.els.form) paintErrors()
  }
  addBtn.addEventListener('click', () => {
    const r = addSocialItem(b.items, { limits: st.limits, kinds: st.kinds })
    if (!r.ok) { say(r.reason); return }
    b.items = r.items
    paint(`url-${b.items.length - 1}`)
    changed()
  })
  paint()
  return h('div', { class: 'socials-body' }, items, h('div', { class: 'adds' }, addBtn, left))
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
  // allow-scripts is only so the YouTube/TikTok iframes inside the proof can run (sandbox flags are inherited by nested frames).
  // The proof itself never contains a <script> (renderPage guarantees it), and links are blocked from navigating.
  const mk = () => h('iframe', { title: 'Preview of the tap page', sandbox: 'allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox allow-presentation', tabindex: '-1', loading: 'eager' })
  E.frames = [mk(), mk()]
  E.front = 0
  E.els.empty = h('div', { class: 'screen-empty' },
    h('div', null, frag(MARK), h('strong', null, 'The page shows up here'), 'Give it a name and a working link.'))
  E.els.pulse = h('span', { class: 'pulse busy' })
  E.els.pulseText = h('span', null, 'Updating')
  E.els.pulse.append(E.els.pulseText)
  E.els.perrs = h('div', { class: 'stage-errs', hidden: true, 'aria-live': 'polite' })
  E.els.stageClose = h('button', { class: 'btn btn-ghost btn-icon stage-close', type: 'button', 'aria-label': 'Close preview' }, icon('close'))
  E.els.stage = h('aside', { class: 'stage on-teal', id: 'stage', 'aria-label': 'Live preview' },
    h('div', { class: 'stage-in' },
      h('div', { class: 'stage-h' }, h('span', { title: '360 px is the most common Android screen width' }, h('strong', null, 'Live'), '360 px wide'), E.els.pulse, E.els.stageClose),
      h('div', { class: 'phone' }, h('div', { class: 'screen' }, E.els.empty, ...E.frames), E.els.perrs)))
  return E.els.stage
}

// DATA: debounced preview call. Answers can arrive out of order; only the newest counts.
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
  if (r.data && Array.isArray(r.data.warnings)) ed.warnings = r.data.warnings
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
  // swap when the new page has loaded; a slow video iframe must not hold the proof back, so also swap after 1.2 s
  let swapped = false
  const swap = () => {
    if (swapped || !E) return
    swapped = true
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
  back.onload = swap
  setTimeout(swap, 1200)
  // CSP first: this frame shares the studio origin, so the page inside must not run script (see withPreviewCsp)
  back.srcdoc = withPreviewCsp(html)
}

/* ---------------------------------------------------------------- errors + warnings */
// Finds the field a path belongs to, walking up: blocks[2].items[1].url -> blocks[2].items[1] -> blocks[2] -> blocks.
function findField(path) {
  const form = E.els.form
  const q = (p) => form.querySelector(`[data-path="${CSS.escape(p)}"]`)
  let p = path
  while (p) {
    const el = q(p)
    if (el) return el
    const next = p.replace(/(\[\d+\]|\.[\w$]+)$/, '')
    if (next === p) break
    p = next
  }
  return null
}

function paintErrors() {
  if (!E || !E.els.form) return
  const form = E.els.form
  for (const el of form.querySelectorAll('[data-path].bad')) {
    el.classList.remove('bad')
    const er = el.querySelector(':scope > .err'); if (er) er.replaceChildren()
    for (const c of el.querySelectorAll(':scope > [aria-invalid], :scope > .addr > [aria-invalid]')) c.removeAttribute('aria-invalid')
  }
  for (const el of form.querySelectorAll('.warn-note')) el.remove()
  for (const el of form.querySelectorAll('[data-warn]')) el.removeAttribute('data-warn')
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

  // warnings: beside the field they are about, plus one list at the top. They never block Save or Publish.
  const warns = (E.warnings || []).map((w) => ({ raw: w, ...parseError(w) }))
  for (const w of warns) {
    const el = findField(w.path)
    w.el = el
    if (!el) continue
    el.setAttribute('data-warn', '')
    el.append(h('p', { class: 'warn-note', role: 'note' }, icon('note'), h('span', null, humanMsg(w.path, w.msg))))
  }
  const ws = E.els.warnSummary
  if (ws) {
    if (warns.length) {
      ws.hidden = false
      ws.replaceChildren(
        h('h2', null, icon('note'), warns.length === 1 ? 'One thing to look at (you can still save and publish)' : `${warns.length} things to look at (you can still save and publish)`),
        h('ul', null, warns.map((w) => h('li', null,
          w.el ? h('button', { type: 'button', onclick: () => focusField(w.el) }, pathName(w.path)) : pathName(w.path),
          `: ${humanMsg(w.path, w.msg)}`))))
    } else { ws.hidden = true; ws.replaceChildren() }
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
  // a field inside a closed block card: open the card first
  el.closest('.block.shut')?.querySelector(':scope > .block-h [data-part="toggle"]')?.click()
  const ctl = el.querySelector('input:not([type="hidden"]):not([readonly]), select, textarea, button') || el
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  ctl.focus({ preventScroll: true })
}

/* ---------------------------------------------------------------- save */
// DATA: PUT the page. New pages send create:true; the server answers 409 for a taken address or an old (redirected) one.
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
  if (r.data && Array.isArray(r.data.warnings)) ed.warnings = r.data.warnings
  if (r.status === 200) {
    ed.initial = JSON.stringify(data)
    const w = ed.warnings.length
    S.flash = { title: `Saved ${data.name || data.slug}.`, text: `It goes on the cards when you publish.${w ? ` ${plural(w, 'warning')}: ${say1(ed.warnings[0]).replace(/\.$/, '')}${w > 1 ? ' and more' : ''}.` : ''}` }
    guard = null
    location.hash = '#/'
    return
  }
  ed.els.state.textContent = 'Not saved'
  if (r.status === 422 && r.data && Array.isArray(r.data.errors)) ed.errors = r.data.errors
  else if (r.status === 409) ed.errors = [`slug: ${r.data && r.data.error ? r.data.error : `"${data.slug}" is already taken by another page. Pick another address.`}`]
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
