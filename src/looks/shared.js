// Helpers both looks use. Every client string goes through ctx.esc before it touches markup.

// The one way a client link opens. data-kind ONLY here, never on branch or credit links.
export const linkOpen = (ctx, l, cls) =>
  `<a class="${cls}" data-block="link" href="${ctx.esc(l.url)}" data-kind="${ctx.esc(l.kind)}"${l.primary ? ' data-primary' : ''}>`

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

// Default renderer for every block type. `cls` is the class a link anchor gets.
// Exactly one element per block carries data-block.
export function blockHtml(ctx, b, cls = 'it') {
  const { esc } = ctx
  if (b.type === 'heading') return `<h2 class="bh" data-block="heading">${esc(b.text)}</h2>`
  if (b.type === 'text') return `<p class="bt" data-block="text">${ctx.text(b.text)}</p>`
  if (b.type === 'socials')
    return (
      `<div class="bs" data-block="socials">` +
      b.items
        .map((i) => `<a href="${esc(i.url)}" data-kind="${esc(i.kind)}" aria-label="${esc(i.label)}">${ctx.icon(i.kind)}</a>`)
        .join('') +
      `</div>`
    )
  if (b.type === 'video') return `<div class="bv${b.vertical ? ' vt' : ''}" data-block="video">${ctx.embed(b)}</div>`
  const d = detail(b)
  return (
    `${linkOpen(ctx, b, cls)}${ctx.icon(b.kind)}` +
    `<span class="lb">${esc(b.label)}${d ? `<span class="dt">${detailHtml(ctx, d)}</span>` : ''}</span>` +
    `<span class="ar">${ctx.icon('arrow')}</span></a>`
  )
}

// Functional CSS for heading, text, socials and video blocks. Colour only from theme vars.
export const BLOCKS =
  `.bh{margin-top:32px;font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:1.5rem;line-height:1.15;` +
  `letter-spacing:-.01em;overflow-wrap:anywhere;text-wrap:balance}` +
  `.bt{margin-top:14px;max-width:60ch;overflow-wrap:anywhere}` +
  `.bs{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}` +
  `.bs a{display:grid;place-items:center;width:48px;height:48px;border:1.75px solid var(--ink);border-radius:50%}` +
  `.bs a:active{background:var(--line)}.bs .ic{width:22px;height:22px}` +
  `.bv{margin-top:24px}.bv iframe{display:block;width:100%;height:auto;aspect-ratio:16/9;border:0;border-radius:14px;background:var(--line)}` +
  `.bv.vt iframe{aspect-ratio:9/16;max-width:325px;margin:0 auto}`

// --- Pieces the newer looks share. Markup only: each look styles the classes itself. ---

export const coverHtml = (ctx) =>
  ctx.client.cover
    ? `<div class="cv"><img src="${ctx.esc(ctx.asset(ctx.client.cover))}" alt="" width="800" height="600"></div>`
    : ''

export const logoHtml = (ctx, size) =>
  ctx.client.logo
    ? `<img class="lg" src="${ctx.esc(ctx.asset(ctx.client.logo))}" alt="" width="${size}" height="${size}">`
    : ''

// A link with no trailing arrow: kind icon (wrapped in .k), label, optional phone/email detail.
// For looks where the row itself reads as tappable (numbered lines, slabs).
export function plainLink(ctx, b, cls) {
  const d = detail(b)
  return (
    `${linkOpen(ctx, b, cls)}<span class="k">${ctx.icon(b.kind)}</span>` +
    `<span class="lb">${ctx.esc(b.label)}${d ? `<span class="dt">${detailHtml(ctx, d)}</span>` : ''}</span></a>`
  )
}

// section.br > h2.sh + ul > li > h3, p.ad, p.hr (clock + span), a.dir
export function branchesHtml(ctx) {
  const { client: c, esc, icon } = ctx
  if (!c.branches.length) return ''
  return (
    `<section class="br"><h2 class="sh">${c.branches.length > 1 ? 'Branches' : 'Find us'}</h2><ul>` +
    c.branches
      .map(
        (b) =>
          `<li><h3>${esc(b.name)}</h3>` +
          (b.address ? `<p class="ad">${esc(b.address)}</p>` : '') +
          (b.hours ? `<p class="hr">${icon('clock')}<span>${esc(b.hours)}</span></p>` : '') +
          (b.maps ? `<a class="dir" href="${esc(b.maps)}">Directions${icon('out')}</a>` : '') +
          `</li>`,
      )
      .join('') +
    `</ul></section>`
  )
}
