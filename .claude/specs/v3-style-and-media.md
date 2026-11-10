# Spec: v3 style and media (contract v3 delta + build plan)

> **User decisions (2026-11-11), these override anything below:**
> - Task 1.4 = **B**: `clients/**/*.mp4` is git-ignored. R2 + this Mac are the copies. CI's real-clients build must skip missing mp4s.
>   Publish still uploads mp4s to R2 (sync reads dist/, not git).
> - Video cap **15 MB**, studio warns **over 5 MB** (not 8 / 3).
> - Style options: **most options on every look**. Each designer pass maximises `supports` per look without breaking its
>   character; only what a look truly cannot do is greyed out with a pointer to Plain.


Delta against contract v2 (`contract.md` + `mvp-showcase.md`). Anything not named here is unchanged. Task 1.2 folds this into contract.md.
Adds: a `plain` look, a `background` key (colour, gradient, photo, mp4), a `style` key (8 element options), mp4 upload/hosting.
Unchanged hard rules: no `<script`, one inline `<style>`, page HTML < 30 KB (media excluded), look CSS colour from theme vars only.
**Migration:** none needed. Absent `background` and `style` = today's page: `<html lang="en">` with no `data-bg`, no `.kb` layer, no style vars.

## 1. Client data v3 (raw)
Top-level keys add `background style`. Unknown keys inside either -> `background.<k>: unknown key` / `style.<k>: unknown key`.
```js
background: { type:'color' }                                             // same as absent
          | { type:'gradient', stops:[S,S] | [S,S,S], shape?:'linear'|'radial', angle? }   // S = 'bg'|'ink'|'accent'|'#hex'
          | { type:'image', file, blur?, dim?, focus? }                  // file: png|jpg|jpeg|webp in the client folder
          | { type:'video', file, poster, blur?, dim?, focus? }          // file: *.mp4, poster: png|jpg|jpeg|webp
style: { buttonShape?, buttonFill?, linkLayout?, align?, logoShape?, coverShape?, spacing?, shadow? }
```
| field | rule | default | error text (path-prefixed) |
|---|---|---|---|
| `background` | object with `type` | `{type:'color'}` | `background: must be an object with a type` |
| `type` | color gradient image video | - | `background.type: must be one of color, gradient, image, video` |
| `stops` | 2..3 items | - | `background.stops: need 2 or 3 colours`; `background.stops[i]: must be bg, ink, accent or a hex colour` |
| `shape` | linear radial | linear | `background.shape: must be linear or radial` |
| `angle` | integer 0..359, linear only | 180 | `background.angle: must be a whole number 0-359`; with radial: `background.angle: only used with shape linear` |
| `file` | image: IMAGE_RE minus svg; video: `/^[a-z0-9][a-z0-9._-]*\.mp4$/`; no `..`; in `files` | - | `background.file: must be a png, jpg, jpeg or webp file name` / `must be an .mp4 file name` / `file "x" not found in the client folder` |
| `poster` | video only, required, png/jpg/jpeg/webp, in `files` | - | `background.poster: required for a video background` (+ same name/not-found texts) |
| `blur` | integer px; image 0..24, video 0..12 | 0 | `background.blur: must be a whole number 0-24` (video: `0-12`) |
| `dim` | integer percent 0..80 | 40 | `background.dim: must be a whole number 0-80` |
| `focus` | `[x, y]`, integers 0..100 | `[50, 50]` | `background.focus: must be [x, y] with whole numbers 0-100` |
| `style.<k>` | value in section 3 table | null | `style: must be an object`; `style.<k>: must be one of a, b, c` |

Normalized client adds:
`background: {type:'color'} | {type:'gradient', stops:[{ref:'bg'|'ink'|'accent'|null, hex}], shape, angle} | {type:'image', file, blur, dim, focus:[x,y]} | {type:'video', file, poster, blur, dim, focus}`
(`angle` is null for radial; `hex` always resolved lowercase, for contrast maths) and `style: { all 8 keys, value or null }`.

## 2. Contrast over backgrounds (warnings only, never block)
**Pushback:** the brief says text contrast over photo/video cannot be computed. The worst case can, exactly: the dim overlay is the theme
`bg` at a known opacity, so every visible pixel is `d*bg + (1-d)*p` per sRGB channel for some unknown pixel `p` in [0,1]. Its luminance
lies between `Lmin = L(d*bg)` (p black) and `Lmax = L(d*bg + (1-d))` (p white). If `L(ink)` is inside that range the worst case is 1:1;
else it is the ratio to the nearer end. Add to `src/color.js` (pure, exported):
```js
worstContrast(ink, bg, dim)        // dim 0..100 -> Number, contrast of ink vs the worst composited pixel
minDim(ink, bg, target = 4.5)      // smallest integer dim 0..100 with worstContrast >= target
```
Warnings (ratio 2 dp, N = minDim):
- image/video, `dim < N`: `background.dim: text can drop to R:1 over the busiest part of the picture, dim N% or more keeps 4.5:1`
  (R = worstContrast at the current dim). If `N > 80`: `..., even 80% dim cannot guarantee 4.5:1 with these colours`.
- gradient: sample each segment at t = 0, .1 .. 1 (sRGB lerp); min contrast of ink vs samples < 4.5 ->
  `background.stops: text contrast drops to R:1 on part of the gradient, 4.5:1 recommended`.
The guarantee is conservative (assumes a pure black or white pixel). The studio shows it as a hint with the number, not an error.

## 3. Style options (shared CSS custom properties)
`src/style.js` (new, data only): `STYLE` = the table below as `{ key: { value: 'css var declarations' } }` plus `STYLE_KEYS`.
Core emits on `:root` the declarations for every non-null key, nothing for null. Primary link stays accent-filled under every `buttonFill`;
shape, shadow and spacing apply to it too.
| key | value -> declarations |
|---|---|
| buttonShape | square `--btn-r:0` / rounded `--btn-r:14px` / pill `--btn-r:999px` |
| buttonFill | solid `--btn-bg:var(--ink);--btn-ink:var(--bg);--btn-line:transparent;--btn-blur:none` |
| | outline `--btn-bg:transparent;--btn-ink:var(--ink);--btn-line:var(--ink);--btn-blur:none` |
| | soft `--btn-bg:color-mix(in srgb,var(--ink) 10%,var(--bg));--btn-ink:var(--ink);--btn-line:transparent;--btn-blur:none` |
| | glass `--btn-bg:color-mix(in srgb,var(--bg) 60%,transparent);--btn-ink:var(--ink);--btn-line:color-mix(in srgb,var(--ink) 16%,transparent);--btn-blur:blur(12px) saturate(1.3)` |
| linkLayout | list `--link-cols:1` / grid `--link-cols:2` (non-link blocks and the primary span the row; an odd last link stretches) |
| align | left `--align:left;--justify:flex-start` / center `--align:center;--justify:center` |
| logoShape | square `--logo-r:0` / rounded `--logo-r:22%` / circle `--logo-r:50%` |
| coverShape | banner `--cover-r:0;--cover-ratio:16/9;--cover-w:100%` / rounded `--cover-r:20px;--cover-ratio:16/10;--cover-w:100%` / circle `--cover-r:50%;--cover-ratio:1;--cover-w:168px` |
| spacing | compact `--gap:8px;--btn-h:52px` / comfortable `--gap:14px;--btn-h:62px` (never under the 48px tap target) |
| shadow | none `--btn-shadow:none` / soft `--btn-shadow:0 8px 20px -10px color-mix(in srgb,#000 50%,transparent)` / hard `--btn-shadow:4px 4px 0 var(--ink)` |
**Glass over video:** when `background.type === 'video'` core overrides glass with `--btn-blur:none` and 72% bg. A backdrop-filter re-blurs
every frame under every button (20 links x 30 fps) and stutters mid-range Androids; over an already blurred, dimmed video it adds little.
Looks read vars with their own fallback, e.g. `border-radius:var(--btn-r,18px)`, so an unset key = that look exactly as today.
**Pushback:** `coverShape:'none'` is dropped: removing the cover does that. `fit` is dropped: a backdrop is always `cover`; `focus` replaces it.

## 4. Look interface (section 7 additions, every look in `src/looks/index.js`)
`{ label, render, css, supports: string[] /* style keys it reads */, styleDefaults: { [key]: value } /* how it looks when unset */ }`
- Enforced by test: `supports` subset of `STYLE_KEYS`; `styleDefaults` keys subset of `supports`, values valid; for every supported key the look CSS
  contains `var(--x` for every var that key declares; `plain.supports` = all 8; every existing section-7 test also passes with a video
  background + all 8 style keys set.
- Looks never put `transform`, `filter`, `contain` or `will-change` on `html`/`body` (breaks the fixed backdrop), and never use classes starting `kb`.
- A look may ignore a key (opinionated looks keep their identity). Initial `supports` target, designer may widen, never narrow below `logoShape`:
| look | supports |
|---|---|
| plain | all 8. Defaults: rounded, soft, list, center, circle, rounded, comfortable, none |
| card | buttonShape logoShape coverShape align spacing |
| tiles | buttonShape buttonFill shadow logoShape coverShape spacing (always a grid) |
| poster | buttonShape buttonFill logoShape coverShape (hard shadow is its identity) |
| masthead, menu-board | logoShape coverShape spacing |
| receipt | logoShape spacing |
`plain` (designer): one centred column max 520px, logo, name, tagline, cover, blocks via `blockHtml`, branches, credit. No pseudo-element
decoration, no animation. Lets background and style carry the page.

## 5. Backdrop (core, `src/render.js`; every look gets it for free)
Non-colour background: `<html lang="en" data-bg="{type}">`, and the first child of `<body>` is
- gradient: `<div class="kb" aria-hidden="true"></div>`; CSS `linear-gradient({angle}deg, s1, s2[, s3])` or `radial-gradient(130% 90% at 50% 0%, ...)`.
  Stop output: ref -> `var(--{ref})`, free hex -> the hex (core, not look CSS: allowed).
- image: `<div class="kb" aria-hidden="true"><img class="kb-m" src="{asset(file)}" alt="" decoding="async"></div>`
- video: `<div class="kb" aria-hidden="true"><img class="kb-m" src="{asset(poster)}" alt="" decoding="async"><video class="kb-m kb-v" autoplay muted loop playsinline disablepictureinpicture disableremoteplayback tabindex="-1" poster="{asset(poster)}"><source src="{asset(file)}" type="video/mp4" media="(prefers-reduced-motion: no-preference)"></video></div>`
  The `media` on `<source>` means reduced-motion browsers fetch no video bytes at all; the CSS rule is the fallback for browsers that ignore it.
Core CSS, appended **after** look CSS (exact):
`html[data-bg]{background:var(--bg)}html[data-bg] body{background:transparent}`
`.kb{position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;z-index:-1;overflow:hidden;pointer-events:none}`
`.kb-m{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:{x}% {y}%}` + if blur>0 `.kb-m{filter:blur({b}px);transform:scale(1.12)}` (hides the soft edge)
`.kb::after{content:"";position:absolute;inset:0;background:var(--bg);opacity:{dim/100}}` (image/video only)
`@media (prefers-reduced-motion:reduce){.kb-v{display:none}}`
og:image fallback: cover, else logo, else background image file or video poster.
**Pushback, pre-blurred poster:** no. CSS blur on a still layer is rasterised once; a pre-blurred file goes stale on every slider move and doubles uploads.
One poster file, unblurred, CSS filter on both img and video.

## 6. Media files
| | image (existing) | video (new) |
|---|---|---|
| types | svg png jpg jpeg webp | mp4 only, H.264 video (any audio; it plays muted) |
| hard cap | 3 MB (studio resizes to WebP < 1.5 MB first) | **15 MB** |
| studio warns | - | over 5 MB, longer than 15 s, wider than 1280 px: `Every visitor downloads this on mobile data. Aim for 6-10 s at 720p, under 5 MB, no audio.` |
| stored as | `clients/<slug>/<name>` | `clients/<slug>/<stem>-<md5 first 8 hex>.mp4` (server names it) |
| R2 cache-control | `public, max-age=300` | `public, max-age=31536000, immutable` (name changes with content) |
**No webm:** one format that iOS Safari and every Android play. **No HEVC:** iPhone's default `.mov`/HEVC fails on many Androids; the error tells the user how to export.
`src/assets.js` adds (pure, tested): `sniff(buf, ext) -> string | null` (png `89504E470D0A1A0A`, jpeg `FFD8FF`, webp `RIFF....WEBP`, svg via `svgProblem`;
mismatch -> `File content is not a real {EXT}`) and `inspectMp4(buf) -> { ok:true, faststart } | { ok:false, error }`:
walk top-level boxes (u32 BE size + 4-char type; size 1 -> u64 largesize; size 0 -> to end; size < 8 or past the end -> `not a valid MP4 file`);
first box must be `ftyp` (`not an MP4 file`); `moov` required (`MP4 has no index (moov), re-export it`); inside moov `avc1`/`avc3` -> ok,
`hvc1`/`hev1` -> `This video is HEVC (iPhone default). Export it as H.264 ("Most Compatible") so Android phones can play it`, `av01`/`vp09`
-> `Use an H.264 MP4`, none -> `MP4 has no H.264 video track`. `faststart` = moov before mdat. Also `MEDIA = { imageMax, videoMax, videoWarn, videoSecondsWarn:15, videoWidthWarn:1280 }`.
**Server upload** (`POST /api/clients/:slug/assets?name=`): name lowercased, spaces -> `-`, must match `MEDIA_RE` (images + mp4). Body streamed
to `clients/<slug>/.up-<pid>-<n>` with a byte counter (no full-body buffer); over cap -> stop writing, delete temp, drain the request, 422
`File is over N MB`. Then `sniff`/`inspectMp4`; failure -> delete temp, 422 `{ error }`. mp4 -> rename to the hashed name. 201 `{ file, warnings }`;
not faststart adds `This MP4 starts slowly on phones (index at the end). Re-export with "optimize for web" or "fast start".`
**Orphans:** after a successful PUT, delete files in that folder matching `/-[0-9a-f]{8}(-poster)?\.(mp4|jpe?g|webp)$/` that the saved data does not reference (studio-made names only, never hand-placed files).
**Build:** copies `background.file` and `background.poster` beside the page; unreferenced files are never copied. mp4 goes through `inspectMp4`; failure -> error on `background.file`.
**Sync:** `metaFor('.mp4')` -> `video/mp4` + immutable. md5 via a read stream per file; read a body into memory only when it uploads. R2 single-PUT ETag = md5, so an
unchanged 15 MB video costs one LIST entry and zero upload bytes. **Worker:** CSP adds `media-src 'self'` (and studio `PREVIEW_CSP` too). Bucket interface becomes `{ get(key, { range }?), head(key) }`. GET of a non-html object:
| request | response |
|---|---|
| no `Range`, or malformed, or multi-range, or `If-Range` != etag | 200 full, `accept-ranges: bytes`, `content-length` |
| `bytes=a-b` / `bytes=a-` / `bytes=-n` (size S from `head`) | 206, `content-range: bytes s-e/S`, `content-length: e-s+1`, `accept-ranges: bytes`, same type/cache/etag; body via `get(key,{range:{offset:s,length}})` |
| s >= S, s > e, or `bytes=-0` | 416, `content-range: bytes */S`, empty body |
`If-None-Match` == etag still answers 304 first. HEAD never returns 206. iOS Safari will not play an mp4 without 206.
Studio `/p/:slug/:file` accepts `MEDIA_RE`, serves `video/mp4`, and answers the same Range rules (Safari preview).
**Free tier** (verify on Cloudflare's pricing page): R2 10 GB stored, 1M writes and 10M reads per month, no egress fees; Workers 100k requests/day.
A video page view is ~10-14 requests (html, fonts, images, 3-6 ranges), so ~7k video views/day before Workers needs the $5 plan. Fine for now.

## 7. Studio UI (functional contract; visuals are the designer's, Fable)
- `/api/state` adds `looks[].supports`, `looks[].styleDefaults`, `style: STYLE_KEYS with values`, `media: MEDIA`.
- **Background section**: type choice Colour / Gradient / Photo / Video. Gradient: 2-3 stops, each a theme chip (bg ink accent) or free hex; add/remove the
  third stop; shape linear/radial; angle 0..359 (slider step 15 + number), hidden for radial. Photo: upload through the cover resize helper, blur 0..24,
  dim 0..80, focus = click/tap on the thumbnail (arrow keys move 5). Video: `accept=".mp4,video/mp4"`; before upload read size/duration/videoWidth in a
  `<video>` (object URL): over 15 MB blocks, warn thresholds per section 6; upload mp4 -> take the hashed name -> grab frame at `min(1, duration/2)` s to a
  canvas (long side max 1280) -> JPEG 0.82 -> upload as `{stem}-poster.jpg` -> set background. Poster failure = background unchanged + error. Blur 0..12, dim, focus.
  Server warnings (`background.dim`, `background.stops`) render beside the field like every other warning. `lockSlug` counts background files as uploads.
- **Style section**: one control per key; first option `Look default ({styleDefaults value})` = key absent. A key not in the current look's `supports` is
  disabled with `{Look} draws its own {buttons|layout|alignment|logo|cover|spacing|shadows}. Plain gives full control.` Its value stays in the draft and is saved.
- `editor-model.js` (pure, tested): `fromData`/`payload` carry `background` and `style`; payload drops `background` when type is color, drops `angle` for radial,
  drops null style keys and an empty `style`; `styleControl(lookMeta, key) -> { enabled, note }`; `posterTime(duration)`; `videoChecks({ size, duration, width }, MEDIA) -> { block, warnings }`.

## 8. Tests written FIRST (task 1.1, red before Wave 2). Invisible behaviour only.
- `test/validate-v3.test.js`: every row of the section 1 table (exact texts), per-type unknown keys, angle with radial, video without poster, normalized shapes
  and defaults, absent keys -> `{type:'color'}` + all-null style, both warnings fire/stay quiet at the boundary dim.
- `test/color.test.js` (+): `worstContrast(x, y, 0) === 1`; black/white at dim 100 = 21; monotonic in dim; `minDim` result d satisfies f(d) >= 4.5 > f(d-1).
- `test/assets.test.js`: `sniff` table (real headers, swapped extensions); `inspectMp4` on synthetic box buffers: ok avc1 faststart, moov after mdat, hvc1, no moov, first box not ftyp, size 0 and size 1 boxes, truncated box.
- `test/render-v3.test.js`: absent keys -> `<html lang="en">`, no `kb`, no `--btn-`; each style value -> exact declarations in `:root`; glass + video override;
  gradient refs -> `var(--accent)`, hex stays hex; image/video markup exactly as section 5 (attrs, `media` on source, poster); reduced-motion rule present;
  backdrop CSS after look CSS; og:image fallback order; no `<script`; max-limit page with video bg + all style keys < 30 KB.
- `test/looks.test.js` (+): section 4 enforced rules for every look, `plain` registered.
- `test/worker.test.js` (+): section 6 Range table with a fake bucket (`head`, ranged `get`), If-Range, 304 precedence, HEAD no 206, html ignores Range, CSP has `media-src 'self'`.
- `test/publish.test.js` (+): `metaFor` mp4; unchanged mp4 (same md5) not uploaded.
- `test/build.test.js` (+): background file + poster copied; unreferenced mp4 not copied; HEVC fixture refuses build on `background.file`.
- `test/studio.test.js` (+): mp4 upload -> 201 hashed name + faststart warning; over 15 MB -> 422 and no file or temp left; jpeg bytes named .png -> 422;
  `/p/` mp4 Range -> 206; orphan cleanup on PUT keeps hand-placed files; state fields.
- `test/editor-model.test.js` (+): section 7 pure functions, round trip `payload(fromData(x))` deep-equals x for v3 fixtures.
Not tested (visible in two seconds): look visuals, glass appearance, blur strength, plain look design, studio layout.
## 9. Wave Execution Plan (no two tasks in a wave share a file)
| Wave | Task | Owner | Files | Type |
|---|---|---|---|---|
| 1 | 1.1 failing tests (section 8) | builder | `test/*` | auto |
| 1 | 1.2 contract v3, CLAUDE.md, learnings, gitignore per 1.4 | builder | `.claude/specs/contract.md CLAUDE.md .claude/learnings.md .gitignore` | auto (after 1.4) |
| 1 | 1.3 `plain` look against the section 3 var table | designer | `src/looks/plain.js src/looks/index.js` | auto |
| 1 | 1.4 decide: mp4 in the git backup or git-ignored (see end) | user | none | checkpoint:decision |
| 1 | 1.5 `src/style.js` data table | builder | `src/style.js` | auto |
| 2 | 2.1 validation, contrast maths, asset checks | builder | `src/validate.js src/color.js src/assets.js` | auto |
| 2 | 2.2 backdrop + style vars + og fallback | builder | `src/render.js` | auto |
| 2 | 2.3 Range, CSP, mp4 metadata, streamed md5 | builder | `worker/handler.js src/publish/sync.js` | auto |
| 3 | 3.1 build copies + mp4 check | builder | `src/build.js` | auto |
| 3 | 3.2 streamed upload, hashing, orphans, /p/ Range, state | builder | `src/studio/server.js` | auto |
| 3 | 3.3 six looks: supports/styleDefaults, read vars with today's fallbacks, check each over every bg type | designer | `src/looks/{card,tiles,poster,masthead,menu-board,receipt,shared}.js` | auto |
| 3 | 3.4 editor model + `PREVIEW_CSP` media-src | builder | `studio/editor-model.js` | auto |
| 3 | 3.5 `npx wrangler deploy` (Range + CSP live before any video page publishes) | user | none | checkpoint:human-action |
| 4 | 4.1 studio controls, functional (start only after the concurrent resize task has committed `studio/studio.js`) | builder | `studio/studio.js` | auto |
| 5 | 5.1 studio visuals for Background + Style (presentational only) | designer (Fable) | `studio/studio.css studio/index.html studio/studio.js` | auto |
| 6 | 6.1 real phones on mobile data: iPhone Safari + an Android Chrome; video plays, reduced motion shows poster only, glass/dim/blur, publish twice -> second uploads 0 mp4 | user | none | checkpoint:human-verify |
After 6.1: regression-verifier, then reviewer. Builder commits per task, stages only its files, push only after the push-safety scan.

## 10. Not specified (on purpose)
- Video transcoding/compression or faststart rewriting in the studio (needs ffmpeg; we warn and explain instead). Poster frame picker (auto frame only).
- Per-block or per-link style overrides, button colours outside the theme, custom CSS, font sizes, animated gradients, parallax, more than one video background.
- Worker Cache API for mp4 (add only if Workers' 100k/day becomes the limit). Videos under the `media/` R2 prefix (client folder keeps one pipeline and studio preview).
  Look visuals, plain look design, studio layout: designer's call within sections 3-5 and 7.

**User must decide (task 1.4):** the repo is public and Publish commits `clients/` as the backup. (A) commit mp4s: full backup, every replaced video stays in
git history forever (8 MB cap bounds it). (B) git-ignore `clients/**/*.mp4`: R2 is the only copy besides this Mac, and CI's "real clients build" test must skip
missing mp4s. Recommended: A while there are under ~10 video pages; revisit at 300 MB repo size.
