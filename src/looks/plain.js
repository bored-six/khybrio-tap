// Look: plain. Nothing drawn that the owner did not choose.
// One column: mark, name, a line, the links. No rules, rings, pseudo-elements or motion; the
// background and the eight style options carry the page, and hierarchy comes only from the
// client's faces, weight and space.
// Rules for the next piece:
// 1. One material. Every tappable surface (link, social, Directions) is the same --btn-* fill,
//    line, blur, corner and shadow. Only the primary differs, and only by being accent.
// 2. A corner is never rounder than half the control's minimum height: a pill stays a pill on
//    one line and becomes a soft box, not a lozenge, when a label wraps.
// 3. A row is icon / label / arrow in a 22 / 1fr / 22 grid: centred labels sit optically centred,
//    left labels start on one edge. In a two-up grid the row becomes a tile, icon over label.
// 4. Text is bare and full ink. Over a photo or video it carries a halo in the page's own bg
//    colour: invisible on a flat page, a legible edge over the busiest pixel.
// 5. A hard shadow is ink, so the material first takes a hairline of page colour (an ink button
//    would otherwise sink into it), and the gap never drops under 12px: three shadows of clear air.
import { linkOpen, detail, detailHtml, nameSize, credit, coverHtml, logoHtml, branchesHtml, blockHtml, HARD, BASE } from './shared.js'

function render(ctx) {
  const { client: c, esc } = ctx
  const st = c.style || {}
  // Runs of plain links between other blocks: the last of an odd run takes the whole row.
  const wide = new Set()
  let run = []
  const close = () => {
    if (run.length % 2) wide.add(run[run.length - 1])
    run = []
  }
  c.blocks.forEach((b, i) => (b.type === 'link' && !b.primary ? run.push(i) : close()))
  close()

  const block = (b, i) => {
    if (b.type !== 'link') return blockHtml(ctx, b)
    const d = detail(b)
    return (
      `${linkOpen(ctx, b, b.primary ? 'b pr' : wide.has(i) ? 'b w' : 'b')}${ctx.icon(b.kind)}` +
      `<span class="lb">${esc(b.label)}${d ? `<span class="dt">${detailHtml(ctx, d)}</span>` : ''}</span>` +
      `<span class="ar">${ctx.icon('arrow')}</span></a>`
    )
  }
  const cover = coverHtml(ctx)
  const cr = credit(ctx, 'cr')
  return (
    `<main class="pl${st.linkLayout === 'grid' ? ' g' : ''}${st.coverShape === 'banner' ? ' bn' : ''}${st.shadow === 'hard' ? ' hs' : ''}">` +
    `<header class="hd">${logoHtml(ctx, 88)}<h1 class="nm ${nameSize(c.name)}">${esc(c.name)}</h1>` +
    (c.tagline ? `<p class="tg">${esc(c.tagline)}</p>` : '') +
    cover +
    `</header>` +
    `<div class="bk">${c.blocks.map(block).join('')}</div>` +
    branchesHtml(ctx) +
    (cr ? `<footer class="ft">${cr}</footer>` : '') +
    `</main>`
  )
}

// The material, written once. --m is the corner cap (rule 2).
const M =
  `background:var(--_bg);color:var(--_ink);border:1.5px solid var(--_ln);box-shadow:var(--_sh);` +
  `-webkit-backdrop-filter:var(--_bl);backdrop-filter:var(--_bl);text-shadow:none`

const css = () =>
  BASE +
  `.pl{--_r:var(--btn-r,14px);--_bg:var(--btn-bg,color-mix(in srgb,var(--ink) 10%,var(--bg)));--_ink:var(--btn-ink,var(--ink));` +
  `--_ln:var(--btn-line,transparent);--_bl:var(--btn-blur,none);--_sh:var(--btn-shadow,none);--_h:var(--btn-h,62px);--_g:var(--gap,14px);` +
  `--_j:var(--justify,center);max-width:520px;min-height:100vh;min-height:100svh;margin:0 auto;display:flex;flex-direction:column;` +
  `padding:max(56px,env(safe-area-inset-top)) 20px calc(28px + env(safe-area-inset-bottom));text-align:var(--align,center)}` +
  `[data-bg=image] .pl,[data-bg=video] .pl{text-shadow:0 0 1px var(--bg),0 0 10px var(--bg),0 0 26px var(--bg)}` +
  // header: a column whose cross axis follows the alignment, so mark and cover move with the text
  `.hd{display:flex;flex-direction:column;align-items:var(--_j)}` +
  `.lg{width:88px;height:88px;margin-bottom:20px;border-radius:var(--logo-r,50%);object-fit:contain}` +
  `.nm{max-width:100%;font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:-.02em;overflow-wrap:anywhere;text-wrap:balance}` +
  `.n1{font-size:2.5rem;line-height:1.05}.n2{font-size:2rem;line-height:1.1}.n3{font-size:1.5rem;line-height:1.18}` +
  `.tg{margin-top:10px;max-width:34ch;font-family:var(--font-tagline);font-size:1.0625rem;line-height:1.45;overflow-wrap:anywhere;text-wrap:pretty}` +
  `.cv{width:var(--cover-w,100%);max-width:100%;aspect-ratio:var(--cover-ratio,16/10);margin-top:26px;border-radius:var(--cover-r,20px);overflow:hidden}` +
  `.cv img{width:100%;height:100%;object-fit:cover}` +
  `.bn .cv{width:calc(100% + 40px);max-width:none;margin-left:-20px;margin-right:-20px}` +
  // blocks: one grid. Links take a cell, everything else (and the primary, and an odd last link) the row
  `.bk{display:grid;grid-template-columns:repeat(var(--link-cols,1),minmax(0,1fr));gap:var(--_g);margin-top:30px}` +
  `.bk>*{grid-column:1/-1}.bk>.b{grid-column:auto}.bk>.pr,.bk>.w{grid-column:1/-1}` +
  `.b{display:grid;grid-template-columns:22px minmax(0,1fr) 22px;align-items:center;gap:12px;min-height:var(--_h);padding:9px 18px;` +
  `border-radius:min(var(--_r),calc(var(--_h)/2));${M}}` +
  `.b:active,.bs a:active,.dir:active{opacity:.72}` +
  `.lb{font-weight:600;line-height:1.25;overflow-wrap:anywhere}` +
  `.dt{display:block;margin-top:2px;font-weight:400;font-size:.875rem;font-variant-numeric:tabular-nums}` +
  `.ar .ic{display:block;width:18px;height:18px;margin-left:auto}` +
  `.pr{background:var(--accent);color:var(--on-accent);border-color:transparent;-webkit-backdrop-filter:none;backdrop-filter:none}` +
  `.pr .lb{font-weight:700;font-size:1.125rem}` +
  // two-up: the row becomes a tile, icon over label, no arrow (rule 3)
  `.g .b:not(.pr,.w){display:flex;flex-direction:column;align-items:var(--_j);justify-content:center;gap:8px;padding:14px 16px}` +
  `.g .b:not(.pr,.w) .ar{display:none}` +
  `.bh{margin-top:18px;font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:1.375rem;line-height:1.2;` +
  `letter-spacing:-.01em;overflow-wrap:anywhere;text-wrap:balance}.bk>.bh:first-child{margin-top:0}` +
  `.bt{justify-self:var(--_j);max-width:60ch;line-height:1.55;overflow-wrap:anywhere}` +
  `.bs{display:flex;flex-wrap:wrap;justify-content:var(--_j);gap:10px}` +
  `.bs a{display:grid;place-items:center;width:52px;height:52px;border-radius:min(var(--_r),26px);${M}}` +
  `.bv iframe{display:block;width:100%;height:auto;aspect-ratio:16/9;border:0;border-radius:min(var(--_r),20px);background:var(--line)}` +
  `.bv.vt iframe{aspect-ratio:9/16;max-width:325px;margin:0 auto}` +
  // branches: bare text, one Directions control in the same material
  `.br{margin-top:44px}.sh{font:var(--heading-weight) 1.375rem/1.2 var(--font-heading);letter-spacing:-.01em}` +
  `.br li{margin-top:20px}.br h3{font-size:1.0625rem;font-weight:700;line-height:1.3;overflow-wrap:anywhere}` +
  `.ad{margin-top:2px;overflow-wrap:anywhere;text-wrap:pretty}` +
  `.hr{display:flex;align-items:center;justify-content:var(--_j);gap:8px;margin-top:2px;font-variant-numeric:tabular-nums}.hr .ic{width:18px;height:18px}` +
  `.dir{display:inline-flex;align-items:center;gap:6px;min-height:48px;margin-top:10px;padding:0 18px;border-radius:min(var(--_r),24px);font-weight:600;${M}}` +
  `.dir .ic{width:18px;height:18px}` +
  `.hs{--_g:max(var(--gap,14px),12px)}.hs .b,.hs .bs a,.hs .dir{${HARD}}` +
  `.ft{margin-top:auto;padding-top:36px}.cr{display:inline-flex;align-items:center;min-height:48px;font-size:.875rem}` +
  `.cr strong{margin-left:.3em;font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:1rem}` +
  `@media (min-width:600px){.pl{padding-top:72px}}`

export default {
  label: 'Plain',
  render,
  css,
  supports: ['buttonShape', 'buttonFill', 'linkLayout', 'align', 'logoShape', 'coverShape', 'spacing', 'shadow'],
  styleDefaults: {
    buttonShape: 'rounded',
    buttonFill: 'soft',
    linkLayout: 'list',
    align: 'center',
    logoShape: 'circle',
    coverShape: 'rounded',
    spacing: 'comfortable',
    shadow: 'none',
  },
}
