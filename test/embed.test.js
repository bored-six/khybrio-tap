// Video embeds, written from section 5 of .claude/specs/mvp-showcase.md before the code existed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVideo, videoEmbed } from '../src/embed.js'
import { esc } from '../src/html.js'

const YT = 'dQw4w9WgXcQ' // 11 chars
const TT = '7234567890123456789'

const ok = (url, provider, id, vertical) => assert.deepEqual(parseVideo(url), { provider, id, vertical }, url)
const WRONG = /must be a YouTube or TikTok video link/
const SHORT = /short TikTok link, open it and copy the full address/

test('YouTube watch / embed / live on every accepted host', () => {
  for (const host of ['youtube.com', 'www.youtube.com', 'm.youtube.com']) {
    ok(`https://${host}/watch?v=${YT}`, 'youtube', YT, false)
    ok(`https://${host}/embed/${YT}`, 'youtube', YT, false)
    ok(`https://${host}/live/${YT}`, 'youtube', YT, false)
  }
  ok(`https://youtu.be/${YT}`, 'youtube', YT, false)
})

test('YouTube extra query parameters do not change the id', () => {
  ok(`https://www.youtube.com/watch?v=${YT}&t=42s&list=abc`, 'youtube', YT, false)
  ok(`https://www.youtube.com/watch?feature=share&v=${YT}`, 'youtube', YT, false)
  ok(`https://youtu.be/${YT}?si=xyz`, 'youtube', YT, false)
})

test('YouTube shorts are vertical', () => {
  for (const host of ['youtube.com', 'www.youtube.com', 'm.youtube.com']) ok(`https://${host}/shorts/${YT}`, 'youtube', YT, true)
})

test('TikTok full links are vertical on every accepted host and path', () => {
  for (const host of ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']) {
    ok(`https://${host}/@some.handle/video/${TT}`, 'tiktok', TT, true)
    ok(`https://${host}/embed/v2/${TT}`, 'tiktok', TT, true)
    ok(`https://${host}/player/v1/${TT}`, 'tiktok', TT, true)
  }
  ok(`https://www.tiktok.com/@a_b-c/video/${TT}?is_from_webapp=1`, 'tiktok', TT, true)
})

test('short TikTok links get their own error', () => {
  for (const url of ['https://vm.tiktok.com/ZMabc123/', 'https://vt.tiktok.com/ZSxyz/', 'https://vm.tiktok.com/x']) {
    const r = parseVideo(url)
    assert.equal(typeof r.error, 'string', url)
    assert.match(r.error, SHORT, url)
    assert.equal('provider' in r, false)
  }
})

test('http, other hosts, lookalike hosts and junk are rejected', () => {
  const bad = [
    `http://www.youtube.com/watch?v=${YT}`,
    `http://youtu.be/${YT}`,
    `http://www.tiktok.com/@a/video/${TT}`,
    `https://vimeo.com/${TT}`,
    `https://evilyoutube.com/watch?v=${YT}`,
    `https://youtube.com.evil.example/watch?v=${YT}`,
    `https://www.youtube.com.evil.example/embed/${YT}`,
    `https://eviltiktok.com/@a/video/${TT}`,
    `https://tiktok.com.evil.example/@a/video/${TT}`,
    'https://www.youtube.com/',
    'https://www.youtube.com/watch',
    `https://www.youtube.com/playlist?list=${YT}`,
    'https://www.tiktok.com/@someone',
    `javascript:alert(1)//youtube.com/watch?v=${YT}`,
    'not a url',
    '',
  ]
  for (const url of bad) {
    const r = parseVideo(url)
    assert.equal(typeof r.error, 'string', `${url} should error`)
    assert.match(r.error, WRONG, url)
    assert.equal('provider' in r, false, url)
  }
  assert.equal(typeof parseVideo(undefined).error, 'string')
  assert.equal(typeof parseVideo(42).error, 'string')
})

test('YouTube id must be exactly 11 of [A-Za-z0-9_-]', () => {
  ok('https://youtu.be/abcDEF_-123', 'youtube', 'abcDEF_-123', false)
  for (const id of ['abcDEF_-12', 'abcDEF_-1234', 'abcDEF_-12!', 'abc DEF_123', '']) {
    assert.match(parseVideo(`https://www.youtube.com/watch?v=${id}`).error ?? '', WRONG, `10/12/bad id "${id}" on watch`)
    assert.match(parseVideo(`https://youtu.be/${id}`).error ?? '', WRONG, `10/12/bad id "${id}" on youtu.be`)
  }
})

test('TikTok id is 8..25 digits', () => {
  ok('https://www.tiktok.com/@a/video/12345678', 'tiktok', '12345678', true)
  ok(`https://www.tiktok.com/@a/video/${'9'.repeat(25)}`, 'tiktok', '9'.repeat(25), true)
  for (const id of ['1234567', '9'.repeat(26), '12345abc678', '']) {
    assert.match(parseVideo(`https://www.tiktok.com/@a/video/${id}`).error ?? '', WRONG, id)
  }
})

// ---- videoEmbed ----------------------------------------------------------------------------

const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation'
const ALLOW = 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen'
const iframe = (src, title, w, h) =>
  `<iframe src="${src}" title="${title}" width="${w}" height="${h}" loading="lazy" allow="${ALLOW}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="${SANDBOX}"></iframe>`

const ytBlock = (extra = {}) => ({
  type: 'video',
  url: `https://www.youtube.com/watch?v=${YT}`,
  provider: 'youtube',
  id: YT,
  vertical: false,
  src: `https://www.youtube-nocookie.com/embed/${YT}`,
  ...extra,
})
const ttBlock = (extra = {}) => ({
  type: 'video',
  url: `https://www.tiktok.com/@a/video/${TT}`,
  provider: 'tiktok',
  id: TT,
  vertical: true,
  src: `https://www.tiktok.com/player/v1/${TT}`,
  ...extra,
})

test('YouTube iframe: exact markup, 560x315, nocookie src', () => {
  assert.equal(videoEmbed(ytBlock(), 'Creamy'), iframe(`https://www.youtube-nocookie.com/embed/${YT}`, 'Creamy video', 560, 315))
})

test('vertical video uses 325x578; TikTok src is the player URL', () => {
  assert.equal(videoEmbed(ttBlock(), 'Creamy'), iframe(`https://www.tiktok.com/player/v1/${TT}`, 'Creamy video', 325, 578))
  const shorts = videoEmbed(ytBlock({ vertical: true }), 'Creamy')
  assert.match(shorts, /width="325" height="578"/)
})

test('src comes from the id, never from the user url', () => {
  const nasty = `https://www.youtube.com/watch?v=${YT}&autoplay=1&x="onload="alert(1)`
  const html = videoEmbed(ytBlock({ url: nasty }), 'Creamy')
  assert.match(html, new RegExp(`src="https://www\\.youtube-nocookie\\.com/embed/${YT}"`))
  assert.ok(!html.includes('autoplay'))
  assert.ok(!html.includes('onload'))
  assert.ok(!html.includes('watch?v='))
})

test('the page name in the title is escaped', () => {
  const html = videoEmbed(ytBlock(), `<b>"Cafe" & Co</b>`)
  assert.ok(html.includes(`title="${esc('<b>"Cafe" & Co</b>')} video"`), html)
  assert.ok(!html.includes('<b>'))
})

test('no script tag, no style attribute, keeps the referrer policy YouTube needs', () => {
  for (const html of [videoEmbed(ytBlock(), 'X'), videoEmbed(ttBlock(), 'X')]) {
    assert.ok(!/<script/i.test(html))
    assert.ok(!/\sstyle=/i.test(html))
    assert.match(html, /referrerpolicy="strict-origin-when-cross-origin"/)
    assert.match(html, /loading="lazy"/)
    assert.match(html, /\sallowfullscreen\s/)
    assert.equal((html.match(/<iframe/g) || []).length, 1)
    assert.ok(html.endsWith('></iframe>'))
  }
})
