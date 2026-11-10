// Look: card. The page is the card you just tapped, enlarged.
// Left-set like a printed business card: mark top-left with the tap rippling out of it,
// name in the display face, one accent action, the rest as a ruled list.
// On desktop the column becomes the card itself, lifted off a darker table.
import { icon } from '../icons.js'
import { linkOpen, detail, detailHtml, nameSize, credit, BASE } from './shared.js'

function render(ctx) {
  const { client: c, esc } = ctx
  const [first, ...rest] = c.links
  const mark = c.logo
    ? `<img class="lg" src="${esc(ctx.asset(c.logo))}" alt="" width="88" height="88">`
    : `<span class="lg mono" aria-hidden="true">${esc([...c.name][0])}</span>`

  const row = (l, i) => {
    const d = detail(l)
    return (
      `<li>${linkOpen(ctx, l, i, 'it')}${icon(l.kind)}` +
      `<span class="lb">${esc(l.label)}${d ? `<span class="dt">${detailHtml(ctx, d)}</span>` : ''}</span>` +
      `<span class="ar">${icon('arrow')}</span></a></li>`
    )
  }

  const branches = c.branches.length
    ? `<section class="br"><h2 class="sh">${c.branches.length > 1 ? 'Branches' : 'Find us'}</h2><ul>` +
      c.branches
        .map(
          (b) =>
            `<li><h3>${esc(b.name)}</h3>` +
            (b.address ? `<p>${esc(b.address)}</p>` : '') +
            (b.hours ? `<p class="hr">${icon('clock')}<span>${esc(b.hours)}</span></p>` : '') +
            (b.maps ? `<a class="dir" href="${esc(b.maps)}">Directions${icon('out')}</a>` : '') +
            `</li>`,
        )
        .join('') +
      `</ul></section>`
    : ''

  const cr = credit(ctx, 'cr')
  return (
    `<main class="cd">` +
    `<header class="hd">${mark}<h1 class="nm ${nameSize(c.name)}">${esc(c.name)}</h1>` +
    (c.tagline ? `<p class="tg">${esc(c.tagline)}</p>` : '') +
    `</header>` +
    `${linkOpen(ctx, first, 0, 'pr')}${icon(first.kind)}<span class="lb">${esc(first.label)}</span>` +
    `<span class="go">${icon('arrow')}</span></a>` +
    (rest.length ? `<ul class="ls">${rest.map((l, i) => row(l, i + 1)).join('')}</ul>` : '') +
    branches +
    (cr ? `<footer class="ft">${cr}</footer>` : '') +
    `</main>`
  )
}

// Geometry: the ripple is centred on the mark (20 gutter + 44 half-mark, 40 top + 44).
const css = () =>
  BASE +
  `.cd{position:relative;overflow:hidden;max-width:440px;min-height:100vh;min-height:100svh;margin:0 auto;` +
  `padding:0 20px calc(32px + env(safe-area-inset-bottom));--ring:color-mix(in srgb,var(--ink) 13%,transparent)}` +
  `.cd::before{content:"";position:absolute;left:-196px;top:-176px;width:520px;height:520px;border-radius:50%;pointer-events:none;` +
  `background:repeating-radial-gradient(circle,transparent 0 37px,var(--ring) 37px 38px);` +
  `-webkit-mask:radial-gradient(circle,#000 25%,transparent 68%);mask:radial-gradient(circle,#000 25%,transparent 68%);` +
  `animation:tap 1.6s cubic-bezier(.16,1,.3,1) both}` +
  `@keyframes tap{from{transform:scale(.45);opacity:.3}}` +
  `.hd{position:relative;padding-top:40px}` +
  `.lg{width:88px;height:88px;border-radius:24px;object-fit:contain}` +
  `.mono{display:grid;place-items:center;border:1.75px solid var(--ink);border-radius:50%;font:600 2.6rem/1 var(--font-display)}` +
  `.nm{margin-top:24px;font-family:var(--font-display);font-weight:600;letter-spacing:-.022em;overflow-wrap:anywhere;text-wrap:balance}` +
  `.n1{font-size:3.25rem;line-height:1}.n2{font-size:2.4rem;line-height:1.04}.n3{font-size:1.8rem;line-height:1.1}` +
  `.tg{margin-top:12px;max-width:31ch;font-size:1.0625rem;line-height:1.45;overflow-wrap:anywhere}` +
  // primary: the only accent on the page, on-accent text at 20px bold (the 3:1 rule)
  `.pr{display:flex;align-items:center;gap:14px;min-height:66px;margin-top:32px;padding:12px 12px 12px 20px;border-radius:18px;` +
  `background:var(--accent);color:var(--on-accent);font-weight:700;font-size:1.25rem;line-height:1.2;transition:transform .15s}` +
  `.pr .ic{width:24px;height:24px}.pr .lb{flex:1;min-width:0;overflow-wrap:anywhere}` +
  `.go{display:grid;place-items:center;flex:none;width:42px;height:42px;border-radius:50%;border:1.75px solid currentColor}` +
  `.go .ic{width:20px;height:20px;transition:transform .2s}` +
  `.pr:active{transform:translateY(1px) scale(.99)}.pr:hover .go .ic{transform:translateX(2px)}` +
  // the ruled list
  `.ls{margin-top:28px;border-top:1px solid var(--line)}` +
  `.it{display:flex;align-items:center;gap:16px;min-height:62px;padding:12px 2px;border-bottom:1px solid var(--line)}` +
  `.it .lb{flex:1;min-width:0;font-weight:600;line-height:1.3;overflow-wrap:anywhere}` +
  `.dt{display:block;margin-top:2px;font-weight:400;font-size:.9375rem;font-variant-numeric:tabular-nums}` +
  `.ar .ic{width:18px;height:18px;display:block;transition:transform .2s}.it:hover .ar .ic{transform:translateX(3px)}` +
  `.it:active{background:var(--line)}` +
  // branches
  `.br{margin-top:40px}.sh{font:600 1.5rem/1.1 var(--font-display);letter-spacing:-.01em;margin-bottom:6px}` +
  `.br li{padding:16px 0;border-bottom:1px solid var(--line)}.br h3{font-size:1.0625rem;font-weight:700;overflow-wrap:anywhere}` +
  `.br p{overflow-wrap:anywhere}.hr{display:flex;align-items:center;gap:8px;margin-top:4px;font-variant-numeric:tabular-nums}.hr .ic{width:18px;height:18px}` +
  `.dir{display:inline-flex;align-items:center;gap:6px;min-height:48px;margin-top:8px;padding:0 18px;border:1.75px solid var(--ink);border-radius:999px;font-weight:600}` +
  `.dir .ic{width:18px;height:18px}` +
  `.ft{margin-top:36px}.cr{display:inline-flex;align-items:center;min-height:48px;font-size:.875rem;letter-spacing:.01em}` +
  `.cr strong{margin-left:.3em;font-family:var(--font-display);font-weight:600;font-size:1rem}` +
  // desktop: the column is the card, lifted off a darker table
  `@media (min-width:600px){html{background:color-mix(in srgb,var(--bg) 78%,#000)}body{background:none;padding:7vh 24px}` +
  `.cd{min-height:0;border-radius:28px;background:var(--bg);padding:0 32px 36px;` +
  `box-shadow:0 0 0 1px var(--line),0 40px 80px -30px rgba(0,0,0,.55)}.cd::before{left:-184px}}`

export default { label: 'Card', render, css }
