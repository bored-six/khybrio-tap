// Video embeds. The only iframe markup any look may emit. src is built from the parsed id, never from the user URL.
import { esc } from './html.js'

const YT_ID = /^[A-Za-z0-9_-]{11}$/
const TT_ID = /^\d{8,25}$/
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com']
const TT_HOSTS = ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']
const WRONG = 'must be a YouTube or TikTok video link'
const SHORT = 'short TikTok link, open it and copy the full address'

const yt = (id, vertical) => (YT_ID.test(id) ? { provider: 'youtube', id, vertical } : { error: WRONG })
const tt = (id) => (TT_ID.test(id) ? { provider: 'tiktok', id, vertical: true } : { error: WRONG })

// Errors carry no path; validate prefixes `blocks[i].url: `.
export function parseVideo(url) {
  if (typeof url !== 'string' || /[\s\u0000-\u001f\u007f]/.test(url)) return { error: WRONG }
  let u
  try {
    u = new URL(url)
  } catch {
    return { error: WRONG }
  }
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return { error: WRONG }
  const host = u.hostname
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') return { error: SHORT }
  const parts = u.pathname.slice(1).split('/')

  if (host === 'youtu.be') return parts.length === 1 ? yt(parts[0], false) : { error: WRONG }
  if (YT_HOSTS.includes(host)) {
    if (parts.length === 1 && parts[0] === 'watch') return yt(u.searchParams.get('v') ?? '', false)
    if (parts.length === 2 && (parts[0] === 'embed' || parts[0] === 'live')) return yt(parts[1], false)
    if (parts.length === 2 && parts[0] === 'shorts') return yt(parts[1], true)
    return { error: WRONG }
  }
  if (TT_HOSTS.includes(host)) {
    if (parts.length === 3 && /^@[^/]+$/.test(parts[0]) && parts[1] === 'video') return tt(parts[2])
    if (parts.length === 3 && ((parts[0] === 'embed' && parts[1] === 'v2') || (parts[0] === 'player' && parts[1] === 'v1'))) return tt(parts[2])
  }
  return { error: WRONG }
}

export const embedSrc = (provider, id) =>
  provider === 'youtube' ? `https://www.youtube-nocookie.com/embed/${id}` : `https://www.tiktok.com/player/v1/${id}`

export function videoEmbed(block, name) {
  const [w, h] = block.vertical ? [325, 578] : [560, 315]
  return (
    `<iframe src="${esc(block.src)}" title="${esc(name)} video" width="${w}" height="${h}" loading="lazy"` +
    ' allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen' +
    ' referrerpolicy="strict-origin-when-cross-origin"' +
    ' sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"></iframe>'
  )
}
