import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateClient, validateSite, LIMITS } from '../src/validate.js'
import { KINDS } from '../src/kinds.js'
import { OPTS, SITE, SITE_SUBPATH, rawClient } from './helpers.js'

const check = (overrides, opts = {}) => validateClient(rawClient(overrides), { ...OPTS, ...opts })
const hasError = (res, path) => res.errors.some((e) => e.startsWith(path))

test('a minimal valid client normalizes with defaults', () => {
  const res = check({})
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.deepEqual(res.errors, [])
  const c = res.client
  assert.equal(c.slug, 'sunrise-cafe')
  assert.equal(c.tagline, null)
  assert.deepEqual(c.font, { heading: 'fraunces', tagline: 'inter', body: 'inter' })
  assert.equal(c.logo, null)
  assert.equal(c.cover, null)
  assert.deepEqual(c.branches, [])
  assert.equal(c.credit, true)
  assert.equal(c.theme.bg, '#fff4e6')
  assert.equal(c.theme.ink, '#3b1f14')
  assert.equal('links' in c, false)
  assert.equal(c.blocks[0].label, KINDS.menu.label)
  assert.equal(c.blocks[1].kind, 'messenger')
  assert.ok(Array.isArray(res.warnings))
})

test('KINDS covers the v1 and v2 kinds with the right schemes and social flags', () => {
  const social = ['facebook', 'instagram', 'tiktok', 'messenger', 'phone', 'email', 'whatsapp', 'viber', 'youtube', 'shopee', 'lazada', 'x', 'linkedin', 'spotify']
  const plain = ['review', 'maps', 'menu', 'booking', 'order', 'website', 'custom']
  assert.deepEqual(Object.keys(KINDS).sort(), [...social, ...plain].sort())
  for (const k of [...social, ...plain]) {
    if (k !== 'custom') assert.ok(typeof KINDS[k].label === 'string' && KINDS[k].label.trim(), `${k} label`)
    const want = k === 'phone' ? 'tel:' : k === 'email' ? 'mailto:' : k === 'viber' ? 'viber:' : 'https:'
    assert.equal(KINDS[k].scheme, want, k)
    assert.equal(KINDS[k].social, social.includes(k), `${k} social flag`)
  }
  assert.equal(KINDS.whatsapp.label, 'Chat on WhatsApp')
  assert.equal(KINDS.viber.label, 'Message on Viber')
  assert.equal(KINDS.youtube.label, 'YouTube')
  assert.equal(KINDS.shopee.label, 'Shop on Shopee')
  assert.equal(KINDS.lazada.label, 'Shop on Lazada')
  assert.equal(KINDS.x.label, 'X')
  assert.equal(KINDS.linkedin.label, 'LinkedIn')
  assert.equal(KINDS.spotify.label, 'Spotify')
})

test('LIMITS is exported exactly as specified', () => {
  assert.deepEqual(LIMITS, { blocks: 30, links: 20, videos: 3, socials: 2, socialItems: 8, heading: 60, text: 280, label: 40, branches: 6, branchName: 40, branchAddress: 80, branchHours: 40 })
})

test('all errors are collected, each prefixed with its field path', () => {
  const res = check({ slug: 'Bad Slug', name: '', look: 'nope', blocks: [] })
  assert.equal(res.ok, false)
  for (const p of ['slug', 'name', 'look', 'blocks']) assert.ok(hasError(res, p), `missing ${p} in ${res.errors}`)
})

test('unknown top-level keys are rejected (typo guard)', () => {
  const res = check({ colour: '#fff' })
  assert.equal(res.ok, false)
  assert.ok(hasError(res, 'colour'))
})

test('slug rules', () => {
  for (const bad of ['Bad_Slug', 'a', 'x'.repeat(41), '-lead', 'trail-', 'double--dash', 'fonts', 'assets', '404', 'index', 'api', 'media']) {
    assert.ok(hasError(check({ slug: bad }, { folder: bad }), 'slug'), `slug ${bad} should fail`)
  }
  assert.ok(hasError(check({ slug: 'other-name' }), 'slug'), 'slug must match folder')
  assert.equal(check({ slug: 'ab' }, { folder: 'ab' }).ok, true)
})

test('name is trimmed, required and capped', () => {
  assert.equal(check({ name: '  Sunrise  ' }).client.name, 'Sunrise')
  assert.ok(hasError(check({ name: '   ' }), 'name'))
  assert.ok(hasError(check({ name: 'x'.repeat(61) }), 'name'))
  assert.ok(hasError(check({ tagline: 'x'.repeat(121) }), 'tagline'))
})

test('ink under 4.5:1 on bg is a warning, not an error (boundary)', () => {
  const t = (ink) => check({ theme: { bg: '#ffffff', ink, accent: '#000000' } })
  const low = t('#777777')
  assert.equal(low.ok, true, 'contrast must not block: ' + low.errors.join('\n'))
  assert.deepEqual(low.errors, [])
  assert.ok(low.warnings.includes('theme.ink: contrast against bg is 4.48:1, 4.5:1 recommended for body text'), low.warnings.join('\n'))
  const fine = t('#767676')
  assert.equal(fine.ok, true)
  assert.ok(!fine.warnings.some((w) => w.startsWith('theme.ink')), '#767676 on white is 4.54, no warning')
})

test('a clean theme has no warnings', () => {
  const res = check({ theme: { bg: '#ffffff', ink: '#111111', accent: '#1c4d4a' } })
  assert.equal(res.ok, true)
  assert.deepEqual(res.warnings, [])
})

test('onAccent picks whichever of ink / bg contrasts more with the accent', () => {
  const res = check({ theme: { bg: '#ffffff', ink: '#111111', accent: '#e8622d' } })
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.equal(res.client.theme.onAccent, '#111111')
  const dark = check({ theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#e8622d' } })
  assert.equal(dark.ok, true, dark.errors.join('\n'))
  assert.equal(dark.client.theme.onAccent, '#f5f7f6')
})

test('an accent that is weak against both ink and bg warns twice and still passes', () => {
  // white / #6b6b6b passes 4.5, but #ababab sits ~2.3:1 from both.
  const res = check({ theme: { bg: '#ffffff', ink: '#6b6b6b', accent: '#ababab' } })
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.ok(res.warnings.some((w) => /^theme\.accent: best text contrast on accent is \d+\.\d\d:1, 3:1 recommended for button text$/.test(w)), res.warnings.join('\n'))
  assert.ok(res.warnings.some((w) => /^theme\.accent: accent against bg is \d+\.\d\d:1, 3:1 recommended so buttons stand out$/.test(w)), res.warnings.join('\n'))
})

test('an accent that blends into the bg warns even when text on it is readable', () => {
  const res = check({ theme: { bg: '#ffffff', ink: '#111111', accent: '#ffe066' } })
  assert.equal(res.ok, true)
  assert.deepEqual(res.warnings.map((w) => w.split(' is ')[0]), ['theme.accent: accent against bg'])
})

test('warnings come back even when validation fails', () => {
  const res = check({ name: '', theme: { bg: '#ffffff', ink: '#777777', accent: '#000000' } })
  assert.equal(res.ok, false)
  assert.ok(Array.isArray(res.warnings))
  assert.ok(res.warnings.some((w) => w.startsWith('theme.ink')))
})

test('bad or missing theme colours are rejected', () => {
  assert.ok(hasError(check({ theme: { bg: 'white', ink: '#000', accent: '#f00' } }), 'theme.bg'))
  assert.ok(hasError(check({ theme: { bg: '#fff', ink: '#000' } }), 'theme.accent'))
  assert.ok(hasError(check({ theme: undefined }), 'theme'))
})

test('fonts must exist in the registry', () => {
  assert.ok(hasError(check({ font: { heading: 'comic-sans' } }), 'font.heading'))
  assert.ok(hasError(check({ font: { tagline: 'comic-sans' } }), 'font.tagline'))
  assert.ok(hasError(check({ font: { body: 'comic-sans' } }), 'font.body'))
  const mono = check({ font: { heading: 'mono' } })
  assert.equal(mono.ok, true, mono.errors.join('\n'))
  assert.deepEqual(mono.client.font, { heading: 'mono', tagline: 'inter', body: 'inter' })
})

test('body font must be body:true (bodyFonts), heading and tagline may use any font', () => {
  const opts = { bodyFonts: ['inter'] }
  assert.ok(hasError(check({ font: { body: 'mono' } }, opts), 'font.body'))
  assert.equal(check({ font: { body: 'inter' } }, opts).ok, true)
  assert.equal(check({ font: { heading: 'mono', tagline: 'mono' } }, opts).ok, true)
})

test('tagline font defaults to the resolved body font', () => {
  const res = check({ font: { body: 'mono' } })
  assert.deepEqual(res.client.font, { heading: 'fraunces', tagline: 'mono', body: 'mono' })
  assert.deepEqual(check({ font: { body: 'mono', tagline: 'fraunces' } }).client.font, { heading: 'fraunces', tagline: 'fraunces', body: 'mono' })
})

test('logo / cover file names are checked for shape, traversal and presence', () => {
  for (const bad of ['../logo.svg', 'logo.gif', '.hidden.svg', 'a/b.svg', 'missing.svg']) {
    assert.ok(hasError(check({ logo: bad }), 'logo'), `logo ${bad} should fail`)
  }
  assert.equal(check({ logo: 'logo.svg', cover: 'cover.jpg' }).ok, true)
})

const blk = (blocks, opts) => check({ blocks }, opts)
const link = (kind, url, extra = {}) => ({ type: 'link', kind, url, ...extra })
const YT = 'https://youtu.be/dQw4w9WgXcQ'

test('blocks: 1..30 items, an array of objects', () => {
  assert.ok(hasError(blk([]), 'blocks'))
  assert.ok(hasError(check({ blocks: 'nope' }), 'blocks'))
  assert.ok(hasError(check({ blocks: undefined }), 'blocks'))
  const heading = (i) => ({ type: 'heading', text: `H${i}` })
  assert.equal(blk(Array.from({ length: 30 }, (_, i) => heading(i))).ok, true)
  assert.ok(hasError(blk(Array.from({ length: 31 }, (_, i) => heading(i))), 'blocks'))
  assert.ok(hasError(blk(['nope']), 'blocks[0]'))
  assert.ok(hasError(blk([null]), 'blocks[0]'))
})

test('blocks: unknown type and unknown keys have exact paths', () => {
  assert.ok(hasError(blk([{ type: 'carousel' }]), 'blocks[0].type'))
  assert.ok(hasError(blk([{ text: 'no type' }]), 'blocks[0].type'))
  assert.ok(check({ blocks: [{ type: 'heading', text: 'Hi', colour: 'red' }] }).errors.includes('blocks[0].colour: unknown key'))
  assert.ok(check({ blocks: [{ type: 'heading', text: 'Hi' }, link('menu', 'https://x.co', { primary: true })] }).errors.includes('blocks[1].primary: unknown key'))
  assert.ok(check({ blocks: [{ type: 'video', url: YT, src: 'https://evil.example' }] }).errors.includes('blocks[0].src: unknown key'))
})

test('blocks: errors point at the right index', () => {
  const res = blk([{ type: 'heading', text: 'ok' }, link('menu', 'https://x.co'), link('website', 'http://nope.example')])
  assert.ok(hasError(res, 'blocks[2].url'))
  assert.ok(!hasError(res, 'blocks[0]') && !hasError(res, 'blocks[1]'))
})

test('link: zero link blocks is fine', () => {
  const res = blk([{ type: 'heading', text: 'Hello' }])
  assert.equal(res.ok, true, res.errors.join('\n'))
})

test('link: unknown kinds; a v1 links array is accepted through migration', () => {
  assert.ok(hasError(blk([link('myspace', 'https://x.com')]), 'blocks[0].kind'))
  const v1 = check({ blocks: undefined, links: [{ kind: 'menu', url: 'https://x.co' }] })
  assert.equal(v1.ok, true, v1.errors.join('\n'))
  assert.equal(v1.client.blocks[0].kind, 'menu')
})

test('link: url scheme must match the kind', () => {
  const one = (kind, url) => blk([link(kind, url)])
  assert.ok(hasError(one('website', 'javascript:alert(1)'), 'blocks[0].url'))
  assert.ok(hasError(one('website', 'http://example.com'), 'blocks[0].url'))
  assert.ok(hasError(one('website', 'data:text/html,hi'), 'blocks[0].url'))
  assert.ok(hasError(one('website', 'https://exa mple.com'), 'blocks[0].url'))
  assert.ok(hasError(one('website', 'not a url'), 'blocks[0].url'))
  assert.ok(hasError(one('phone', 'https://example.com'), 'blocks[0].url'))
  assert.ok(hasError(one('email', 'tel:+639171234567'), 'blocks[0].url'))
  assert.equal(one('phone', 'tel:+639171234567').ok, true)
  assert.equal(one('email', 'mailto:hello@example.com').ok, true)
})

test('link: viber needs the viber: scheme', () => {
  assert.equal(blk([link('viber', 'viber://chat?number=%2B639171234567')]).ok, true)
  assert.ok(hasError(blk([link('viber', 'https://example.com/viber')]), 'blocks[0].url'))
  assert.ok(hasError(blk([link('whatsapp', 'viber://chat?number=%2B639171234567')]), 'blocks[0].url'))
  assert.equal(blk([link('whatsapp', 'https://wa.me/639171234567')]).ok, true)
})

test('link: every https kind accepts any https host (no per-kind host checks)', () => {
  for (const k of ['youtube', 'shopee', 'lazada', 'x', 'linkedin', 'spotify']) assert.equal(blk([link(k, 'https://example.com/anything')]).ok, true, k)
})

test('link: custom needs a label, other kinds default it', () => {
  assert.ok(hasError(blk([link('custom', 'https://example.com')]), 'blocks[0].label'))
  assert.ok(hasError(blk([link('custom', 'https://example.com', { label: '' })]), 'blocks[0].label'))
  const ok = blk([link('custom', 'https://example.com', { label: 'Our story' })])
  assert.equal(ok.ok, true, ok.errors.join('\n'))
  assert.deepEqual(ok.client.blocks[0], { type: 'link', kind: 'custom', url: 'https://example.com', label: 'Our story', primary: true })
})

test('link: label default, override and cap; order kept', () => {
  const res = blk([link('review', 'https://g.page/r/x', { label: 'Rate us' }), link('maps', 'https://maps.app.goo.gl/x')])
  assert.equal(res.client.blocks[0].label, 'Rate us')
  assert.equal(res.client.blocks[1].label, KINDS.maps.label)
  assert.deepEqual(res.client.blocks.map((b) => b.kind), ['review', 'maps'])
  assert.ok(hasError(blk([link('menu', 'https://x.com', { label: 'x'.repeat(41) })]), 'blocks[0].label'))
  assert.equal(blk([link('menu', 'https://x.com', { label: 'x'.repeat(40) })]).ok, true)
})

test('link: primary is true on the FIRST link block only, whatever comes before it', () => {
  const res = blk([{ type: 'heading', text: 'Hi' }, link('menu', 'https://x.co/a'), { type: 'text', text: 'between' }, link('website', 'https://x.co/b')])
  assert.equal(res.ok, true, res.errors.join('\n'))
  const links = res.client.blocks.filter((b) => b.type === 'link')
  assert.deepEqual(links.map((b) => b.primary), [true, false])
})

test('heading: required, trimmed, 1..60, no newline', () => {
  const h = (text) => blk([{ type: 'heading', text }])
  assert.equal(h('  Our menu  ').client.blocks[0].text, 'Our menu')
  assert.deepEqual(h('Our menu').client.blocks[0], { type: 'heading', text: 'Our menu' })
  assert.ok(hasError(h(''), 'blocks[0].text'))
  assert.ok(hasError(h('   '), 'blocks[0].text'))
  assert.ok(hasError(h(undefined), 'blocks[0].text'))
  assert.ok(hasError(h(42), 'blocks[0].text'))
  assert.ok(hasError(h('x'.repeat(61)), 'blocks[0].text'))
  assert.equal(h('x'.repeat(60)).ok, true)
  assert.ok(hasError(h('two\nlines'), 'blocks[0].text'))
})

test('text: trimmed, 1..280, \\r\\n becomes \\n, at most 4 newlines', () => {
  const t = (text) => blk([{ type: 'text', text }])
  assert.deepEqual(t('  hello  ').client.blocks[0], { type: 'text', text: 'hello' })
  assert.equal(t('a\r\nb').client.blocks[0].text, 'a\nb')
  assert.ok(hasError(t(''), 'blocks[0].text'))
  assert.ok(hasError(t(' \n '), 'blocks[0].text'))
  assert.ok(hasError(t(7), 'blocks[0].text'))
  assert.equal(t('x'.repeat(280)).ok, true)
  assert.ok(hasError(t('x'.repeat(281)), 'blocks[0].text'))
  assert.equal(t('1\n2\n3\n4\n5').ok, true, 'four newlines')
  assert.ok(hasError(t('1\n2\n3\n4\n5\n6'), 'blocks[0].text'), 'five newlines')
  assert.equal(t('1\r\n2\r\n3\r\n4\r\n5').ok, true, 'CRLF counts as one newline')
})

test('text and headings may contain < and & (escaped at render, never rejected)', () => {
  const res = blk([{ type: 'heading', text: 'Tom & Jerry <3' }, { type: 'text', text: '<script>alert(1)</script> & "quotes"' }])
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.equal(res.client.blocks[0].text, 'Tom & Jerry <3')
  assert.equal(res.client.blocks[1].text, '<script>alert(1)</script> & "quotes"')
})

test('socials: 1..8 icon items, each kind must be social, urls follow the kind scheme', () => {
  const items = (n) => Array.from({ length: n }, () => ({ kind: 'facebook', url: 'https://facebook.com/x' }))
  assert.ok(hasError(blk([{ type: 'socials', items: [] }]), 'blocks[0].items'))
  assert.ok(hasError(blk([{ type: 'socials' }]), 'blocks[0].items'))
  assert.equal(blk([{ type: 'socials', items: items(8) }]).ok, true)
  assert.ok(hasError(blk([{ type: 'socials', items: items(9) }]), 'blocks[0].items'))
  const mixed = blk([{ type: 'socials', items: [{ kind: 'facebook', url: 'https://facebook.com/x' }, { kind: 'website', url: 'https://example.com' }] }])
  assert.ok(hasError(mixed, 'blocks[0].items[1].kind'), mixed.errors.join('\n'))
  assert.ok(hasError(blk([{ type: 'socials', items: [{ kind: 'custom', url: 'https://example.com', label: 'x' }] }]), 'blocks[0].items[0].kind'))
  assert.ok(hasError(blk([{ type: 'socials', items: [{ kind: 'phone', url: 'https://example.com' }] }]), 'blocks[0].items[0].url'))
})

test('socials: normalized items carry the kind label', () => {
  const res = blk([{ type: 'socials', items: [{ kind: 'instagram', url: 'https://instagram.com/x' }, { kind: 'viber', url: 'viber://chat?number=%2B639171234567' }, { kind: 'phone', url: 'tel:+639171234567' }] }])
  assert.equal(res.ok, true, res.errors.join('\n'))
  assert.deepEqual(res.client.blocks[0], {
    type: 'socials',
    items: [
      { kind: 'instagram', url: 'https://instagram.com/x', label: KINDS.instagram.label },
      { kind: 'viber', url: 'viber://chat?number=%2B639171234567', label: 'Message on Viber' },
      { kind: 'phone', url: 'tel:+639171234567', label: KINDS.phone.label },
    ],
  })
})

test('video: normalized with provider, id, vertical and src built from the id', () => {
  const res = blk([{ type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=9' }, { type: 'video', url: 'https://www.tiktok.com/@a/video/7234567890123456789' }, { type: 'video', url: 'https://youtube.com/shorts/dQw4w9WgXcQ' }])
  assert.equal(res.ok, true, res.errors.join('\n'))
  const [yt, tt, shorts] = res.client.blocks
  assert.deepEqual({ ...yt, url: undefined }, { type: 'video', url: undefined, provider: 'youtube', id: 'dQw4w9WgXcQ', vertical: false, src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' })
  assert.equal(yt.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=9')
  assert.deepEqual({ provider: tt.provider, id: tt.id, vertical: tt.vertical, src: tt.src }, { provider: 'tiktok', id: '7234567890123456789', vertical: true, src: 'https://www.tiktok.com/player/v1/7234567890123456789' })
  assert.equal(shorts.vertical, true)
})

test('video: bad links get the exact error strings with the block index', () => {
  const v = (url) => blk([{ type: 'heading', text: 'x' }, { type: 'video', url }])
  assert.ok(v('https://vimeo.com/123').errors.includes('blocks[1].url: must be a YouTube or TikTok video link'))
  assert.ok(v('http://youtu.be/dQw4w9WgXcQ').errors.includes('blocks[1].url: must be a YouTube or TikTok video link'))
  assert.ok(v('https://vm.tiktok.com/ZMabc/').errors.includes('blocks[1].url: short TikTok link, open it and copy the full address'))
  assert.ok(hasError(blk([{ type: 'video' }]), 'blocks[0].url'))
})

test('limits: at most 20 links, 3 videos and 2 socials blocks', () => {
  const links = (n) => Array.from({ length: n }, (_, i) => link('website', `https://example.com/${i}`))
  const videos = (n) => Array.from({ length: n }, () => ({ type: 'video', url: YT }))
  const socials = (n) => Array.from({ length: n }, () => ({ type: 'socials', items: [{ kind: 'facebook', url: 'https://facebook.com/x' }] }))
  assert.equal(blk(links(20)).ok, true)
  assert.ok(hasError(blk(links(21)), 'blocks'))
  assert.equal(blk(videos(3)).ok, true)
  assert.ok(hasError(blk(videos(4)), 'blocks'))
  assert.equal(blk(socials(2)).ok, true)
  assert.ok(hasError(blk(socials(3)), 'blocks'))
})

test('branches: name required, maps must be https, missing fields become null', () => {
  assert.ok(hasError(check({ branches: [{ address: 'Somewhere' }] }), 'branches[0].name'))
  assert.ok(hasError(check({ branches: [{ name: 'A', maps: 'http://maps.example.com' }] }), 'branches[0].maps'))
  const res = check({ branches: [{ name: 'Branch 1' }] })
  assert.deepEqual(res.client.branches, [{ name: 'Branch 1', address: null, maps: null, hours: null }])
})

test('credit must be boolean', () => {
  assert.ok(hasError(check({ credit: 'yes' }), 'credit'))
  assert.equal(check({ credit: false }).client.credit, false)
})

test('validateSite', () => {
  assert.equal(validateSite(SITE).ok, true)
  assert.equal(validateSite(SITE_SUBPATH).ok, true)
  assert.equal(validateSite({ ...SITE, origin: 'https://tap.khybrio.com/' }).ok, false)
  assert.equal(validateSite({ ...SITE, origin: 'http://tap.khybrio.com' }).ok, false)
  assert.equal(validateSite({ ...SITE, base: 'tap/' }).ok, false)
  assert.equal(validateSite({ ...SITE, base: '/tap' }).ok, false)
  assert.equal(validateSite({ ...SITE, mainSite: 'http://khybrio.com/' }).ok, false)
})

test('validateSite: base is a plain path, nothing that can break out of CSS url()', () => {
  for (const bad of ['//', '/a)b/', '/a;b/', '/a b/', '/</style>/', '/a//b/']) {
    assert.equal(validateSite({ ...SITE, base: bad }).ok, false, `base ${bad} should fail`)
  }
  assert.equal(validateSite({ ...SITE, base: '/khybrio-tap/' }).ok, true)
  assert.equal(validateSite({ ...SITE, base: '/a/b-c/' }).ok, true)
})
