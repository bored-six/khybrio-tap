// Look: masthead. A magazine front page.
// Rules, so the next piece can be drawn without guessing:
//   Corners   square everywhere. No shadows, no fills except the one accent block.
//   Rules     ink only. 5px = the page opens or closes; 1px = everything else.
//   Type      name is a centred nameplate; links are a numbered table of contents in the
//             heading face; body copy opens with a two-line drop cap.
//   Accent    exactly twice: the lead story (primary link) and the tab hanging off a section rule.
import { blockHtml, plainLink, branchesHtml, coverHtml, logoHtml, nameSize, credit, BASE } from './shared.js'

function render(ctx) {
  const { client: c, esc } = ctx
  // dateline: where the business is, the way a paper names its city
  const place = c.branches.length ? c.branches[0].name : ''
  const logo = logoHtml(ctx, 44)
  const cr = credit(ctx, 'cr')
  const block = (b) => (b.type === 'link' && !b.primary ? plainLink(ctx, b, 'it') : blockHtml(ctx, b, 'pr'))
  return (
    `<main class="mg">` +
    `<header class="hd">` +
    (logo || place ? `<div class="tp">${logo}${place ? `<span class="dl">${esc(place)}</span>` : ''}</div>` : '') +
    `<h1 class="nm ${nameSize(c.name)}">${esc(c.name)}</h1>` +
    (c.tagline ? `<p class="tg">${esc(c.tagline)}</p>` : '') +
    `</header>` +
    coverHtml(ctx) +
    `<div class="bk">${c.blocks.map(block).join('')}</div>` +
    branchesHtml(ctx) +
    (cr ? `<footer class="ft">${cr}</footer>` : '') +
    `</main>`
  )
}

const HEAD = `font-family:var(--font-heading);font-weight:var(--heading-weight)`

const css = () =>
  BASE +
  `.mg{max-width:520px;margin:0 auto;padding:14px 20px calc(28px + env(safe-area-inset-bottom));--r:1px solid var(--ink);` +
  `--tint:color-mix(in srgb,var(--ink) 14%,var(--bg))}` +
  `.hd{border-top:5px solid var(--ink);border-bottom:var(--r);text-align:center}` +
  `.tp{display:flex;align-items:center;gap:12px;min-height:58px;padding:7px 0;border-bottom:var(--r)}` +
  `.lg{width:44px;height:44px;object-fit:contain}` +
  `.dl{margin-left:auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;` +
  `font-size:.75rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase}` +
  `.nm{padding:20px 0 16px;${HEAD};letter-spacing:-.035em;overflow-wrap:anywhere;text-wrap:balance}` +
  `.n1{font-size:clamp(3.4rem,19vw,5.4rem);line-height:.9}.n2{font-size:clamp(2.5rem,12vw,3.4rem);line-height:.98}.n3{font-size:1.9rem;line-height:1.08}` +
  `.tg{padding:10px 0;border-top:var(--r);font-family:var(--font-tagline);font-size:1rem;line-height:1.4;overflow-wrap:anywhere;text-wrap:balance}` +
  `.cv{margin:20px -20px 0;aspect-ratio:4/3;overflow:hidden;background:var(--tint)}.cv img{width:100%;height:100%;object-fit:cover}` +
  // lead story
  `.bk{margin-top:4px;counter-reset:n}` +
  `.pr{display:flex;align-items:center;gap:14px;min-height:78px;margin-top:20px;padding:16px 18px;background:var(--accent);color:var(--on-accent);` +
  `${HEAD};font-size:1.6rem;line-height:1.08;letter-spacing:-.015em}` +
  `.pr>.ic{width:26px;height:26px}.pr .lb{flex:1;min-width:0;overflow-wrap:anywhere}.pr .ar .ic{display:block;transition:transform .2s}` +
  `.pr:hover .ar .ic{transform:translateX(3px)}.pr:active{filter:brightness(.92)}` +
  // table of contents
  `.it{counter-increment:n;display:grid;grid-template-columns:2.6rem 1fr 22px;gap:0 8px;align-items:start;min-height:60px;padding:15px 0 14px;border-bottom:var(--r);` +
  `${HEAD};font-size:1.3rem;line-height:1.2}` +
  `.bk>.it:first-child,.bk>:not(.it)+.it{margin-top:20px;border-top:var(--r)}.bk>.bh+.it{margin-top:12px;border-top:0}` +
  `.it::before{content:counter(n,decimal-leading-zero);font-variant-numeric:tabular-nums}` +
  `.it .lb{min-width:0;overflow-wrap:anywhere}.it .k{order:1;padding-top:3px}.it:active{background:var(--tint)}` +
  `.dt{display:block;margin-top:3px;font:400 .9375rem/1.35 var(--font-body);font-variant-numeric:tabular-nums}` +
  // section head: rule, accent tab hanging off it, title
  `.bh,.sh{margin-top:40px;border-top:var(--r);${HEAD};font-size:1.9rem;line-height:1.08;letter-spacing:-.02em;overflow-wrap:anywhere;text-wrap:balance}` +
  `.bh::before,.sh::before{content:"";display:block;width:44px;height:7px;margin-bottom:14px;background:var(--accent)}` +
  `.bt{display:flow-root;margin-top:14px;font-size:1.0625rem;line-height:1.55;overflow-wrap:anywhere}` +
  `.bt::first-letter{float:left;padding:.07em .11em 0 0;${HEAD};font-size:3.2rem;line-height:.9}` +
  // socials: one ruled strip of equal cells
  `.bs{display:flex;flex-wrap:wrap;gap:1px;margin-top:24px;padding:1px;background:var(--ink)}` +
  `.bs a{display:grid;place-items:center;flex:1 1 52px;height:56px;background:var(--bg)}.bs a:active{background:var(--tint)}` +
  // video: a matted plate
  `.bv{margin-top:24px;padding:6px;border:var(--r)}.bv iframe{display:block;width:100%;height:auto;aspect-ratio:16/9;border:0;background:var(--tint)}` +
  `.bv.vt{max-width:339px;margin-left:auto;margin-right:auto}.bv.vt iframe{aspect-ratio:9/16}` +
  // directory
  `.br li{padding:16px 0;border-bottom:var(--r)}.br h3{${HEAD};font-size:1.3rem;line-height:1.2;overflow-wrap:anywhere}` +
  `.ad{margin-top:4px;overflow-wrap:anywhere}.hr{display:flex;align-items:center;gap:8px;margin-top:4px;font-variant-numeric:tabular-nums}.hr .ic,.dir .ic{width:18px;height:18px}` +
  `.dir{display:inline-flex;align-items:center;gap:6px;min-height:48px;font-weight:700;text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:.28em}` +
  // colophon
  `.ft{margin-top:36px;border-top:5px solid var(--ink);text-align:center}.cr{display:inline-flex;align-items:center;min-height:52px;font-size:.875rem}` +
  `.cr strong{margin-left:.3em;${HEAD};font-size:1rem}`

export default { label: 'Magazine', render, css }
