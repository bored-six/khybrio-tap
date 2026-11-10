// Helpers both looks use. Every client string goes through ctx.esc before it touches markup.

// The one way a client link opens. data-kind ONLY here, never on branch or credit links.
export const linkOpen = (ctx, l, i, cls) =>
  `<a class="${cls}" href="${ctx.esc(l.url)}" data-kind="${ctx.esc(l.kind)}"${i === 0 ? ' data-primary' : ''}>`

// Phone and email show the actual number/address: people tap a card to get exactly that.
export function detail(l) {
  if (l.kind !== 'phone' && l.kind !== 'email') return null
  let s = l.url.replace(/^(tel|mailto):/i, '').split('?')[0]
  try {
    s = decodeURIComponent(s)
  } catch {}
  const ph = s.match(/^\+63(\d{3})(\d{3})(\d{4})$/)
  if (ph) s = `+63 ${ph[1]} ${ph[2]} ${ph[3]}`
  return s && s !== l.label ? s : null
}

// Escaped detail with a break point before the @, so an email wraps as name / @domain.
export const detailHtml = (ctx, d) => ctx.esc(d).replace('@', '<wbr>@')

// Name size steps by length, so a 60-character name wraps to 3 lines, not 7.
export const nameSize = (name) => (name.length > 30 ? 'n3' : name.length > 14 ? 'n2' : 'n1')

export const credit = (ctx, cls) =>
  ctx.client.credit
    ? `<a class="${cls}" href="${ctx.esc(ctx.site.mainSite)}">Tap card by <strong>Khybrio</strong></a>`
    : ''

// Base every look starts from. Text is always full --ink: hierarchy comes from size, weight
// and face, never from fading, because a client's ink/bg may sit right on the 4.5:1 line.
export const BASE =
  `*,*::before,*::after{box-sizing:border-box}` +
  `html{background:var(--bg);-webkit-text-size-adjust:100%;text-size-adjust:100%}` +
  `body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.5 var(--font-body);` +
  `-webkit-font-smoothing:antialiased;--line:color-mix(in srgb,var(--ink) 22%,transparent)}` +
  `h1,h2,h3,p,ul{margin:0}ul{list-style:none;padding:0}` +
  `a{color:inherit;text-decoration:none;-webkit-tap-highlight-color:transparent}` +
  `a:focus-visible{outline:2.5px solid var(--ink);outline-offset:3px}` +
  `img{display:block;max-width:100%}` +
  `.ic{width:22px;height:22px;flex:none}` +
  `@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}`
