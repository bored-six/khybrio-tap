// Look: card. The page is the card you just tapped, enlarged.
// Left-set like a printed business card: mark top-left with the tap rippling out of it,
// name in the heading face, one accent action, the rest as a ruled list.
// On desktop the column becomes the card itself, lifted off a darker table.
// Style options: left-set, ruled and flat unless told otherwise. Choosing a button fill or a
// two-up layout turns the ruled lines into buttons (.fb). Over a gradient, photo or video the
// column becomes the card itself: a frosted sheet in the page colour, as tall as its content.
import { blockHtml, nameSize, credit, styleOf, bgOf, ARROW, BASE, BLOCKS } from './shared.js'

const DEFAULTS = { linkLayout: 'list', align: 'left', spacing: 'comfortable', shadow: 'none' }

function render(ctx) {
  const { client: c, esc } = ctx
  const icon = ctx.icon
  const mark = c.logo
    ? `<img class="lg" src="${esc(ctx.asset(c.logo))}" alt="" width="88" height="88">`
    : `<span class="lg mono" aria-hidden="true">${esc([...c.name][0])}</span>`

  // cover: a banner bleeding to the card edges above the name; the tap ripple moves aside for it
  const cover = c.cover
    ? `<div class="cv"><img src="${esc(ctx.asset(c.cover))}" alt="" width="800" height="600"></div>`
    : ''

  // only the main action carries an arrow in the markup; the rows get theirs from CSS
  const block = (b) => blockHtml(ctx, b, b.primary ? 'pr' : 'it', b.primary)

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
  const st = styleOf(ctx, DEFAULTS)
  const grid = st.linkLayout === 'grid'
  const cls =
    (cover ? ' hc' : '') +
    (st.buttonFill || grid ? ' fb' : '') +
    (grid ? ' g' : '') +
    (st.align === 'center' ? ' ac' : '') +
    (st.coverShape ? (st.coverShape === 'banner' ? ' cs' : ' cs ci') : '') +
    (st.shadow === 'hard' ? ' hs' : '')
  return (
    `<main class="cd${cls}">` +
    cover +
    `<header class="hd">${mark}<h1 class="nm ${nameSize(c.name)}">${esc(c.name)}</h1>` +
    (c.tagline ? `<p class="tg">${esc(c.tagline)}</p>` : '') +
    `</header>` +
    `<div class="bk">${c.blocks.map(block).join('')}</div>` +
    branches +
    (cr ? `<footer class="ft">${cr}</footer>` : '') +
    `</main>`
  )
}

// Buttons instead of rules: one material from the --btn-* vars, a corner never rounder than
// half the row. On a page that has them the rules are bare; on a ruled page they sit behind .fb,
// unused, because every page's sheet must read every style variable the look supports
// (test/looks.test.js) so the sheet and the :root declarations can never drift apart.
const buttons = (p, grid, hs) =>
  `${p}.bk{display:flex;flex-wrap:wrap;column-gap:var(--_g);margin-top:0}${p}.bk>*{flex:1 1 100%;min-width:0}` +
  `${p}.bk>.it{flex-basis:calc(100%/var(--link-cols,1) - var(--_g));margin-top:var(--_g);padding:${grid ? '12px 8px' : '10px 16px'};border:1.5px solid var(--btn-line,var(--line));` +
  `border-radius:min(var(--btn-r,18px),calc(var(--btn-h,62px)/2));background:var(--btn-bg,transparent);color:var(--btn-ink,inherit);` +
  `-webkit-backdrop-filter:var(--btn-blur,none);backdrop-filter:var(--btn-blur,none);` +
  // a hard shadow is ink: under an ink button it needs a hairline of page colour first
  `box-shadow:${hs ? '0 0 0 1.5px var(--bg),var(--btn-shadow)' : 'var(--btn-shadow,none)'}}` +
  `${p}.it:active{opacity:.7}`

// Same reason: a cover with no shape chosen still carries the shape rules, behind .cs and .ci.
const COVER_SHAPES = `.cs .cv{height:auto;aspect-ratio:var(--cover-ratio);border-radius:var(--cover-r)}.ci .cv{width:var(--cover-w);margin:20px 0 0}`

// Geometry: the ripple is centred on the mark (20 gutter + 44 half-mark, 40 top + 44).
// The sheet is written for the page it is on, not for every page: a cover drops the ripple,
// buttons drop the ruled list, a two-up tile drops the arrow, and so on. That is what keeps a
// full page (20 links, 6 branches, every style key) under the 30 KB budget.
const css = (ctx) => {
  const c = ctx.client
  const st = styleOf(ctx, DEFAULTS)
  const grid = st.linkLayout === 'grid'
  const fb = st.buttonFill || grid
  const ac = st.align === 'center'
  const hs = st.shadow === 'hard'
  const shape = c.cover && st.coverShape
  const inset = shape && shape !== 'banner'
  const bg = bgOf(ctx)
  const ripple = !c.cover
  return (
    BASE +
    BLOCKS +
    `.cd{position:relative;overflow:hidden;max-width:440px;min-height:100vh;min-height:100svh;margin:0 auto;` +
    `padding:0 20px calc(32px + env(safe-area-inset-bottom));text-align:var(--align,left);` +
    // a hard shadow needs room to fall, so the gap never goes under 12px
    `--_g:${hs ? 'max(var(--gap,14px),12px)' : 'var(--gap,14px)'}${ripple ? ';--ring:color-mix(in srgb,var(--ink) 13%,transparent)' : ''}}` +
    // the tap ripple; centred with the mark when the card is centred. A cover takes its place.
    (ripple
      ? `.cd::before{content:"";position:absolute;left:${ac ? 'calc(50% - 260px)' : '-196px'};top:-176px;width:520px;height:520px;border-radius:50%;pointer-events:none;` +
        `background:repeating-radial-gradient(circle,transparent 0 37px,var(--ring) 37px 38px);` +
        `-webkit-mask:radial-gradient(circle,black 25%,transparent 68%);mask:radial-gradient(circle,black 25%,transparent 68%);` +
        `animation:tap 1.6s cubic-bezier(.16,1,.3,1) both}` +
        `@keyframes tap{from{transform:scale(.45);opacity:.3}}`
      : '') +
    `.hd{position:relative;padding-top:${c.cover ? 24 : 40}px}` +
    // cover: a 240px band bleeding to the card edges; a chosen shape trades the band for its
    // ratio, and rounded and circle sit inset
    (c.cover
      ? `.cv{overflow:hidden;background:var(--line);` +
        (shape
          ? `aspect-ratio:var(--cover-ratio);border-radius:var(--cover-r);` + (inset ? `width:var(--cover-w);margin:20px ${ac ? 'auto' : '0'} 0}` : `margin:0 -20px}`)
          : `height:240px;margin:0 -20px}` + COVER_SHAPES) +
        `.cv img{width:100%;height:100%;object-fit:cover}`
      : '') +
    (c.logo
      ? `.lg{width:88px;height:88px;border-radius:var(--logo-r,24px);object-fit:contain}`
      : `.lg{display:grid;place-items:center;width:88px;height:88px;border:1.75px solid var(--ink);border-radius:var(--logo-r,50%);font:var(--heading-weight) 2.6rem/1 var(--font-heading)}`) +
    `.nm{margin-top:24px;font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:-.022em;overflow-wrap:anywhere;text-wrap:balance}` +
    `.n1{font-size:3.25rem;line-height:1}.n2{font-size:2.4rem;line-height:1.04}.n3{font-size:1.8rem;line-height:1.1}` +
    `.tg{margin-top:12px;font-family:var(--font-tagline);max-width:31ch;font-size:1.0625rem;line-height:1.45;overflow-wrap:anywhere}` +
    // primary: the only accent on the page, on-accent text at 20px bold (the 3:1 rule)
    `.pr{display:flex;align-items:center;gap:14px;min-height:calc(var(--btn-h,62px) + 4px);margin-top:calc(var(--_g) + 10px);padding:12px 12px 12px 20px;` +
    `border-radius:min(var(--btn-r,18px),33px);box-shadow:var(--btn-shadow,none);` +
    `background:var(--accent);color:var(--on-accent);font-weight:700;font-size:1.25rem;line-height:1.2;transition:transform .15s}` +
    `.pr .ic{width:24px;height:24px}.pr .lb{flex:1;min-width:0;overflow-wrap:anywhere}` +
    `.pr .ar{display:grid;place-items:center;flex:none;width:42px;height:42px;border-radius:50%;border:1.75px solid currentColor}` +
    `.pr .ar .ic{width:20px;height:20px;transition:transform .2s}` +
    `.pr:active{transform:translateY(1px) scale(.99)}.pr:hover .ar .ic{transform:translateX(2px)}` +
    (fb
      ? buttons('', grid, hs)
      : // the ruled list
        `.bk{margin-top:8px}.bk>.it{padding:12px 2px;border-bottom:1px solid var(--line)}.bk>:not(.it)+.it{border-top:1px solid var(--line);margin-top:calc(var(--_g) + 6px)}` +
        `.it:active{background:var(--line)}` +
        buttons('.fb ')) +
    (grid
      ? // two-up: the row becomes a tile, icon over label, no arrow
        `.it{display:flex;flex-direction:column;align-items:var(--justify,flex-start);justify-content:center;gap:6px;min-height:var(--btn-h,62px)}` +
        `.it .lb{flex:none;min-width:0;font-weight:600;line-height:1.3;overflow-wrap:anywhere}`
      : `.it{display:flex;align-items:center;gap:16px;min-height:var(--btn-h,62px)}` +
        `.it .lb{flex:1;min-width:0;font-weight:600;line-height:1.3;overflow-wrap:anywhere}` +
        // will-change gives the arrow its own layer: without one Chrome cuts the clip with a hard edge
        `.it::after{content:"";flex:none;${ARROW};will-change:transform;transition:transform .2s}.it:hover::after{transform:translateX(3px)}`) +
    `.dt{display:block;margin-top:2px;font-weight:400;font-size:.9375rem;font-variant-numeric:tabular-nums}` +
    // blocks, in the card's own voice: a heading starts from a tap point (the accent dot with one
    // ripple ring), socials are the monogram ring at thumb size, a video takes the button's corner
    `.bh{display:flex;align-items:baseline;justify-content:var(--justify,flex-start);gap:14px;margin-top:38px;font-size:1.6rem;letter-spacing:-.018em}` +
    `.bh::before{content:"";flex:none;width:10px;height:10px;margin-left:5px;border-radius:50%;background:var(--accent);` +
    `box-shadow:0 0 0 5px var(--bg),0 0 0 6px var(--ink);transform:translateY(-.12em)}` +
    `.bt{max-width:34ch;font-size:1.0625rem;line-height:1.5}.bk>.it+.bt,.bk>.it+.bs,.bk>.it+.bv{margin-top:26px}` +
    `.bs{gap:12px;justify-content:var(--justify,flex-start)}.bs a{width:52px;height:52px;transition:background .15s}.bs a:active{background:var(--ink);color:var(--bg)}` +
    `.bv iframe{border-radius:min(var(--btn-r,18px),18px);box-shadow:0 0 0 1px var(--line)}` +
    // branches
    `.br{margin-top:40px}.sh{font:var(--heading-weight) 1.5rem/1.1 var(--font-heading);letter-spacing:-.01em;margin-bottom:6px}` +
    `.br li{padding:16px 0;border-bottom:1px solid var(--line)}.br h3{font-size:1.0625rem;font-weight:700;overflow-wrap:anywhere}` +
    `.br p{overflow-wrap:anywhere}.hr{display:flex;align-items:center;justify-content:var(--justify,flex-start);gap:8px;margin-top:4px;font-variant-numeric:tabular-nums}` +
    `.dir{display:inline-flex;align-items:center;gap:6px;min-height:48px;margin-top:8px;padding:0 18px;border:1.75px solid var(--ink);border-radius:var(--btn-r,999px);font-weight:600}` +
    `.hr .ic,.dir .ic{width:18px;height:18px}` +
    `.ft{margin-top:36px}.cr{display:inline-flex;align-items:center;min-height:48px;font-size:.875rem;letter-spacing:.01em}` +
    `.cr strong{margin-left:.3em;font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:1rem}` +
    // centred: the mark and the measured text move to the middle
    (ac ? `.lg,.tg,.bt{margin-left:auto;margin-right:auto}` : '') +
    // over a backdrop the column is the card: frosted page colour (no blur over video, it re-blurs every frame)
    (bg
      ? `[data-bg] .cd{width:calc(100% - 24px);min-height:0;margin:12px auto;border-radius:28px;` +
        (bg === 'video'
          ? `background:color-mix(in srgb,var(--bg) 90%,transparent)}`
          : `background:color-mix(in srgb,var(--bg) 80%,transparent);-webkit-backdrop-filter:blur(18px) saturate(1.2);backdrop-filter:blur(18px) saturate(1.2)}`)
      : '') +
    // desktop: the column is the card, lifted off a darker table
    `@media (min-width:600px){html{background:color-mix(in srgb,var(--bg) 78%,#000)}body{background:none;padding:7vh 24px}` +
    (c.cover && !inset ? `.cv{margin:0 -32px${shape ? '' : ';border-radius:28px 28px 0 0'}}` : '') +
    `.cd{min-height:0;border-radius:28px;background:var(--bg);padding:0 32px 36px;` +
    `box-shadow:0 0 0 1px var(--line),0 40px 80px -30px color-mix(in srgb,#000 55%,transparent)}${ripple && !ac ? '.cd::before{left:-184px}' : ''}}`
  )
}

export default {
  label: 'Card',
  render,
  css,
  supports: ['buttonShape', 'buttonFill', 'linkLayout', 'align', 'logoShape', 'coverShape', 'spacing', 'shadow'],
  styleDefaults: DEFAULTS,
}
