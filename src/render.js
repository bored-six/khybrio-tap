import { esc } from './html.js'

const noIcon = () => ''

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

export function renderPage(client, site, { looks, fonts, icon = noIcon } = {}) {
  const { base, origin } = site
  const pageUrl = `${origin}${base}${client.slug}/`
  const asset = (file) => `${base}${client.slug}/${file}`
  const look = looks[client.look]
  const ctx = { client, site, asset, esc, icon, pageUrl }
  const dFont = fonts[client.font.display]
  const bFont = fonts[client.font.body]
  const t = client.theme
  const root =
    `:root{--bg:${t.bg};--ink:${t.ink};--accent:${t.accent};--on-accent:${t.onAccent};` +
    `--font-display:${stack(dFont)};--font-body:${stack(bFont)}}`
  const css = root + fontFaces(fonts, [client.font.display, client.font.body], base) + look.css(ctx)
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
    `<body>${look.render(ctx)}</body></html>`
  )
}

export function render404(site, { fonts = {} } = {}) {
  const bg = '#f5f7f6'
  const ink = '#0f2b29'
  const d = fonts.fraunces
  const b = fonts.inter
  const css =
    `:root{--bg:${bg};--ink:${ink};--accent:#e8622d;--on-accent:${ink};` +
    `--font-display:${d ? stack(d) : 'Georgia, serif'};--font-body:${b ? stack(b) : 'system-ui, sans-serif'}}` +
    fontFaces(fonts, ['fraunces', 'inter'], site.base) +
    `*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--ink);font:400 18px/1.5 var(--font-body)}` +
    `main{max-width:30rem}h1{font:600 2.2rem/1.1 var(--font-display);margin:0 0 .5em}a{color:var(--ink);text-underline-offset:.2em}`
  return (
    `<!doctype html><html lang="en">` +
    head({ title: 'Page not found', description: 'This page does not exist.', themeColor: bg, css }) +
    `<body><main><h1>This tap page does not exist.</h1><p>The link may be mistyped. <a href="${esc(site.mainSite)}">Go to Khybrio</a></p></main></body></html>`
  )
}
