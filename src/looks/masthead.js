// Look: masthead. A magazine front page.
// Rules, so the next piece can be drawn without guessing:
//   Corners   square everywhere. No shadows, no fills except the one accent block.
//   Rules     ink only. 5px = the page opens or closes; 1px = everything else.
//   Type      name is a centred nameplate; links are a numbered table of contents in the
//             heading face; body copy opens with a two-line drop cap.
//   Accent    exactly twice: the lead story (primary link) and the tab hanging off a section rule.
//   Style     print is flat: no shadow option. A button fill sets the contents as a reversed, tinted or
//             frosted box, the way a cover boxes its contents; outline is the plain ruled table. Two-up
//             sets the contents in two columns, number over title. Over a photo or video the page is a
//             cover: type sits straight on the picture, with the halo.
import { blockHtml, plainLink, branchesHtml, coverHtml, logoHtml, nameSize, credit, styleOf, linkRuns, halo, BASE } from './shared.js'

const DEFAULTS = { buttonShape: 'square', buttonFill: 'outline', linkLayout: 'list', align: 'center', logoShape: 'square' }

function render(ctx) {
  const { client: c, esc } = ctx
  // dateline: where the business is, the way a paper names its city
  const place = c.branches.length ? c.branches[0].name : ''
  const logo = logoHtml(ctx, 44)
  const cr = credit(ctx, 'cr')
  const st = styleOf(ctx, DEFAULTS)
  const grid = st.linkLayout === 'grid'
  const { wide, top } = linkRuns(c.blocks)
  const block = (b, i) =>
    b.type === 'link' && !b.primary ? plainLink(ctx, b, 'it' + (grid && top.has(i) ? ' t' : '') + (grid && wide.has(i) ? ' w' : '')) : blockHtml(ctx, b, 'pr')
  const cls = (grid ? ' g' : '') + (st.buttonFill !== 'outline' ? ' fl' : '') + (st.coverShape && st.coverShape !== 'banner' ? ' cs' : '')
  return (
    `<main class="mg${cls}">` +
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
  `.mg{max-width:520px;margin:0 auto;padding:14px 20px calc(28px + env(safe-area-inset-bottom));--r:1px solid var(--ink);--l:1px solid var(--btn-line,var(--ink));` +
  `--tint:color-mix(in srgb,var(--ink) 14%,var(--bg))}` +
  `.hd{border-top:5px solid var(--ink);border-bottom:var(--r);text-align:var(--align,center)}` +
  `.tp{display:flex;align-items:center;gap:12px;min-height:58px;padding:7px 0;border-bottom:var(--r)}` +
  `.lg{width:44px;height:44px;border-radius:var(--logo-r,0);object-fit:contain}` +
  `.dl{margin-left:auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;` +
  `font-size:.75rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase}` +
  `.nm{padding:20px 0 16px;${HEAD};letter-spacing:-.035em;overflow-wrap:anywhere;text-wrap:balance}` +
  `.n1{font-size:clamp(3.4rem,19vw,5.4rem);line-height:.9}.n2{font-size:clamp(2.5rem,12vw,3.4rem);line-height:.98}.n3{font-size:1.9rem;line-height:1.08}` +
  `.tg{padding:10px 0;border-top:var(--r);font-family:var(--font-tagline);font-size:1rem;line-height:1.4;overflow-wrap:anywhere;text-wrap:balance}` +
  `.cv{margin:20px -20px 0;aspect-ratio:var(--cover-ratio,4/3);overflow:hidden;border-radius:var(--cover-r,0);background:var(--tint)}.cs .cv{width:var(--cover-w);margin:20px auto 0}.cv img{width:100%;height:100%;object-fit:cover}` +
  // lead story
  `.bk{margin-top:4px;counter-reset:n}` +
  `.pr{display:flex;align-items:center;gap:14px;min-height:calc(var(--btn-h,60px) + 18px);margin-top:20px;padding:16px 18px;border-radius:min(var(--btn-r,0px),39px);` +
  `background:var(--accent);color:var(--on-accent);text-shadow:none;` +
  `${HEAD};font-size:1.6rem;line-height:1.08;letter-spacing:-.015em}` +
  `.pr>.ic{width:26px;height:26px}.pr .lb{flex:1;min-width:0;overflow-wrap:anywhere}.pr .ar .ic{display:block;transition:transform .2s}` +
  `.pr:hover .ar .ic{transform:translateX(3px)}.pr:active{filter:brightness(.92)}` +
  // table of contents
  `.it{counter-increment:n;display:grid;grid-template-columns:2.6rem 1fr 22px;gap:0 8px;align-items:start;min-height:var(--btn-h,60px);padding:calc(var(--gap,14px) + 1px) 0 var(--gap,14px);border-bottom:var(--l);` +
  `background:var(--btn-bg,transparent);color:var(--btn-ink,inherit);-webkit-backdrop-filter:var(--btn-blur,none);backdrop-filter:var(--btn-blur,none);` +
  `${HEAD};font-size:1.3rem;line-height:1.2}` +
  `.bk>.it:first-child,.bk>:not(.it)+.it{margin-top:20px;border-top:var(--l)}.bk>.bh+.it{margin-top:12px;border-top:0}` +
  `.it::before{content:counter(n,decimal-leading-zero);font-variant-numeric:tabular-nums}` +
  `.it .lb{min-width:0;overflow-wrap:anywhere}.it .k{order:1;padding-top:3px}.it:active{background:var(--tint)}` +
  `.dt{display:block;margin-top:3px;font:400 .9375rem/1.35 var(--font-body);font-variant-numeric:tabular-nums}` +
  // section head: rule, accent tab hanging off it, title
  `.bh,.sh{margin-top:40px;border-top:var(--r);${HEAD};font-size:1.9rem;line-height:1.08;letter-spacing:-.02em;overflow-wrap:anywhere;text-wrap:balance}` +
  `.bh::before,.sh::before{content:"";display:block;width:44px;height:7px;margin-bottom:14px;background:var(--accent)}` +
  `.bt{display:flow-root;margin-top:14px;font-size:1.0625rem;line-height:1.55;overflow-wrap:anywhere}` +
  `.bt::first-letter{float:left;padding:.07em .11em 0 0;${HEAD};font-size:3.2rem;line-height:.9}` +
  // socials: one ruled strip of equal cells
  `.bs{display:flex;flex-wrap:wrap;gap:1px;margin-top:24px;padding:1px;overflow:hidden;border-radius:min(var(--btn-r,0px),28px);background:var(--ink)}` +
  `.bs a{display:grid;place-items:center;flex:1 1 52px;height:56px;background:var(--bg)}.bs a:active{background:var(--tint)}` +
  // video: a matted plate
  `.bv{margin-top:24px;padding:6px;border:var(--r)}.bv iframe{display:block;width:100%;height:auto;aspect-ratio:16/9;border:0;background:var(--tint)}` +
  `.bv.vt{max-width:339px;margin-left:auto;margin-right:auto}.bv.vt iframe{aspect-ratio:9/16}` +
  // directory
  `.br li{padding:16px 0;border-bottom:var(--r)}.br h3{${HEAD};font-size:1.3rem;line-height:1.2;overflow-wrap:anywhere}` +
  `.ad{margin-top:4px;overflow-wrap:anywhere}.hr{display:flex;align-items:center;gap:8px;margin-top:4px;font-variant-numeric:tabular-nums}.hr .ic,.dir .ic{width:18px;height:18px}` +
  `.dir{display:inline-flex;align-items:center;gap:6px;min-height:48px;font-weight:700;text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:.28em}` +
  // style options. A filled contents box: the rows close up into one panel
  `.fl{--l:1px solid color-mix(in srgb,var(--btn-ink) 25%,transparent)}.fl .it{padding-left:14px;padding-right:14px;text-shadow:none}.fl .it:active{background:var(--btn-bg);opacity:.75}` +
  // two columns: number and icon on one line, the title under them
  `.g .bk{display:grid;grid-template-columns:repeat(var(--link-cols,1),minmax(0,1fr));column-gap:20px}.g .bk>*{grid-column:1/-1}` +
  `.g .bk>.it{grid-column:auto;grid-template-columns:1fr 22px;margin-top:0;border-top:0}.g .bk>.t{margin-top:20px;border-top:var(--l)}.g .bk>.w{grid-column:1/-1}` +
  `.g .it .k{grid-area:1/2}.g .it .lb{grid-area:2/1/3/3;padding-top:6px}` +
  halo('.mg') +
  // colophon
  `.ft{display:flex;justify-content:var(--justify,center);margin-top:36px;border-top:5px solid var(--ink)}.cr{display:inline-flex;align-items:center;min-height:52px;font-size:.875rem}` +
  `.cr strong{margin-left:.3em;${HEAD};font-size:1rem}`

export default {
  label: 'Magazine',
  render,
  css,
  supports: ['buttonShape', 'buttonFill', 'linkLayout', 'align', 'logoShape', 'coverShape', 'spacing'],
  styleDefaults: DEFAULTS,
}
