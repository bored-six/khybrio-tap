// Adversarial: src/embed.js parseVideo / videoEmbed (spec section 5).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVideo, videoEmbed, embedSrc } from '../src/embed.js'

const YT = 'dQw4w9WgXcQ'
const TT = '7234567890123456789'
const WRONG = 'must be a YouTube or TikTok video link'
const rejects = (u) => {
  const r = parseVideo(u)
  assert.ok(r && typeof r.error === 'string', `${JSON.stringify(u)} accepted: ${JSON.stringify(r)}`)
  return r
}

test('hostile schemes and shapes are rejected', () => {
  for (const u of [
    `javascript:alert(1)//youtube.com/watch?v=${YT}`, `data:text/html,<script>1</script>`, `JAVASCRIPT:alert(1)`, `file:///etc/passwd`, `ftp://youtube.com/watch?v=${YT}`,
    `http://www.youtube.com/watch?v=${YT}`, `HTTP://youtu.be/${YT}`, `//youtube.com/watch?v=${YT}`, `youtube.com/watch?v=${YT}`, `www.youtube.com/watch?v=${YT}`,
    '', ' ', 'https://', 'https:///', 'not a url', null, undefined, 42, {}, [], true, ['https://youtu.be/' + YT],
  ]) rejects(u)
})

test('look-alike and suffix hosts are rejected', () => {
  for (const h of [
    'youtube.com.evil.com', 'evil.com/youtube.com', 'notyoutube.com', 'youtube.com.', 'youtube.co', 'youtu.be.evil.com', 'xyoutu.be', 'evilyoutu.be', 'www.youtube.com.evil.io',
    'youtube-nocookie.com', 'www.youtube-nocookie.com', 'music.youtube.com', 'studio.youtube.com', 'a.www.youtube.com', 'tiktok.com.evil.com', 'nottiktok.com', 'www.tiktok.com.evil.com',
    'youtube.com%2eevil.com', 'xn--youtube-9t4a.com',
  ]) {
    rejects(`https://${h}/watch?v=${YT}`)
    rejects(`https://${h}/${YT}`)
    rejects(`https://${h}/@a/video/${TT}`)
    rejects(`https://${h}/embed/${YT}`)
  }
  rejects(`https://evil.com/youtube.com/watch?v=${YT}`)
  rejects(`https://evil.com/?u=https://youtu.be/${YT}`)
  rejects(`https://evil.com/#https://youtu.be/${YT}`)
})

test('userinfo, ports, backslash and newline tricks are rejected', () => {
  for (const u of [
    `https://youtube.com@evil.com/watch?v=${YT}`, `https://www.youtube.com@evil.com/watch?v=${YT}`, `https://evil.com@youtube.com/watch?v=${YT}`, `https://user:pw@www.youtube.com/watch?v=${YT}`, `https://youtu.be@evil.com/${YT}`,
    `https://www.youtube.com:8443/watch?v=${YT}`, `https://youtu.be:444/${YT}`, `https://www.tiktok.com:8080/@a/video/${TT}`,
    `https://evil.com\\@youtube.com/watch?v=${YT}`, `https://youtube.com\\.evil.com/watch?v=${YT}`,
    `https://www.youtube.com/watch?v=${YT}\n`, `https://www.youtube.com/watch?v=${YT}\r\nHost: evil`, `https://www.youtube.com/watch?v=${YT} onload=x`, `https://www.youtube.com/watch?v=${YT}\u0000`, `\thttps://youtu.be/${YT}`, `https://youtu.be/${YT} `,
  ]) rejects(u)
})

test('default port 443 and mixed-case hosts are fine and yield the right id', () => {
  for (const u of [`https://WWW.YouTube.COM/watch?v=${YT}`, `https://YouTu.Be/${YT}`, `https://www.youtube.com:443/watch?v=${YT}`, `HTTPS://m.youtube.com/watch?v=${YT}`]) {
    assert.deepEqual(parseVideo(u), { provider: 'youtube', id: YT, vertical: false }, u)
  }
  assert.deepEqual(parseVideo(`https://WWW.TIKTOK.com/@Some.User/video/${TT}`), { provider: 'tiktok', id: TT, vertical: true })
})

test('YouTube ids: exactly 11 of [A-Za-z0-9_-]; 10, 12, extra chars, encoded chars all rejected', () => {
  const ok = ['abcdefghijk', 'ABCDEFGHIJK', '-_-_-_-_-_-', '01234567890']
  for (const id of ok) assert.equal(parseVideo(`https://youtu.be/${id}`).id, id)
  for (const id of ['abcdefghij', 'abcdefghijkl', 'abcdefghi.k', 'abcdefghi k', 'abcdefghi%20', 'abcdefgh<>k', 'abcdefghij"', "abcdefghij'", 'abcdefghij;', 'abcdefghijé', 'abcdefghij%', '', '..', '.', '%2e%2e']) {
    rejects(`https://youtu.be/${id}`)
    rejects(`https://www.youtube.com/watch?v=${id}`)
    rejects(`https://www.youtube.com/embed/${id}`)
    rejects(`https://www.youtube.com/shorts/${id}`)
    rejects(`https://www.youtube.com/live/${id}`)
  }
})

test('youtube v= edge cases: missing, empty, repeated, wrong param name', () => {
  rejects('https://www.youtube.com/watch')
  rejects('https://www.youtube.com/watch?v=')
  rejects(`https://www.youtube.com/watch?x=${YT}`)
  rejects(`https://www.youtube.com/watch?V=${YT}`)
  rejects(`https://www.youtube.com/watch/?v=${YT}`)
  rejects(`https://www.youtube.com/watch?v=short&v=${YT}`) // first v wins in URLSearchParams: 'short' is bad
  assert.equal(parseVideo(`https://www.youtube.com/watch?v=${YT}&list=PL1&t=30s`).id, YT)
  assert.equal(parseVideo(`https://www.youtube.com/watch?v=${YT}&v=zzzzzzzzzzz`).id, YT)
})

test('youtube path variants: extra segments, trailing slash, wrong prefix', () => {
  for (const u of [
    `https://youtu.be/${YT}/extra`, `https://youtu.be/`, `https://youtu.be`, `https://www.youtube.com/embed/${YT}/x`, `https://www.youtube.com/embed/`, `https://www.youtube.com/shorts/`, `https://www.youtube.com/v/${YT}`,
    `https://www.youtube.com/user/${YT}`, `https://www.youtube.com/@${YT}`, `https://www.youtube.com/`, `https://www.youtube.com/playlist?list=${YT}`, `https://www.youtube.com//watch?v=${YT}`, `https://www.youtube.com/embed//${YT}`,
    `https://www.youtube.com/Watch?v=${YT}`, `https://www.youtube.com/EMBED/${YT}`,
  ]) rejects(u)
  assert.deepEqual(parseVideo(`https://www.youtube.com/shorts/${YT}?feature=share`), { provider: 'youtube', id: YT, vertical: true })
  assert.deepEqual(parseVideo(`https://www.youtube.com/live/${YT}`), { provider: 'youtube', id: YT, vertical: false })
})

test('TikTok ids: 8..25 digits only; 7, 26, letters, signs, decimals rejected', () => {
  for (const n of [8, 12, 19, 25]) assert.equal(parseVideo(`https://www.tiktok.com/@u/video/${'1'.repeat(n)}`).id, '1'.repeat(n))
  for (const id of ['1234567', '1'.repeat(26), '1234567a', 'a12345678', '-12345678', '+12345678', '12345678.9', '1234 5678', '1e1234567', '0x123456789', '１２３４５６７８９']) {
    rejects(`https://www.tiktok.com/@u/video/${id}`)
    rejects(`https://www.tiktok.com/embed/v2/${id}`)
    rejects(`https://www.tiktok.com/player/v1/${id}`)
  }
})

test('TikTok shape variants and short-link errors', () => {
  assert.equal(parseVideo(`https://tiktok.com/embed/v2/${TT}`).provider, 'tiktok')
  assert.equal(parseVideo(`https://m.tiktok.com/player/v1/${TT}`).vertical, true)
  for (const u of [`https://www.tiktok.com/@u/video/${TT}/x`, `https://www.tiktok.com/@/video/${TT}`, `https://www.tiktok.com/u/video/${TT}`, `https://www.tiktok.com/@u/photo/${TT}`, `https://www.tiktok.com/embed/v1/${TT}`, `https://www.tiktok.com/player/v2/${TT}`, `https://www.tiktok.com/`, `https://www.tiktok.com/${TT}`, `https://www.tiktok.com/@u/video/`]) rejects(u)
  for (const u of ['https://vm.tiktok.com/ZMabc/', 'https://vt.tiktok.com/ZSabc', 'https://VM.TIKTOK.COM/x', `https://vm.tiktok.com/@u/video/${TT}`]) {
    assert.match(parseVideo(u).error, /short TikTok link/, u)
  }
  assert.equal(parseVideo('http://vm.tiktok.com/x').error, WRONG, 'http short link is just wrong, not short')
  assert.equal(parseVideo('https://vm.tiktok.com.evil.com/x').error, WRONG)
})

test('handles with odd characters are accepted only as a path segment and never reach src', () => {
  const r = parseVideo(`https://www.tiktok.com/@a"b'<c>%20d/video/${TT}`)
  if (!r.error) assert.deepEqual(r, { provider: 'tiktok', id: TT, vertical: true })
})

test('result is always exactly {provider,id,vertical} or {error}; src built only from valid id', () => {
  const inputs = [
    `https://www.youtube.com/watch?v=${YT}&evil="><script>`, `https://youtu.be/${YT}?x="onload="alert(1)`, `https://www.youtube.com/embed/${YT}#"><img/src=x>`, `https://www.tiktok.com/@a/video/${TT}?x="><b>`,
  ]
  for (const u of inputs) {
    const r = parseVideo(u)
    assert.deepEqual(Object.keys(r).sort(), ['id', 'provider', 'vertical'], u)
    const src = embedSrc(r.provider, r.id)
    assert.match(src, /^https:\/\/www\.(youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}|tiktok\.com\/player\/v1\/\d{8,25})$/, u)
    const html = videoEmbed({ ...r, src }, 'Name')
    assert.ok(!/<script|onload|<img|<b>|evil/.test(html), html)
  }
})

test('videoEmbed: hostile name escaped, vertical sizing, no style, exactly one iframe', () => {
  const html = videoEmbed({ src: embedSrc('youtube', YT), vertical: false }, `"><script>alert(1)</script>&'`)
  assert.ok(!html.includes('<script'))
  assert.match(html, /title="&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;&amp;(&#39;|&#039;|&apos;)? video"/)
  assert.equal((html.match(/<iframe/g) || []).length, 1)
  assert.ok(!/style=/.test(html))
  assert.match(html, /width="560" height="315"/)
  assert.match(videoEmbed({ src: embedSrc('tiktok', TT), vertical: true }, 'x'), /width="325" height="578"/)
  assert.match(html, /referrerpolicy="strict-origin-when-cross-origin"/)
})

test('videoEmbed with a src containing a quote still cannot break out of the attribute', () => {
  const html = videoEmbed({ src: 'https://x/" onload="alert(1)', vertical: false }, 'n')
  assert.ok(!/src="[^"]*" onload=/.test(html), html)
})

test('very long and pathological input does not throw or hang', () => {
  const t = Date.now()
  for (const u of [`https://www.youtube.com/watch?v=${'a'.repeat(200000)}`, `https://${'a.'.repeat(50000)}com/x`, 'https://www.tiktok.com/@' + 'x'.repeat(100000) + `/video/${TT}`, '%'.repeat(100000), `https://youtu.be/${'%'.repeat(10000)}`]) {
    parseVideo(u)
  }
  assert.ok(Date.now() - t < 2000)
})
