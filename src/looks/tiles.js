// Look: tiles. A phone home screen.
// Rules:
//   Corners   everything is soft: 28px on tiles and widgets, 30px on the cover and the main tile,
//             full circles for icon wells. No straight corner anywhere.
//   Line      none. No borders, no shadows: a surface is a tone, --panel = 9% ink in bg.
//   Wells     an icon sits in a bg-coloured circle punched into its panel.
//   Grid      links are half-width tiles, 12px gutters; a link left alone on its row
//             stretches to full width. Every other block is a full-width widget.
//   Accent    the main tile only.
//   Style     every panel (tile, note, socials tray, branch) is one material read from the --btn-* vars,
//             9% ink when unset; a well keeps its ink-on-bg whatever the panel becomes. A list turns
//             each tile into a wide row. Over a photo or video the page is a home screen on its
//             wallpaper: panels stay filled, bare text carries the halo.
import { blockHtml, branchesHtml, coverHtml, logoHtml, nameSize, credit, styleOf, halo, HARD, BASE } from './shared.js'

const DEFAULTS = { linkLayout: 'grid', align: 'left', shadow: 'none' }

function render(ctx) {
  const { client: c, esc } = ctx
  const cr = credit(ctx, 'cr')
  const st = styleOf(ctx, DEFAULTS)
  const cls = (c.cover ? ' hc' : '') + (st.linkLayout === 'list' ? ' l' : '') + (st.align === 'center' ? ' ac' : '') + (st.shadow === 'hard' ? ' hs' : '') + (st.buttonFill === 'outline' ? ' ol' : '')
  return (
    `<main class="tl${cls}">` +
    coverHtml(ctx) +
    `<header class="hd">${logoHtml(ctx, 76)}<h1 class="nm ${nameSize(c.name)}">${esc(c.name)}</h1>` +
    (c.tagline ? `<p class="tg">${esc(c.tagline)}</p>` : '') +
    `</header>` +
    `<div class="bk">${c.blocks.map((b) => blockHtml(ctx, b, b.primary ? 'pr' : 'it')).join('')}</div>` +
    branchesHtml(ctx) +
    (cr ? `<footer class="ft">${cr}</footer>` : '') +
    `</main>`
  )
}

const HEAD = `font-family:var(--font-heading);font-weight:var(--heading-weight)`

const css = () =>
  BASE +
  `.tl{max-width:460px;margin:0 auto;padding:12px 12px calc(28px + env(safe-area-inset-bottom));--panel:color-mix(in srgb,var(--ink) 9%,var(--bg));` +
  `text-align:var(--align,left);--_g:var(--gap,12px);--_r:min(var(--btn-r,28px),40px)}` +
  `.cv{width:var(--cover-w,100%);aspect-ratio:var(--cover-ratio,16/10);overflow:hidden;border-radius:var(--cover-r,30px);background:var(--panel)}.cv img{width:100%;height:100%;object-fit:cover}` +
  `.hd{padding:24px 8px 0}` +
  `.lg{position:relative;width:76px;height:76px;margin-bottom:14px;border-radius:var(--logo-r,24px);background:var(--panel);object-fit:cover}` +
  `.hc .hd{padding-top:16px}.hc .lg{margin:-58px 0 14px 8px;box-shadow:0 0 0 5px var(--bg)}` +
  `.nm{${HEAD};letter-spacing:-.025em;overflow-wrap:anywhere;text-wrap:balance}` +
  `.n1{font-size:2.6rem;line-height:1}.n2{font-size:2.05rem;line-height:1.05}.n3{font-size:1.6rem;line-height:1.12}` +
  `.tg{max-width:34ch;margin-top:8px;font-family:var(--font-tagline);font-size:1.0625rem;line-height:1.45;overflow-wrap:anywhere}` +
  // the grid
  `.bk{display:flex;flex-wrap:wrap;gap:var(--_g);margin-top:22px}.bk>*{flex:1 1 100%;min-width:0;animation:pop .5s cubic-bezier(.2,.9,.3,1.25) both}` +
  `.bk>:nth-child(2){animation-delay:50ms}.bk>:nth-child(3){animation-delay:.1s}.bk>:nth-child(4){animation-delay:.15s}.bk>:nth-child(n+5){animation-delay:.2s}` +
  `@keyframes pop{from{opacity:0;transform:scale(.9)}}` +
  `.bk>.it{flex:1 1 calc(100%/var(--link-cols,2) - var(--_g))}` +
  `.it{display:grid;grid-template-columns:1fr auto;grid-template-rows:auto 1fr;gap:16px 8px;min-height:calc(var(--btn-h,62px) + 66px);padding:14px;border-radius:var(--_r)}` +
  // the material
  `.it,.bt,.bs,.br li{background:var(--btn-bg,var(--panel));color:var(--btn-ink,inherit);outline:1.5px solid var(--btn-line,transparent);outline-offset:-1.5px;` +
  `-webkit-backdrop-filter:var(--btn-blur,none);backdrop-filter:var(--btn-blur,none);text-shadow:none}` +
  `.it,.pr{box-shadow:var(--btn-shadow,none)}` +
  `.it>.ic,.bs a,.dir{color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--btn-line,transparent)}` +
  `.it:active,.pr:active{transform:scale(.96);transition:transform .12s}` +
  `.it>.ic{grid-area:1/1;width:46px;height:46px;padding:12px;border-radius:50%;background:var(--bg)}` +
  `.it .ar{grid-area:1/2;padding:5px 3px 0 0}.ar .ic{display:block;width:18px;height:18px}.it .ar .ic{transform:rotate(-45deg)}` +
  `.it .lb{grid-area:2/1/3/3;align-self:end;padding:0 2px 2px;font-weight:600;line-height:1.25;overflow-wrap:anywhere}` +
  `.dt{display:block;margin-top:2px;font-weight:400;font-size:.875rem;font-variant-numeric:tabular-nums}` +
  // the main tile
  `.pr{display:flex;align-items:center;gap:14px;min-height:calc(var(--btn-h,62px) + 34px);padding:16px 16px 16px 20px;border-radius:min(var(--btn-r,30px),48px);` +
  `background:var(--accent);color:var(--on-accent);text-shadow:none;` +
  `font-weight:700;font-size:1.35rem;line-height:1.18}` +
  `.pr>.ic{width:28px;height:28px}.pr .lb{flex:1;min-width:0;overflow-wrap:anywhere}` +
  `.pr .ar{display:grid;place-items:center;flex:none;width:50px;height:50px;border-radius:50%;background:var(--on-accent);color:var(--accent)}.pr .ar .ic{width:22px;height:22px}` +
  // widgets
  `.bh,.sh{margin-top:14px;padding:0 8px;${HEAD};font-size:1.5rem;line-height:1.15;letter-spacing:-.01em;overflow-wrap:anywhere;text-wrap:balance}` +
  `.bt{padding:16px 18px;border-radius:28px 28px 28px 10px;overflow-wrap:anywhere}` +
  `.bs{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;padding:12px;border-radius:38px}` +
  `.bs a{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:var(--bg)}.bs a:active{transform:scale(.9)}` +
  `.bv{overflow:hidden;border-radius:28px;background:var(--panel)}.bv iframe{display:block;width:100%;height:auto;aspect-ratio:16/9;border:0}` +
  `.bv.vt iframe{max-width:325px;margin:0 auto;aspect-ratio:9/16}` +
  `.br{margin-top:26px}.br ul{display:grid;gap:12px;margin-top:12px}.br li{padding:18px 20px;border-radius:var(--_r)}` +
  `.br h3{font-size:1.125rem;font-weight:700;line-height:1.25;overflow-wrap:anywhere}.ad{margin-top:2px;overflow-wrap:anywhere}` +
  `.hr{display:flex;align-items:center;justify-content:var(--justify,flex-start);gap:8px;margin-top:4px;font-variant-numeric:tabular-nums}.hr .ic,.dir .ic{width:18px;height:18px}` +
  `.dir{display:inline-flex;align-items:center;gap:6px;min-height:48px;margin-top:12px;padding:0 18px;border-radius:999px;background:var(--bg);font-weight:600}` +
  // a list: each tile is a wide row, well / label / arrow
  `.l .it{grid-template:auto/auto 1fr auto;align-items:center;gap:14px;min-height:calc(var(--btn-h,62px) + 12px)}` +
  `.l .it .lb{grid-area:auto;align-self:auto;padding:0}.l .it .ar{grid-area:1/3;padding:0 3px 0 0}` +
  `.ac .lg,.ac .tg,.ac .cv{margin-left:auto;margin-right:auto}` +
  `.hs{--_g:max(var(--gap,12px),12px)}.hs .it{${HARD}}` +
  // an outlined panel is see-through, so its text keeps the halo
  halo('.tl') +
  `.ol .it,.ol .bt,.ol .br li{text-shadow:inherit}` +
  `.ft{margin-top:28px;text-align:center}.cr{display:inline-flex;align-items:center;min-height:48px;padding:0 12px;font-size:.875rem}` +
  `.cr strong{margin-left:.3em;${HEAD};font-size:1rem}`

export default {
  label: 'Tiles',
  render,
  css,
  supports: ['buttonShape', 'buttonFill', 'linkLayout', 'align', 'logoShape', 'coverShape', 'spacing', 'shadow'],
  styleDefaults: DEFAULTS,
}
