// Look: receipt. The page is a printed slip lying on the counter.
// Rules:
//   Paper     one narrow slip in --bg with torn zigzag ends (16px teeth), on a counter that is
//             18% ink in bg. Works either way round: dark paper sits on a lighter counter.
//   Line      1.5px dashed ink, the only divider. Solid lines only frame pictures.
//   Corners   8px on the few boxed things (socials, directions, pictures). The slip is square.
//   Type      centred head, then numbered line items with tabular figures; section titles sit
//             inside a dashed rule.
//   Accent    the main link only, cut as a ticket stub with punched sides.
//   Foot      a barcode and the page's own address, like the store copy.
//   Style     a slip is printed: line items are not buttons, so there is no fill, shadow or two-up
//             layout to choose. Shape reaches the stub and the boxed things (a pill stub loses its
//             punched sides). The paper is opaque, so any backdrop is simply the counter it lies on.
import { blockHtml, plainLink, branchesHtml, coverHtml, logoHtml, nameSize, credit, styleOf, BASE } from './shared.js'

const DEFAULTS = { align: 'center', logoShape: 'circle' }

function render(ctx) {
  const { client: c, esc } = ctx
  const cr = credit(ctx, 'cr')
  const block = (b) => (b.type === 'link' && !b.primary ? plainLink(ctx, b, 'it') : blockHtml(ctx, b, 'pr'))
  const address = ctx.pageUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const st = styleOf(ctx, DEFAULTS)
  const cls = (st.align === 'left' ? ' al' : '') + (st.buttonShape === 'pill' ? ' pp' : '')
  return (
    `<main class="rc${cls}">` +
    `<header class="hd">${logoHtml(ctx, 64)}<h1 class="nm ${nameSize(c.name)}">${esc(c.name)}</h1>` +
    (c.tagline ? `<p class="tg">${esc(c.tagline)}</p>` : '') +
    `</header>` +
    coverHtml(ctx) +
    `<div class="bk">${c.blocks.map(block).join('')}</div>` +
    branchesHtml(ctx) +
    `<footer class="ft"><span class="bc" aria-hidden="true"></span><p class="ur">${esc(address)}</p>${cr}</footer>` +
    `</main>`
  )
}

const HEAD = `font-family:var(--font-heading);font-weight:var(--heading-weight)`
const TEETH = (from, at) => `conic-gradient(from ${from} at 50% ${at},var(--bg) 90deg,transparent 0) 50% 0/16px 8px repeat-x`
const NOTCH = (x) => `radial-gradient(circle at ${x} 50%,transparent 9px,black 9.5px) ${x} 0/51% 100% no-repeat`

const css = () =>
  BASE +
  `html,body{background:color-mix(in srgb,var(--ink) 18%,var(--bg))}body{padding:0 14px}` +
  `.rc{position:relative;max-width:400px;margin:28px auto calc(36px + env(safe-area-inset-bottom));padding:20px 22px 22px;background:var(--bg);` +
  `font-variant-numeric:tabular-nums;--d:1.5px dashed var(--ink);filter:drop-shadow(0 10px 12px color-mix(in srgb,#000 22%,transparent));` +
  `animation:print .8s steps(16) backwards}` +
  `@keyframes print{from{clip-path:inset(-40px -40px 100% -40px)}to{clip-path:inset(-40px)}}` +
  `.rc::before,.rc::after{content:"";position:absolute;left:0;right:0;height:8px}` +
  `.rc::before{bottom:calc(100% - .5px);background:${TEETH('135deg', '0')}}` +
  `.rc::after{top:calc(100% - .5px);background:${TEETH('-45deg', '100%')}}` +
  `.hd{padding-bottom:18px;border-bottom:var(--d);text-align:var(--align,center)}` +
  `.lg{width:64px;height:64px;margin:0 auto 14px;border-radius:var(--logo-r,50%);object-fit:cover}` +
  `.nm{${HEAD};letter-spacing:-.02em;overflow-wrap:anywhere;text-wrap:balance}` +
  `.n1{font-size:2.6rem;line-height:1}.n2{font-size:2rem;line-height:1.06}.n3{font-size:1.5rem;line-height:1.14}` +
  `.tg{margin-top:8px;font-family:var(--font-tagline);line-height:1.4;overflow-wrap:anywhere;text-wrap:balance}` +
  `.cv{width:var(--cover-w,100%);margin:18px auto 0;aspect-ratio:var(--cover-ratio,16/10);overflow:hidden;border:1.5px solid var(--ink);border-radius:var(--cover-r,8px)}.cv img{width:100%;height:100%;object-fit:cover}` +
  // the stub
  `.bk{counter-reset:n}` +
  `.pr{display:flex;align-items:center;gap:12px;min-height:calc(var(--btn-h,56px) + 20px);margin-top:18px;padding:0 20px;border-radius:min(var(--btn-r,8px),38px);background:var(--accent);color:var(--on-accent);` +
  `font-weight:700;font-size:1.25rem;line-height:1.2;-webkit-mask:${NOTCH('0')},${NOTCH('100%')};mask:${NOTCH('0')},${NOTCH('100%')}}` +
  `.pr>.ic{width:24px;height:24px}.pr .lb{flex:1;min-width:0;padding:12px 0;overflow-wrap:anywhere}` +
  `.pr .ar{display:grid;place-items:center;align-self:stretch;padding-left:14px;border-left:1.5px dashed var(--on-accent)}.pr:active{filter:brightness(.92)}` +
  // line items
  `.it{counter-increment:n;display:grid;grid-template-columns:2.1rem 1fr 22px;gap:0 8px;align-items:start;min-height:var(--btn-h,56px);padding:calc(var(--gap,14px) + 1px) 0 var(--gap,14px);border-bottom:var(--d);line-height:1.3}` +
  `.bk>:not(.it,.bh,.pr)+.it{margin-top:18px;border-top:var(--d)}.bk>.pr+.it{margin-top:6px}` +
  `.it::before{content:counter(n,decimal-leading-zero);font-weight:700}` +
  `.it .lb{min-width:0;font-weight:600;overflow-wrap:anywhere}.it .k{order:1}.it:active .lb{text-decoration:underline;text-underline-offset:.2em}` +
  `.dt{display:block;margin-top:2px;font-weight:400;font-size:.9375rem}` +
  // section title inside the dashed rule
  `.bh,.sh{display:flex;align-items:center;gap:12px;margin-top:26px;${HEAD};font-size:1.3rem;line-height:1.2;text-align:center;overflow-wrap:anywhere}` +
  `.bh::before,.bh::after,.sh::before,.sh::after{content:"";flex:1;min-width:14px;border-top:var(--d)}` +
  `.bt{margin-top:14px;text-align:var(--align,center);overflow-wrap:anywhere;text-wrap:balance}` +
  `.bs{display:flex;flex-wrap:wrap;justify-content:var(--justify,center);gap:10px;margin-top:20px}` +
  `.bs a{display:grid;place-items:center;width:50px;height:50px;border:var(--d);border-radius:min(var(--btn-r,8px),25px)}.bs a:active{border-style:solid}` +
  `.bv{margin-top:20px;overflow:hidden;border:1.5px solid var(--ink);border-radius:8px}` +
  `.bv iframe{display:block;width:100%;height:auto;aspect-ratio:16/9;border:0}.bv.vt{max-width:328px;margin-left:auto;margin-right:auto}.bv.vt iframe{aspect-ratio:9/16}` +
  // branches: name left, hours right, like item and price
  `.br li{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:14px 0;border-bottom:var(--d)}` +
  `.br h3{font-size:1.0625rem;font-weight:700;overflow-wrap:anywhere}.hr{grid-area:1/2;max-width:11rem;font-weight:600;text-align:right;overflow-wrap:anywhere}.hr .ic{display:none}` +
  `.ad{grid-column:1/3;overflow-wrap:anywhere}` +
  `.dir{grid-column:1/3;justify-self:start;display:inline-flex;align-items:center;gap:6px;min-height:48px;margin-top:10px;padding:0 14px;border:var(--d);border-radius:min(var(--btn-r,8px),24px);font-weight:700}` +
  `.dir .ic{width:18px;height:18px}.dir:active{border-style:solid}` +
  // style options: left-set, a title keeps only the rule after it; a pill stub is not punched
  `.al .lg,.al .cv{margin-left:0}.al .bh::before,.al .sh::before{display:none}.pp .pr{-webkit-mask:none;mask:none}` +
  // store copy
  `.ft{margin-top:28px;text-align:center}` +
  `.bc{display:block;width:min(232px,84%);height:46px;margin:0 auto;background:repeating-linear-gradient(90deg,var(--ink) 0 2px,transparent 2px 5px,` +
  `var(--ink) 5px 6px,transparent 6px 8px,var(--ink) 8px 12px,transparent 12px 14px,var(--ink) 14px 15px,transparent 15px 19px,var(--ink) 19px 21px,transparent 21px 22px)}` +
  `.ur{margin-top:8px;font-size:.75rem;font-weight:600;letter-spacing:.1em;overflow-wrap:anywhere}` +
  `.cr{display:inline-flex;align-items:center;min-height:48px;margin-top:6px;font-size:.875rem}.cr strong{margin-left:.3em;${HEAD};font-size:1rem}`

export default {
  label: 'Receipt',
  render,
  css,
  supports: ['buttonShape', 'align', 'logoShape', 'coverShape', 'spacing'],
  styleDefaults: DEFAULTS,
}
