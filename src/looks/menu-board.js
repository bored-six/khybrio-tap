// Look: menu-board. A cafe front read top to bottom: striped awning with a scalloped valance,
// an arched shop window (the cover), the sign (name), then the board itself, where every
// link is a menu line with dot leaders running to its "price" (an icon, or the actual
// phone number / email). Branches read like the hours card taped to the door.
import { blockHtml, linkOpen, detail, detailHtml, nameSize, credit, BASE, BLOCKS } from './shared.js'

function render(ctx) {
  const { client: c, esc } = ctx
  const icon = ctx.icon

  const cover = c.cover
    ? `<div class="cv"><img src="${esc(ctx.asset(c.cover))}" alt="" width="800" height="600"></div>`
    : ''
  const logo = c.logo ? `<img class="lg" src="${esc(ctx.asset(c.logo))}" alt="" width="84" height="84">` : ''

  // non-primary link blocks are menu lines with dot leaders; everything else uses the shared renderers
  const line = (l) => {
    const d = detail(l)
    return (
      `${linkOpen(ctx, l, 'it')}<span class="lb">${esc(l.label)}</span><span class="ld"></span>` +
      // short details take the price slot; long ones (emails) drop to a second line
      (d && d.length <= 18 ? `<span class="dt">${esc(d)}</span>` : icon(l.kind)) +
      (d && d.length > 18 ? `<span class="dt2">${detailHtml(ctx, d)}</span>` : '') +
      `</a>`
    )
  }
  const block = (b) => (b.type !== 'link' ? blockHtml(ctx, b) : b.primary ? blockHtml(ctx, b, 'pr') : line(b))

  const branches = c.branches.length
    ? `<section class="br"><h2 class="sh"><span>${c.branches.length > 1 ? 'Branches' : 'Find us'}</span></h2><ul>` +
      c.branches
        .map(
          (b) =>
            `<li><h3>${icon('pin')}<span>${esc(b.name)}</span></h3>` +
            (b.address ? `<p class="ad">${esc(b.address)}</p>` : '') +
            (b.hours
              ? `<p class="hr"><span class="k">Open</span><span class="ld"></span><span>${esc(b.hours)}</span></p>`
              : '') +
            (b.maps ? `<a class="dir" href="${esc(b.maps)}">Directions${icon('out')}</a>` : '') +
            `</li>`,
        )
        .join('') +
      `</ul></section>`
    : ''

  const cr = credit(ctx, 'cr')
  return (
    `<main class="mb${c.cover ? ' has-cv' : ''}${c.logo ? ' has-lg' : ''}">` +
    `<div class="aw" aria-hidden="true"></div>${cover}` +
    `<header class="hd">${logo}<h1 class="nm ${nameSize(c.name)}">${esc(c.name)}</h1>` +
    (c.tagline ? `<p class="tg">${esc(c.tagline)}</p>` : '') +
    `<span class="orn" aria-hidden="true"></span></header>` +
    `<div class="bk">${c.blocks.map(block).join('')}</div>` +
    branches +
    (cr ? `<footer class="ft">${cr}</footer>` : '') +
    `</main>`
  )
}

// Awning: stripes and scallops share one 28px module, centred, so every scallop is one
// whole stripe. If color-mix is missing the stripes drop out and a solid accent awning stays.
// If mask is missing the valance is a straight edge. Neither hides content.
const SCALLOP = 'linear-gradient(black 0 0) 0 0/100% 50px no-repeat,radial-gradient(circle at 50% 0,black 13.4px,transparent 14px) 50% 50px/28px 14px repeat-x'

const css = () =>
  BASE +
  BLOCKS +
  `.mb{max-width:480px;margin:0 auto;padding-bottom:calc(24px + env(safe-area-inset-bottom));` +
  `--stripe:color-mix(in srgb,var(--accent) 50%,var(--bg));--panel:color-mix(in srgb,var(--ink) 6%,var(--bg))}` +
  `.aw{height:64px;background-color:var(--accent);` +
  `background-image:linear-gradient(90deg,transparent 50%,var(--stripe) 50%);background-size:56px 100%;background-position:calc(50% + 14px) 0;` +
  `-webkit-mask:${SCALLOP};mask:${SCALLOP};transform-origin:50% 0;animation:unroll .7s cubic-bezier(.2,.9,.25,1.15) both}` +
  `@keyframes unroll{from{transform:scaleY(.3)}}` +
  // arched shop window, double frame
  `.cv{margin:22px 26px 0;aspect-ratio:4/3;overflow:hidden;border-radius:50% 50% 16px 16px/66.67% 66.67% 16px 16px;` +
  `box-shadow:0 0 0 5px var(--bg),0 0 0 7px var(--ink)}.cv img{width:100%;height:100%;object-fit:cover}` +
  // the sign
  `.hd{position:relative;padding:28px 24px 0;text-align:center}` +
  `.lg{width:84px;height:84px;margin:0 auto 18px;border-radius:50%;object-fit:cover;background:var(--bg);box-shadow:0 0 0 2px var(--ink)}` +
  `.has-cv .lg{margin-top:-62px}` +
  `.nm{font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:-.03em;overflow-wrap:anywhere;text-wrap:balance}` +
  `.n1{font-size:3.5rem;line-height:.95}.n2{font-size:2.6rem;line-height:1}.n3{font-size:1.9rem;line-height:1.08}` +
  `.tg{font-family:var(--font-tagline);max-width:30ch;margin:12px auto 0;font-size:1.0625rem;line-height:1.45;overflow-wrap:anywhere;text-wrap:balance}` +
  `.orn{display:block;width:136px;height:12px;margin:22px auto 0;background:` +
  `radial-gradient(circle,var(--accent) 4px,transparent 4.5px) 50% 50%/12px 12px no-repeat,` +
  `linear-gradient(var(--ink),var(--ink)) 0 50%/54px 1.5px no-repeat,linear-gradient(var(--ink),var(--ink)) 100% 50%/54px 1.5px no-repeat}` +
  // primary: pill with an ink plate under it, presses down onto it
  `.pr{display:flex;align-items:center;justify-content:center;gap:12px;min-height:68px;margin:0;padding:12px 26px;` +
  `border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:700;font-size:1.3rem;line-height:1.2;text-align:center;` +
  `overflow-wrap:anywhere;box-shadow:0 5px 0 var(--ink);transition:transform .12s,box-shadow .12s}` +
  `.pr .ic{width:26px;height:26px}.pr:active{transform:translateY(4px);box-shadow:0 1px 0 var(--ink)}` +
  // the board
  `.bk{margin:26px 20px 0}.bk>*+.pr{margin-top:20px}.bk>.it{margin:0;padding:15px 12px}.bk>.pr{margin:0 0 4px}.bk>.it+.it{border-top:1px dashed var(--line)}` +
  `.bk>.it{background:var(--panel)}.bk>.it:first-child,.bk>:not(.it)+.it{border-radius:22px 22px 0 0;margin-top:20px;padding-top:23px}` +
  `.bk>.it:last-child,.bk>.it:has(+:not(.it)){border-radius:0 0 22px 22px;padding-bottom:23px}` +
  `.bk>.it:only-child,.bk>:not(.it)+.it:has(+:not(.it)){border-radius:22px}` +
  `.it{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;min-height:56px}` +
  `.it .lb{min-width:0;max-width:72%;font:var(--heading-weight) 1.1875rem/1.25 var(--font-heading);overflow-wrap:anywhere}` +
  `.ld{flex:1 1 20px;min-width:20px;height:6px;background:radial-gradient(circle,var(--ink) 1.1px,transparent 1.6px) 0 0/7px 6px repeat-x}` +
  `.it .ic{align-self:center}.dt{max-width:55%;font-weight:700;font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere}` +
  `.dt2{flex-basis:100%;font-weight:600;overflow-wrap:anywhere}.it:active .lb{text-decoration:underline;text-underline-offset:.2em}` +
  // branches: the hours card
  `.br{margin:40px 20px 0}` +
  `.sh{display:flex;align-items:center;gap:14px;font:700 .8125rem/1 var(--font-body);letter-spacing:.16em;text-transform:uppercase}` +
  `.sh::before,.sh::after{content:"";flex:1;height:1.5px;background:var(--ink)}` +
  `.br li{padding:20px 4px;border-bottom:1px dashed var(--line)}.br li:last-child{border-bottom:0}` +
  `.br h3{display:flex;align-items:center;gap:8px;font:var(--heading-weight) 1.375rem/1.2 var(--font-heading);letter-spacing:-.01em;overflow-wrap:anywhere}` +
  `.br h3 span{min-width:0}.ad{margin-top:6px;overflow-wrap:anywhere}` +
  `.hr{display:flex;align-items:baseline;gap:10px;margin-top:6px;font-weight:600;font-variant-numeric:tabular-nums}` +
  `.hr .k{font-weight:400}.hr span:last-child{max-width:70%;text-align:right;overflow-wrap:anywhere}` +
  `.dir{display:inline-flex;align-items:center;gap:8px;min-height:48px;margin-top:14px;padding:0 20px;` +
  `border:2px solid var(--ink);border-radius:999px;font-weight:700}.dir .ic{width:18px;height:18px}` +
  `.dir:active{background:var(--panel)}` +
  `.ft{margin-top:36px;text-align:center}.cr{display:inline-flex;align-items:center;min-height:48px;padding:0 12px;font-size:.875rem}` +
  `.cr strong{margin-left:.3em;font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:1rem}` +
  `@media (min-width:600px){body{padding:0 24px}.aw{border-radius:0 0 2px 2px}}`

export default { label: 'Menu board', render, css }
