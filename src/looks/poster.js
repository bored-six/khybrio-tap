// Look: poster. A gig poster pasted on a wall.
// Rules:
//   Corners   square, except the logo sticker (a circle).
//   Line      3px ink on everything that can be tapped or framed.
//   Depth     hard offset shadows only, down-right, no blur: 5px ink on slabs, 7px on frames.
//             Pressing a slab pushes it into its shadow.
//   Type      the name fills the accent field edge to edge and stacks; no forced capitals,
//             because the client may pick a script face.
//   Tilt      stickers and tape sit 1.5 to 8 degrees off; anything tappable stays level.
//   Accent    the headline field, the underline on headings, the shadow under the main slab and videos.
import { blockHtml, plainLink, branchesHtml, coverHtml, logoHtml, nameSize, credit, BASE } from './shared.js'

function render(ctx) {
  const { client: c, esc } = ctx
  const cr = credit(ctx, 'cr')
  const block = (b) => (b.type === 'link' ? plainLink(ctx, b, b.primary ? 'it pr' : 'it') : blockHtml(ctx, b))
  return (
    `<main class="po">` +
    `<header class="hd">${logoHtml(ctx, 76)}<h1 class="nm ${nameSize(c.name)}">${esc(c.name)}</h1></header>` +
    (c.tagline ? `<p class="tg">${esc(c.tagline)}</p>` : '') +
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
  `.po{max-width:480px;margin:0 auto;padding-bottom:calc(30px + env(safe-area-inset-bottom));--b:3px solid var(--ink)}` +
  `.hd{padding:26px 20px 30px;background:var(--accent);color:var(--on-accent);border-bottom:var(--b)}` +
  `.lg{width:76px;height:76px;margin:0 0 20px auto;border:var(--b);border-radius:50%;background:var(--bg);object-fit:cover;` +
  `box-shadow:4px 4px 0 var(--ink);transform:rotate(8deg)}` +
  `.nm{${HEAD};letter-spacing:-.04em;overflow-wrap:anywhere;transform-origin:0 100%;animation:stamp .45s cubic-bezier(.2,1.5,.4,1) both}` +
  `@keyframes stamp{from{transform:scale(1.14) rotate(-3deg);opacity:0}}` +
  `.n1{font-size:clamp(3.6rem,21vw,6rem);line-height:.86}.n2{font-size:clamp(2.6rem,13vw,3.8rem);line-height:.94}.n3{font-size:clamp(1.9rem,9vw,2.6rem);line-height:1.02}` +
  // tagline: a strip of ink tape under the field
  `.tg{padding:12px 20px 13px;background:var(--ink);color:var(--bg);font:600 1.0625rem/1.35 var(--font-tagline);overflow-wrap:anywhere}` +
  `.cv{margin:28px 24px 0 20px;aspect-ratio:4/3;overflow:hidden;border:var(--b);box-shadow:7px 7px 0 var(--ink);transform:rotate(-1.5deg)}` +
  `.cv img{width:100%;height:100%;object-fit:cover}` +
  // slabs
  `.bk{display:grid;gap:15px;margin-top:34px;padding:0 25px 0 20px}.bk>*{min-width:0}` +
  `.it{display:flex;min-height:64px;border:var(--b);background:var(--bg);box-shadow:5px 5px 0 var(--ink);font-weight:700;font-size:1.0625rem;line-height:1.25;` +
  `transition:transform .1s,box-shadow .1s}` +
  `.it:active{transform:translate(4px,4px);box-shadow:1px 1px 0 var(--ink)}` +
  `.k{display:grid;place-items:center;flex:none;width:56px;border-right:var(--b)}` +
  `.lb{flex:1;align-self:center;min-width:0;padding:10px 14px;overflow-wrap:anywhere}` +
  `.dt{display:block;margin-top:2px;font-weight:500;font-size:.9375rem;font-variant-numeric:tabular-nums}` +
  // the main slab: inverted, standing on the accent
  `.pr{min-height:84px;background:var(--ink);color:var(--bg);box-shadow:7px 7px 0 var(--accent);${HEAD};font-size:1.55rem;line-height:1.08;letter-spacing:-.015em}` +
  `.pr:active{transform:translate(5px,5px);box-shadow:2px 2px 0 var(--accent)}` +
  `.pr .k{width:64px;border-color:var(--bg)}.pr .ic{width:28px;height:28px}` +
  `.bh{margin-top:20px;padding-bottom:.18em;${HEAD};font-size:2.3rem;line-height:1.04;letter-spacing:-.03em;overflow-wrap:anywhere;` +
  `text-decoration:underline;text-decoration-color:var(--accent);text-decoration-thickness:.15em;text-underline-offset:.13em;text-decoration-skip-ink:none}` +
  `.bt{padding-left:14px;border-left:var(--b);font-weight:500;font-size:1.0625rem;overflow-wrap:anywhere}` +
  `.bs{display:flex;flex-wrap:wrap;gap:13px}` +
  `.bs a{display:grid;place-items:center;width:54px;height:54px;border:var(--b);background:var(--bg);box-shadow:4px 4px 0 var(--ink);transition:transform .1s,box-shadow .1s}` +
  `.bs a:active{transform:translate(3px,3px);box-shadow:1px 1px 0 var(--ink)}` +
  `.bv{margin:4px 2px 6px 0;border:var(--b);box-shadow:7px 7px 0 var(--accent);background:var(--ink)}` +
  `.bv iframe{display:block;width:100%;height:auto;aspect-ratio:16/9;border:0}.bv.vt{width:100%;max-width:331px;justify-self:center}.bv.vt iframe{aspect-ratio:9/16}` +
  // branches: a tape label, then framed cards
  `.br{margin-top:46px;padding:0 20px}` +
  `.sh{display:inline-block;padding:7px 14px 8px;background:var(--ink);color:var(--bg);${HEAD};font-size:1.4rem;line-height:1.1;transform:rotate(-2deg)}` +
  `.br li{margin-top:16px;padding:16px;border:var(--b)}.br h3{font-size:1.25rem;font-weight:700;line-height:1.2;overflow-wrap:anywhere}` +
  `.ad{margin-top:4px;overflow-wrap:anywhere}.hr{display:flex;align-items:center;gap:8px;margin-top:4px;font-weight:600;font-variant-numeric:tabular-nums}.hr .ic,.dir .ic{width:18px;height:18px}` +
  `.dir{display:inline-flex;align-items:center;gap:6px;min-height:48px;margin-top:12px;padding:0 16px;border:var(--b);box-shadow:4px 4px 0 var(--ink);font-weight:700}` +
  `.dir:active{transform:translate(3px,3px);box-shadow:1px 1px 0 var(--ink)}` +
  `.ft{margin-top:34px;padding:0 20px}.cr{display:inline-flex;align-items:center;min-height:48px;font-size:.875rem;font-weight:600}` +
  `.cr strong{margin-left:.3em;${HEAD};font-size:1rem}` +
  // desktop: the poster hangs on a wall
  `@media (min-width:600px){html{background:color-mix(in srgb,var(--ink) 20%,var(--bg))}body{padding:44px 24px;background:none}` +
  `.po{background:var(--bg);border:var(--b);box-shadow:12px 12px 0 var(--ink)}}`

export default { label: 'Poster', render, css }
