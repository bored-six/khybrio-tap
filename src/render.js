import { esc } from './html.js'
import { icon as defaultIcon } from './icons.js'
import { videoEmbed } from './embed.js'

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
    `--heading-weight:${fonts[heading].headingWeight}}`
  const css = root + fontFaces(fonts, [heading, tagline, body], base) + look.css(ctx)
  const bodyHtml = look.render(ctx)
  const sprite = () =>
    used.size
      ? `<svg width="0" height="0" aria-hidden="true" focusable="false">` +
        [...used]
          .map(([k, body]) => `<symbol id="i-${k}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</g></symbol>`)
          .join('') +
        `</svg>`
      : ''
  const cover = client.cover || client.logo
  return (
    `<!doctype html><html lang="en">` +
    head({
      title: client.name,
      description: client.tagline || `${client.name}: links, location and contact`,
      canonical: pageUrl,
      image: cover ? `${origin}${asset(cover)}` : null,
      themeColor: t.bg,
      css,
    }) +
    `<body>${bodyHtml}${sprite()}</body></html>`
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
