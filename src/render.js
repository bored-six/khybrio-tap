import { esc } from './html.js'
import { icon as defaultIcon } from './icons.js'
import { videoEmbed } from './embed.js'
import { STYLE, STYLE_KEYS } from './style.js'

function fontFaces(fonts, ids, base) {
  const seen = new Set()
  let css = ''
  for (const id of ids) {
    const f = fonts[id]
    if (!f || seen.has(id)) continue
    seen.add(id)
    for (const file of f.files) {
      css += `@font-face{font-family:'${f.family}';font-style:${file.style};font-weight:${file.weight};font-display:swap;src:url(${base}fonts/${file.file}) format('woff2')}`
    }
  }
  return css
}

const stack = (f) => `'${f.family}', ${f.fallback}`

function head({ title, description, canonical, image, themeColor, css }) {
  return (
    `<head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${esc(title)}</title>` +
    `<meta name="description" content="${esc(description)}">` +
    `<meta name="theme-color" content="${esc(themeColor)}">` +
    (canonical
      ? `<link rel="canonical" href="${esc(canonical)}">` +
        `<meta property="og:type" content="website">` +
        `<meta property="og:title" content="${esc(title)}">` +
        `<meta property="og:description" content="${esc(description)}">` +
        `<meta property="og:url" content="${esc(canonical)}">` +
        (image ? `<meta property="og:image" content="${esc(image)}">` : '')
      : '') +
    `<style>${css}</style></head>`
  )
}

// Style custom properties: look defaults, then the client's non-null keys, in STYLE_KEYS order.
function styleDecls(client, look) {
  const defaults = look.styleDefaults || {}
  const set = client.style || {}
  const video = client.background && client.background.type === 'video'
  let out = ''
  for (const key of STYLE_KEYS) {
    const value = set[key] ?? defaults[key] ?? null
    let decl = value && STYLE[key][value]
    if (!decl) continue
    // A backdrop-filter re-blurs every video frame under every button; a firmer bg tint instead.
    if (video && key === 'buttonFill' && value === 'glass') decl = decl.replace('blur(12px) saturate(1.3)', 'none').replace('var(--bg) 60%', 'var(--bg) 72%')
    out += ';' + decl
  }
  return out
}

const stopCss = (s) => (s.ref ? `var(--${s.ref})` : s.hex)

function backdrop(bg, asset) {
  if (!bg || bg.type === 'color' || !bg.type) return { html: '', css: '', type: null }
  const layer = (inner) => `<div class="kb" aria-hidden="true">${inner}</div>`
  let css = 'html[data-bg]{background:var(--bg)}html[data-bg] body{background:transparent}' +
    '.kb{position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;z-index:-1;overflow:hidden;pointer-events:none}'
  if (bg.type === 'gradient') {
    const stops = bg.stops.map(stopCss).join(',')
    css += `.kb{background:${bg.shape === 'radial' ? `radial-gradient(130% 90% at 50% 0%,${stops})` : `linear-gradient(${bg.angle ?? 180}deg,${stops})`}}`
    return { html: layer(''), css, type: 'gradient' }
  }
  const [x, y] = bg.focus || [50, 50]
  css += `.kb-m{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${x}% ${y}%}`
  if (bg.blur > 0) css += `.kb-m{filter:blur(${bg.blur}px);transform:scale(1.12)}`
  css += `.kb::after{content:"";position:absolute;inset:0;background:var(--bg);opacity:${(bg.dim ?? 40) / 100}}`
  if (bg.type === 'image') {
    return { html: layer(`<img class="kb-m" src="${esc(asset(bg.file))}" alt="" decoding="async">`), css, type: 'image' }
  }
  css += '@media (prefers-reduced-motion:reduce){.kb-v{display:none}}'
  const poster = esc(asset(bg.poster))
  return {
    html: layer(
      `<img class="kb-m" src="${poster}" alt="" decoding="async">` +
        `<video class="kb-m kb-v" autoplay muted loop playsinline disablepictureinpicture disableremoteplayback tabindex="-1" poster="${poster}">` +
        `<source src="${esc(asset(bg.file))}" type="video/mp4" media="(prefers-reduced-motion: no-preference)"></video>`,
    ),
    css,
    type: 'video',
  }
}

export function renderPage(client, site, { looks, fonts, icon: iconFn = defaultIcon } = {}) {
  const { base, origin } = site
  const pageUrl = `${origin}${base}${client.slug}/`
  const asset = (file) => `${base}${client.slug}/${file}`
  const look = looks[client.look]
  // Each glyph is emitted once in a sprite and referenced with <use>: a page with 30 links
  // and socials stays small. An icon fn that does not return a plain <svg> passes through.
  const used = new Map()
  const icon = (kind) => {
    const svg = iconFn(kind)
    const m = /^<svg\b[^>]*>([\s\S]*)<\/svg>$/.exec(svg)
    if (!m || !/^[a-z0-9-]+$/.test(kind)) return svg
    used.set(kind, m[1])
    return `<svg class="ic" width="24" height="24" aria-hidden="true" focusable="false"><use href="#i-${kind}"/></svg>`
  }
  const text = (str) => esc(str).replace(/\r?\n/g, '<br>')
  const embed = (block) => videoEmbed(block, client.name)
  const ctx = { client, site, asset, esc, icon, pageUrl, embed, text }
  const { heading, tagline, body } = client.font
  const t = client.theme
  const root =
    `:root{--bg:${t.bg};--ink:${t.ink};--accent:${t.accent};--on-accent:${t.onAccent};` +
    `--font-heading:${stack(fonts[heading])};--font-tagline:${stack(fonts[tagline])};--font-body:${stack(fonts[body])};` +
    `--heading-weight:${fonts[heading].headingWeight}${styleDecls(client, look)}}`
  const bd = backdrop(client.background, asset)
  const css = root + fontFaces(fonts, [heading, tagline, body], base) + look.css(ctx) + bd.css
  const bodyHtml = look.render(ctx)
  const sprite = () =>
    used.size
      ? `<svg width="0" height="0" aria-hidden="true" focusable="false">` +
        [...used]
          .map(([k, body]) => `<symbol id="i-${k}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</g></symbol>`)
          .join('') +
        `</svg>`
      : ''
  const bgImage = client.background && (client.background.type === 'image' ? client.background.file : client.background.type === 'video' ? client.background.poster : null)
  const cover = client.cover || client.logo || bgImage
  return (
    `<!doctype html><html lang="en"${bd.type ? ` data-bg="${bd.type}"` : ''}>` +
    head({
      title: client.name,
      description: client.tagline || `${client.name}: links, location and contact`,
      canonical: pageUrl,
      image: cover ? `${origin}${asset(cover)}` : null,
      themeColor: t.bg,
      css,
    }) +
    `<body>${bd.html}${bodyHtml}${sprite()}</body></html>`
  )
}

export function render404(site, { fonts = {} } = {}) {
  const bg = '#f5f7f6'
  const ink = '#0f2b29'
  const d = fonts.fraunces
  const b = fonts.inter
  const css =
    `:root{--bg:${bg};--ink:${ink};--accent:#e8622d;--on-accent:${ink};` +
    `--font-heading:${d ? stack(d) : 'Georgia, serif'};--heading-weight:600;--font-body:${b ? stack(b) : 'system-ui, sans-serif'}}` +
    fontFaces(fonts, ['fraunces', 'inter'], site.base) +
    `*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--ink);font:400 18px/1.5 var(--font-body)}` +
    `main{max-width:30rem}h1{font:var(--heading-weight) 2.2rem/1.1 var(--font-heading);margin:0 0 .5em}a{color:var(--ink);text-underline-offset:.2em}`
  return (
    `<!doctype html><html lang="en">` +
    head({ title: 'Page not found', description: 'This page does not exist.', themeColor: bg, css }) +
    `<body><main><h1>This tap page does not exist.</h1><p>The link may be mistyped. <a href="${esc(site.mainSite)}">Go to Khybrio</a></p></main></body></html>`
  )
}
