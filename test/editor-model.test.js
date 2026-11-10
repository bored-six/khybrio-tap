// Pure editor logic for the studio (studio/editor-model.js): block list rules, payload/fromData, font grouping, palettes, rename.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BLOCK_TYPES, newBlock, canAdd, addBlock, moveBlock, removeBlock, countByType,
  addSocialItem, removeSocialItem, socialKinds,
  payload, fromData, blankDraft,
  groupFonts, fontFaceCss, applyPalette, matchPalette, slugProblem, renameGate,
} from '../studio/editor-model.js'

const LIMITS = { blocks: 30, links: 20, videos: 3, socials: 2, socialItems: 8, heading: 60, text: 280, label: 40 }
const KINDS = [
  { id: 'website', label: 'Visit our website', scheme: 'https:', social: false },
  { id: 'custom', label: '', scheme: 'https:', social: false },
  { id: 'facebook', label: 'Facebook', scheme: 'https:', social: true },
  { id: 'phone', label: 'Call us', scheme: 'tel:', social: true },
  { id: 'viber', label: 'Message on Viber', scheme: 'viber:', social: true },
]
const FONTS = [
  { id: 'fraunces', family: 'Fraunces', group: 'serif', body: true },
  { id: 'dm-serif-display', family: 'DM Serif Display', group: 'serif', body: false },
  { id: 'inter', family: 'Inter', group: 'sans', body: true },
  { id: 'anton', family: 'Anton', group: 'display', body: false },
  { id: 'pacifico', family: 'Pacifico', group: 'script', body: false },
  { id: 'space-mono', family: 'Space Mono', group: 'mono', body: false },
]
const ST = { looks: [{ id: 'card' }, { id: 'menu-board' }], fonts: FONTS, kinds: KINDS }
let n = 0
const mk = () => ++n
const link = () => ({ id: mk(), type: 'link', kind: 'website', url: '', label: '' })

test('block type menu lists the five types', () => {
  assert.deepEqual(BLOCK_TYPES.map((t) => t.type), ['link', 'heading', 'text', 'socials', 'video'])
})

test('newBlock gives each type its own empty shape and a unique id', () => {
  const a = newBlock('link', { kinds: KINDS, nextId: mk })
  assert.deepEqual({ ...a, id: 0 }, { id: 0, type: 'link', kind: 'website', url: '', label: '' })
  assert.deepEqual({ ...newBlock('heading', { kinds: KINDS, nextId: mk }), id: 0 }, { id: 0, type: 'heading', text: '' })
  assert.deepEqual({ ...newBlock('text', { kinds: KINDS, nextId: mk }), id: 0 }, { id: 0, type: 'text', text: '' })
  assert.deepEqual({ ...newBlock('video', { kinds: KINDS, nextId: mk }), id: 0 }, { id: 0, type: 'video', url: '' })
  const s = newBlock('socials', { kinds: KINDS, nextId: mk })
  assert.equal(s.type, 'socials')
  assert.equal(s.items.length, 1)
  assert.equal(KINDS.find((k) => k.id === s.items[0].kind).social, true)
  assert.notEqual(a.id, s.id)
})

test('addBlock appends, never mutates the input, and refuses at each limit with a reason', () => {
  const start = [link()]
  const r = addBlock(start, 'heading', { limits: LIMITS, kinds: KINDS, nextId: mk })
  assert.equal(r.ok, true)
  assert.equal(r.blocks.length, 2)
  assert.equal(start.length, 1)

  const full = Array.from({ length: 30 }, () => ({ id: mk(), type: 'heading', text: 'x' }))
  const r1 = addBlock(full, 'text', { limits: LIMITS, kinds: KINDS, nextId: mk })
  assert.equal(r1.ok, false)
  assert.match(r1.reason, /30/)

  const videos = Array.from({ length: 3 }, () => ({ id: mk(), type: 'video', url: '' }))
  assert.equal(canAdd(videos, 'video', LIMITS).ok, false)
  assert.match(canAdd(videos, 'video', LIMITS).reason, /3 video/)
  assert.equal(canAdd(videos, 'link', LIMITS).ok, true)

  const socials = [newBlock('socials', { kinds: KINDS, nextId: mk }), newBlock('socials', { kinds: KINDS, nextId: mk })]
  assert.equal(canAdd(socials, 'socials', LIMITS).ok, false)

  const links = Array.from({ length: 20 }, link)
  assert.equal(canAdd(links, 'link', LIMITS).ok, false)
  assert.equal(canAdd(links, 'heading', LIMITS).ok, true)
})

test('countByType counts every type, including zeros', () => {
  assert.deepEqual(countByType([link(), link(), { type: 'video' }]), { link: 2, heading: 0, text: 0, socials: 0, video: 1 })
})

test('moveBlock swaps with the neighbour, clamps at the ends, returns a new array', () => {
  const a = { id: 1 }, b = { id: 2 }, c = { id: 3 }
  const src = [a, b, c]
  assert.deepEqual(moveBlock(src, 1, -1), [b, a, c])
  assert.deepEqual(moveBlock(src, 1, 1), [a, c, b])
  assert.deepEqual(src, [a, b, c])
  assert.deepEqual(moveBlock(src, 0, -1), [a, b, c])
  assert.deepEqual(moveBlock(src, 2, 1), [a, b, c])
  assert.deepEqual(moveBlock(src, 9, 1), [a, b, c])
})

test('removeBlock drops one, and keeps the last block (a page needs 1 to 30)', () => {
  const a = { id: 1 }, b = { id: 2 }
  assert.deepEqual(removeBlock([a, b], 0), [b])
  assert.deepEqual(removeBlock([a], 0), [a])
  assert.deepEqual(removeBlock([a, b], 5), [a, b])
})

test('socials rows: only social kinds, capped at socialItems, at least one row stays', () => {
  assert.deepEqual(socialKinds(KINDS).map((k) => k.id), ['facebook', 'phone', 'viber'])
  const b = newBlock('socials', { kinds: KINDS, nextId: mk })
  let items = b.items
  for (let i = 0; i < 10; i++) items = addSocialItem(items, { limits: LIMITS, kinds: KINDS }).items
  assert.equal(items.length, 8)
  assert.equal(addSocialItem(items, { limits: LIMITS, kinds: KINDS }).ok, false)
  assert.equal(items.every((i) => KINDS.find((k) => k.id === i.kind).social), true)
  assert.equal(removeSocialItem([{ kind: 'facebook', url: '' }], 0).length, 1)
  assert.equal(removeSocialItem(items, 0).length, 7)
})

test('payload: contract keys only, empty optionals dropped, hex normalised, custom label kept', () => {
  const D = {
    slug: 'cafe', name: '  Cafe  ', tagline: '  ', look: 'card',
    theme: { bg: '#FFF', ink: ' #0f2b29', accent: 'nope' },
    font: { heading: 'fraunces', tagline: 'inter', body: 'inter' },
    logo: null, cover: 'c.jpg',
    blocks: [
      { id: 1, type: 'link', kind: 'website', url: ' https://a.ph ', label: '' },
      { id: 2, type: 'link', kind: 'custom', url: 'https://b.ph', label: ' Our shop ' },
      { id: 3, type: 'heading', text: ' Hi ' },
      { id: 4, type: 'text', text: ' a\nb ' },
      { id: 5, type: 'socials', items: [{ kind: 'facebook', url: ' https://f.com/x ' }] },
      { id: 6, type: 'video', url: ' https://youtu.be/aaaaaaaaaaa ' },
    ],
    branches: [{ id: 9, name: 'A', address: '', hours: '', maps: '' }, { id: 10, name: '', address: '', hours: '', maps: '' }],
    credit: false,
  }
  const p = payload(D)
  assert.deepEqual(Object.keys(p), ['slug', 'name', 'look', 'theme', 'font', 'cover', 'blocks', 'branches', 'credit'])
  assert.equal(p.name, 'Cafe')
  assert.deepEqual(p.theme, { bg: '#ffffff', ink: '#0f2b29', accent: 'nope' })
  assert.deepEqual(p.blocks, [
    { type: 'link', kind: 'website', url: 'https://a.ph' },
    { type: 'link', kind: 'custom', url: 'https://b.ph', label: 'Our shop' },
    { type: 'heading', text: 'Hi' },
    { type: 'text', text: 'a\nb' },
    { type: 'socials', items: [{ kind: 'facebook', url: 'https://f.com/x' }] },
    { type: 'video', url: 'https://youtu.be/aaaaaaaaaaa' },
  ])
  assert.deepEqual(p.branches, [{ name: 'A' }])
  assert.equal(p.credit, false)
  assert.equal('links' in p, false)
})

test('payload keeps empty blocks so error paths blocks[i] still match the screen order', () => {
  const D = blankDraft(ST, mk)
  D.blocks.push(newBlock('heading', { kinds: KINDS, nextId: mk }))
  assert.equal(payload(D).blocks.length, 2)
})

test('fromData then payload round-trips a v2 client, and a v1 shaped one gets sane defaults', () => {
  const data = {
    slug: 'cafe', name: 'Cafe', tagline: 'Hi', look: 'menu-board',
    theme: { bg: '#ffffff', ink: '#000000', accent: '#e8622d' },
    font: { heading: 'anton', tagline: 'inter', body: 'inter' },
    logo: 'l.png',
    blocks: [
      { type: 'link', kind: 'phone', url: 'tel:+63917' },
      { type: 'heading', text: 'Menu' },
      { type: 'text', text: 'One\nTwo' },
      { type: 'socials', items: [{ kind: 'facebook', url: 'https://f.com/x' }] },
      { type: 'video', url: 'https://youtu.be/aaaaaaaaaaa' },
    ],
    branches: [{ name: 'A', hours: '8-5' }],
    credit: true,
  }
  assert.deepEqual(payload(fromData(data, 'cafe', ST, mk)), data)
  const bare = fromData({ name: 'X', blocks: [] }, 'x', ST, mk)
  assert.equal(bare.look, 'card')
  assert.deepEqual(bare.font, { heading: 'fraunces', tagline: 'inter', body: 'inter' })
  assert.equal(bare.blocks.length, 1)
  assert.equal(bare.credit, true)
  const partial = fromData({ font: { heading: 'anton', body: 'figtree' } }, 'x', { ...ST, fonts: [...FONTS, { id: 'figtree', family: 'Figtree', group: 'sans', body: true }] }, mk)
  assert.deepEqual(partial.font, { heading: 'anton', tagline: 'figtree', body: 'figtree' })
})

test('fromData ignores junk without throwing', () => {
  assert.doesNotThrow(() => fromData(null, 'x', ST, mk))
  assert.doesNotThrow(() => fromData({ blocks: [null, 7, { type: 'weird' }, { type: 'socials' }] }, 'x', ST, mk))
  const d = fromData({ blocks: [{ type: 'socials' }, { type: 'link' }] }, 'x', ST, mk)
  assert.equal(d.blocks[0].items.length, 1)
  assert.equal(d.blocks[1].kind, 'website')
})

test('groupFonts groups in a fixed group order, keeps list order inside a group, body picker hides non-body fonts', () => {
  const all = groupFonts(FONTS)
  assert.deepEqual(all.map((g) => g.group), ['serif', 'sans', 'display', 'script', 'mono'])
  assert.deepEqual(all[0].fonts.map((f) => f.id), ['fraunces', 'dm-serif-display'])
  assert.equal(all[0].label, 'Serif')
  const body = groupFonts(FONTS, { bodyOnly: true })
  assert.deepEqual(body.map((g) => g.group), ['serif', 'sans'])
  assert.deepEqual(body.flatMap((g) => g.fonts.map((f) => f.id)), ['fraunces', 'inter'])
  assert.deepEqual(groupFonts([{ id: 'z', family: 'Z', group: 'weird', body: true }]).map((g) => g.group), ['weird'])
})

test('fontFaceCss names each face, tries the variable file then the 400 static file, and rejects odd ids', () => {
  const css = fontFaceCss([{ id: 'fraunces', family: 'Fraunces' }, { id: 'pacifico', family: 'Pacifico' }, { id: '../x', family: 'X' }])
  assert.match(css, /font-family:"studio-font-fraunces"/)
  assert.match(css, /url\(\/p\/fonts\/fraunces\.woff2\)[^;]*url\(\/p\/fonts\/fraunces-400\.woff2\)/)
  assert.doesNotMatch(css, /\.\.\//)
})

test('applyPalette fills the three colours and leaves the rest of the theme shape alone', () => {
  const pal = { id: 'sea', label: 'Sea', bg: '#001', ink: '#fff', accent: '#0af' }
  const t = { bg: '#ffffff', ink: '#000000', accent: '#e8622d' }
  assert.deepEqual(applyPalette(t, pal), { bg: '#001', ink: '#fff', accent: '#0af' })
  assert.deepEqual(t, { bg: '#ffffff', ink: '#000000', accent: '#e8622d' })
})

test('matchPalette finds the preset the colours still equal (case and #abc vs #aabbcc insensitive), else null', () => {
  const pals = [{ id: 'a', bg: '#f5f7f6', ink: '#0f2b29', accent: '#e8622d' }, { id: 'b', bg: '#fff', ink: '#000', accent: '#0af' }]
  assert.equal(matchPalette({ bg: '#F5F7F6', ink: '#0F2B29', accent: '#E8622D' }, pals), 'a')
  assert.equal(matchPalette({ bg: '#ffffff', ink: '#000000', accent: '#00aaff' }, pals), 'b')
  assert.equal(matchPalette({ bg: '#ffffff', ink: '#000000', accent: '#00aafe' }, pals), null)
})

test('slugProblem knows the reserved words including api and media', () => {
  assert.equal(slugProblem('creamy-corner'), null)
  assert.match(slugProblem(''), /Pick/)
  assert.match(slugProblem('A b'), /lowercase/)
  assert.match(slugProblem('x'), /2 to 40/)
  for (const r of ['assets', 'fonts', '404', 'index', 'api', 'media']) assert.match(slugProblem(r), /reserved/)
})

test('renameGate: disabled while dirty, no-op when unchanged, bad address explained, otherwise ok', () => {
  assert.deepEqual(renameGate({ from: 'a-cafe', to: 'a-cafe', dirty: false }), { ok: false, reason: '' })
  assert.match(renameGate({ from: 'a-cafe', to: 'b-cafe', dirty: true }).reason, /Save/)
  assert.match(renameGate({ from: 'a-cafe', to: 'Bad Name', dirty: false }).reason, /lowercase/)
  assert.match(renameGate({ from: 'a-cafe', to: 'api', dirty: false }).reason, /reserved/)
  assert.deepEqual(renameGate({ from: 'a-cafe', to: 'b-cafe', dirty: false }), { ok: true, reason: '' })
})

/* ---------------------------------------------------------------- preview CSP */
import { withPreviewCsp, PREVIEW_CSP } from '../studio/editor-model.js'

test('withPreviewCsp: meta is the first element of head and blocks scripts', () => {
  const out = withPreviewCsp('<!doctype html><html><head><meta charset="utf-8"><title>x</title></head><body></body></html>')
  assert.match(out, /<head><meta http-equiv="Content-Security-Policy" content="[^"]*"><meta charset/)
  assert.ok(out.includes("script-src 'none'"))
  assert.ok(out.includes("default-src 'none'"))
})
test('withPreviewCsp: allows exactly the two frame hosts', () => {
  const out = withPreviewCsp('<html><head></head></html>')
  const frame = /frame-src ([^;"]*)/.exec(out)[1].trim().split(/\s+/)
  assert.deepEqual(frame, ['https://www.youtube-nocookie.com', 'https://www.tiktok.com'])
  assert.equal(PREVIEW_CSP.includes('unsafe-eval'), false)
})
test('withPreviewCsp: works when head has attributes', () => {
  const out = withPreviewCsp('<html><HEAD lang="en" class="a"><title>x</title></HEAD></html>')
  assert.match(out, /<HEAD lang="en" class="a"><meta http-equiv="Content-Security-Policy"/)
  assert.equal(out.match(/Content-Security-Policy/g).length, 1)
})
test('withPreviewCsp: works with no head', () => {
  const noHtml = withPreviewCsp('<p>hi</p>')
  assert.ok(noHtml.startsWith('<head><meta http-equiv="Content-Security-Policy"'))
  const withHtml = withPreviewCsp('<html><body>hi</body></html>')
  assert.match(withHtml, /^<html><head><meta http-equiv="Content-Security-Policy"[^>]*><\/head><body>/)
})
test('withPreviewCsp: does not match <header> as head', () => {
  const out = withPreviewCsp('<html><body><header>x</header></body></html>')
  assert.ok(out.indexOf('Content-Security-Policy') < out.indexOf('<body>'))
})
