# Spec: MVP showcase (contract v2 delta + build plan)

Delta against `.claude/specs/contract.md` (v1). Anything not named here is unchanged. Task 1.2 folds this into contract.md.
**Reverses two CLAUDE.md rules** (task 1.2 rewrites them): "never rename a client folder" (now: rename only via studio,
which leaves a redirect) and "zero JavaScript" (now: we ship no JS of our own; video iframes are the one exception).

## 1. Client data v2 (raw, what client.js exports)
Top-level keys: `slug name tagline look theme font logo cover blocks branches credit`. `links` is accepted only via migration.
```js
font:   { heading, tagline, body }                     // all optional font ids
blocks: [                                              // 1..30 items, order kept
  { type:'link',    kind, url, label? },               // label required (1..40) when kind is 'custom'
  { type:'heading', text },                            // 1..60 chars, trimmed, no newline
  { type:'text',    text },                            // 1..280 chars, trimmed, plain text, \r\n -> \n, max 4 '\n'
  { type:'socials', items:[{ kind, url }] },           // 1..8 items, icon-only
  { type:'video',   url },                             // YouTube or TikTok page URL
]
```
Limits, exported as `LIMITS` from `src/validate.js`: `{ blocks:30, links:20, videos:3, socials:2, socialItems:8, heading:60, text:280, label:40 }`.
Unknown key inside a block -> error `blocks[i].<key>: unknown key`. `<`, `&` in text are allowed (escaped on render), never rejected.

## 2. Kinds (`src/kinds.js`)
`KINDS[kind] = { label, scheme, social:boolean }`. Add (all `https:` unless noted):
| kind | label | scheme | social |
|---|---|---|---|
| whatsapp | Chat on WhatsApp | https: (hint `https://wa.me/639XXXXXXXXX`) | yes |
| viber | Message on Viber | **viber:** (hint `viber://chat?number=%2B639XXXXXXXXX`) | yes |
| youtube | YouTube | https: | yes |
| shopee | Shop on Shopee | https: | yes |
| lazada | Shop on Lazada | https: | yes |
| x | X | https: | yes |
| linkedin | LinkedIn | https: | yes |
| spotify | Spotify | https: | yes |
| custom | (none, label required) | https: | no |
Existing `social:true`: facebook instagram tiktok messenger phone email. `social:false`: review maps menu booking order website custom.
`socials.items[j].kind` must have `social:true`. No host checks per kind (studio hint only). Normalized item: `{ kind, url, label: KINDS[kind].label }`.

## 3. Migration (`src/migrate.js`, new)
`migrateRaw(raw) -> raw` pure, never throws, never mutates input; non-object returned as-is.
- `links` array and `blocks === undefined` -> `blocks = links.map(l => isObj(l) ? { type:'link', kind:l.kind, url:l.url, ...(l.label!==undefined && {label:l.label}) } : l)`, `links` removed. Extra v1 link keys are dropped.
- `font` has `display`/`body` and neither `heading` nor `tagline` -> `{ heading: display ?? 'fraunces', tagline: body ?? 'inter', body: body ?? 'inter' }`.
- Both `links` and `blocks` present -> untouched; validate errors `links: v1 key, use blocks`. `font.display` next to `font.heading` -> `font.display: v1 key, use font.heading`.
- Idempotent: `migrateRaw(migrateRaw(x))` deep-equals `migrateRaw(x)`. Error paths after migration use `blocks[i]` (same index as `links[i]`).
validateClient calls `migrateRaw` first. Studio GET returns migrated data; PUT writes migrated data. build never rewrites files.
Task 3.2 rewrites `clients/demo-cafe/client.js` and `clients/khybrio/client.js` to v2 by hand (comments kept).

## 4. validateClient v2
`validateClient(raw, { folder, looks, fonts, bodyFonts = fonts, files }) -> { ok, client, errors, warnings }`. `warnings` always an array, returned even when `ok:false`.
- RESERVED slugs: `assets fonts 404 index api media`.
- Theme: bg/ink/accent must parse (error). Contrast is **warning only**, path-prefixed, ratio to 2 dp:
  `theme.ink: contrast against bg is R:1, 4.5:1 recommended for body text` (ink/bg < 4.5);
  `theme.accent: best text contrast on accent is R:1, 3:1 recommended for button text` (onAccent < 3);
  `theme.accent: accent against bg is R:1, 3:1 recommended so buttons stand out` (accent/bg < 3, WCAG 1.4.11). onAccent rule unchanged.
- `font.heading`, `font.tagline` in `fonts`; `font.body` in `bodyFonts`. Defaults: heading `fraunces`, body `inter`, tagline = resolved body.
- Normalized client: v1 minus `links`, `font:{heading,tagline,body}`, plus `blocks`:
  `link -> { type, kind, url, label, primary }` (primary true on the FIRST link block only; zero link blocks allowed),
  `heading|text -> { type, text }`, `socials -> { type, items }`, `video -> { type, url, provider, id, vertical, src }`.
- build(): warnings never block; returns `{ pages, warnings: { [slug]: string[] } }` (only slugs with warnings).

## 5. Video embeds (`src/embed.js`, new)
`parseVideo(url) -> { provider, id, vertical } | { error }`. https only; `src` is built from `id`, never from the user URL.
| input | result |
|---|---|
| `youtube.com`/`www.`/`m.` `/watch?v=ID`, `/embed/ID`, `/live/ID`; `youtu.be/ID` | youtube, vertical false |
| same hosts `/shorts/ID` | youtube, vertical true |
| `tiktok.com`/`www.`/`m.` `/@handle/video/ID`, `/embed/v2/ID`, `/player/v1/ID` | tiktok, vertical true |
| `vm.tiktok.com/*`, `vt.tiktok.com/*` | error `blocks[i].url: short TikTok link, open it and copy the full address` |
| anything else, http:, bad id | error `blocks[i].url: must be a YouTube or TikTok video link` |
YouTube ID `/^[A-Za-z0-9_-]{11}$/`; TikTok ID `/^\d{8,25}$/`.
src: youtube `https://www.youtube-nocookie.com/embed/{id}`, tiktok `https://www.tiktok.com/player/v1/{id}`.
`videoEmbed(block, name) -> string`, the only iframe markup allowed in any look (looks call `ctx.embed(block)`):
`<iframe src="{src}" title="{esc(name)} video" width="560" height="315"|(vertical: "325" "578") loading="lazy"`
` allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen`
` referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"></iframe>`
No `style=` attribute (sizing is look CSS). Page still contains no `<script`. Referrer policy must stay as above: YouTube refuses embeds with no referrer.

## 6. Fonts (`src/fonts.js`)
Entry: `{ family, fallback, group, body:boolean, headingWeight, files }`. Variable: one file `{id}.woff2` from
`@fontsource-variable/{id}/files/{id}-latin-wght-normal.woff2`, weight = the range in that package's `wght.css`. Static: `{id}-{w}.woff2`
from `@fontsource/{id}/files/{id}-latin-{w}-normal.woff2`. Normal style only. Ids = package names (all verified on npm 2026-11-10).
| group | variable (`@fontsource-variable/*`) | static (`@fontsource/*`, weights) |
|---|---|---|
| serif | fraunces* lora* eb-garamond* source-serif-4* playfair-display | dm-serif-display (400), instrument-serif (400) |
| sans (all body) | inter dm-sans manrope plus-jakarta-sans outfit space-grotesk figtree work-sans bricolage-grotesque | - |
| display | syne unbounded | bebas-neue anton archivo-black abril-fatface (400 each) |
| script | caveat dancing-script | pacifico great-vibes satisfy (400 each) |
| mono | jetbrains-mono* | ibm-plex-mono* (400 600 700), space-mono (400 700) |
`*` and every sans = `body:true` (30 families total). headingWeight: 400 for every static-400 family, 700 for display/sans variable and space-mono, 600 otherwise.
Fallback per group: serif `Georgia, "Times New Roman", serif`; sans/display `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
script `"Brush Script MT", cursive`; mono `ui-monospace, Menlo, Consolas, monospace`.
package.json: add the 29 packages not yet installed as devDependencies, drop `@fontsource/inter` and `@fontsource/space-grotesk` (replaced by their variable versions).
`:root` vars become `--font-heading --font-tagline --font-body --heading-weight` (`--font-display` removed; looks updated). @font-face and
build copies only for the (deduped) three ids a page uses.

## 7. Look interface (every entry in `src/looks/index.js`)
`{ label, render(ctx), css(ctx) }`; ctx = `{ client, site, asset, esc, icon, pageUrl, embed(block), text(str) }` (`text` = esc then `\n` -> `<br>`).
A look MUST, enforced by test for every registered look:
- emit exactly one element carrying `data-block="{type}"` per block, in block order (count and order equal `client.blocks`);
- link block: `<a href data-block="link" data-kind [data-primary]>`; `data-primary` only on the block with `primary:true`;
- socials: container `data-block="socials"`, each item `<a href="{url}" data-kind="{kind}" aria-label="{label}">` + icon, no visible text;
- heading -> `<h2 data-block="heading">`; text -> `<p data-block="text">` via `ctx.text`; video -> `data-block="video"` wrapping `ctx.embed(block)`;
- render `src="{asset(logo)}"` when logo set, `src="{asset(cover)}"` when cover set, tagline text when set, branches, credit when true;
- `data-kind` only on link-block and socials anchors; no `<b> <i> <u>`; colour only from theme vars (no hex/rgb literal except `#000`/`#fff` in color-mix).
`src/looks/shared.js` provides default block renderers that already satisfy this: `blockHtml(ctx, block, cls) -> string`.

## 8. Rename + redirects (`src/redirects.js`, new; data in `clients/_redirects.json`)
File shape `{ "<oldSlug>": "<liveSlug>" }`, always flat (every value is a live page). Missing file = `{}`.
`applyRename(redirects, from, to, liveSlugs) -> { ok:true, redirects } | { ok:false, status, error }` pure:
| case | result |
|---|---|
| `to` fails slug regex/length or is reserved, or `to === from` | 422 |
| `from` not in liveSlugs | 404 |
| `to` is a live page or any folder in clients/ | 409 `address already used by a page` |
| `to` is a redirect key whose value !== from | 409 `old cards for "{value}" use this address` |
| otherwise | `r[from]=to`; every `k` with `r[k]===from` -> `to` (A->B->C gives A:C, B:C); `delete r[to]` (rename back) |
`validateRedirects(redirects, liveSlugs) -> string[]`: non-slug key or value, key that is a live slug, value not live -> `redirects: ...` error. build() refuses on any.
Studio `POST /api/clients/:slug/rename {to}` -> 200 `{ ok:true, slug:to }` | 404/409/422 `{ error }`. Under one write lock: fs.rename folder ->
rewrite client.js with `slug:to` (atomic) -> write `_redirects.json` (atomic). Any step fails -> undo earlier steps, 500. PUT `create` on a redirect key -> 409.
Redirect records are permanent; only the page they point to can reclaim one (rename back). Deleting a record is hand-edit only.
**Pushback, HTTP code:** the record is permanent but the response is `302` + `cache-control: no-store`. A cached 301 A->B plus a later rename back
B->A makes phones loop forever; 302 cannot. Tap pages need no SEO juice.

## 9. Hosting: Cloudflare R2 + one small Worker
**Why R2, not KV or Static Assets:** KV is eventually consistent (up to 60 s to reach other locations) and caps free writes at 1k/day, so
"live in 1-2 s" is not guaranteed. Static Assets is free to read and has native redirects, but every publish is a full Worker deploy through
wrangler (10-20 s, its own hash protocol). R2 is strongly consistent read-after-write worldwide, a publish is a few PUTs of only changed files
(~1 s), and the same bucket is the seam for images/mp4 later (`media/` prefix, never touched by sync). Cost at our traffic: free tier.
- `site.config.js`: origin `https://khybrio-tap.{subdomain}.workers.dev`, base `/` (later `https://tap.khybrio.com`, origin edit only). Publish refuses if `base !== '/'`.
- Bucket `khybrio-tap` mirrors `dist/` exactly: `{slug}/index.html`, `{slug}/{asset}`, `fonts/{file}`, `404.html`, `index.html`, and
  `_redirect/{old}` (text body = target slug). build() writes `dist/_redirect/{old}`, drops `.nojekyll`.
- `worker/handler.js`: `handle(request, bucket) -> Promise<Response>` (bucket = `{ get(key) -> {body, httpMetadata, httpEtag} | null }`). `worker/index.js`:
  `export default { fetch: (req, env) => handle(req, env.TAP) }`. `wrangler.toml`: name `khybrio-tap`, main `worker/index.js`, r2 binding `TAP`.
| request | response |
|---|---|
| not GET/HEAD | 405, `allow: GET, HEAD` |
| `/` | `index.html` |
| `/{slug}` | 301 `/{slug}/` |
| `/{slug}/` / `/{slug}/{file}` / `/fonts/{file}` | the object; `If-None-Match` == etag -> 304; HEAD -> no body |
| miss on a slug path, `_redirect/{slug}` exists | 302 `/{target}/` (+ `{file}`), `cache-control: no-store` |
| any segment starting `_` or `.`, encoded `/`, deeper path, other miss | `404.html`, status 404 |
HTML responses add: `content-security-policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self';`
` frame-src https://www.youtube-nocookie.com https://www.tiktok.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
`x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`.
- Object metadata set at upload: html `text/html; charset=utf-8` + `no-cache`; fonts `font/woff2` + `public, max-age=604800`; images by extension + `public, max-age=300`; `_redirect/*` `text/plain` + `no-store`.

## 10. Publish (`src/publish/*`, new; replaces git-as-deploy)
- `env.js`: `loadEnv(root) -> { ok, env, missing }` reads `.env.local` with `util.parseEnv` (engines -> `>=20.12`). Keys: `CF_ACCOUNT_ID R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY`.
  Never logged; no value ever appears in `output`. `.gitignore` adds `.env*` and `.wrangler/`.
- `r2.js`: `createR2Store({ accountId, bucket, accessKeyId, secretAccessKey, fetch }) -> { list(): Map<key, md5>, put(key, buf, {contentType, cacheControl}), del(key) }`
  via `aws4fetch` (dependency, zero-dep) against `https://{accountId}.r2.cloudflarestorage.com/{bucket}` (S3 API, region `auto`). list = ListObjectsV2, paged, ETag unquoted.
- `sync.js`: `syncDir({ dir, store, concurrency = 6 }) -> { uploaded:string[], deleted:string[], unchanged:number }`. Upload where md5 differs or key is new:
  non-html first, then `_redirect/*`, then html; deletes last. Never delete keys under `media/`. Refuse (throw, nothing deleted) if dir has 0 pages or it
  would delete more than `max(3, half)` of the live `*/index.html` keys unless `force:true`.
- `index.js`: `publishLive({ root, site, store, git, force }) -> { ok, output, live:{uploaded,deleted,ms}, backup:'committed'|'nothing'|'failed', push }`.
  Order: write lock -> build to temp dir (failure -> ok:false, zero store calls) -> syncDir -> `git add clients` + commit (sync, local) -> `push` = push Promise (not awaited).
  Git failure never makes ok false. Missing env -> ok:false `Cloudflare is not set up: missing X in .env.local`, no throw.
- Studio: `defaultPublish` = loadEnv + createR2Store + publishLive. `/api/publish` body `{ force? }`; a second publish while one runs -> 409.
  `/api/state` adds `backup:{ state:'idle'|'pushing'|'failed', at, output }`, `palettes`, `limits`, fonts `{id,family,group,body}`, kinds `{id,label,scheme,social}`,
  clients[] `blockCount` (replaces linkCount) and `warnings`. Preview and PUT responses add `warnings`.
- `.github/workflows/pages.yml` -> `ci.yml`: test only, no deploy. `scripts/serve.js` serves `dist/` through `handle()` with a folder-backed bucket.

## 11. Studio UI (functional contract; visuals are the designer's)
Blocks list: add (type menu), reorder (up/down buttons, keyboard reachable), delete, per-type fields; counts against LIMITS. Link kind picker shows
scheme hints from kinds. Three font pickers grouped by `group`; body picker lists `body:true` only. Palettes (`src/palettes.js`,
`PALETTES:[{id,label,bg,ink,accent}]`) fill the three colours, then stay editable. Warnings render beside the field, never block Save/Publish.
Address editable in edit mode: disabled while unsaved changes exist; confirm dialog says the old address keeps working; calls rename, reloads editor.
Publish shows `uploaded/deleted/ms`, then backup state.

## 12. Tests written FIRST (task 1.1, all red before Wave 2)
- `test/migrate.test.js`: v1 -> v2 table from section 3, idempotence, no mutation, both-shapes error, v1 fixtures validate ok with blocks.
- `test/validate.test.js` (+): every block rule and limit with exact paths; custom needs label; viber scheme; non-social kind in socials; contrast
  cases return `ok:true` + the three warning prefixes; body font must be `body:true`; `primary` only on first link block; reserved `api`, `media`.
- `test/embed.test.js`: parseVideo table (section 5, incl. shorts vertical, short TikTok error, http rejected, 10/12-char ids); videoEmbed exact attrs,
  src built from id even when url has extra query, name escaped, no `<script`, no `style=`.
- `test/looks.test.js` (+): per look, fixture with all 5 block types + logo + cover + tagline + credit: data-block count/order, cover and logo src,
  data-primary exactly once, data-kind only on link/socials anchors, hostile strings escaped, max-limit fixture < 30 KB.
- `test/redirects.test.js`: applyRename table (section 8) incl. A->B->C flatten and rename back; validateRedirects errors.
- `test/worker.test.js`: handle() table (section 9) with a fake bucket, incl. 302 no-store, `/_redirect/x` 404, `..` 404, 304, HEAD, CSP on html.
- `test/publish.test.js`: syncDir with a fake store (diff by md5, ordering, `media/` kept, mass-delete guard, metadata per extension); publishLive with
  fake store + fake git (build failure = no store calls, git failure still ok, missing env message contains no secret, base `/khybrio-tap/` refused).
- `test/studio.test.js` (+): rename route moves folder + writes redirects + 409s; create on redirect key 409; GET returns migrated data; state fields.
- `test/build.test.js` (+): `_redirect/*` written; bad redirects refuse build; fonts copied for heading+tagline+body only; warnings returned, not thrown.
- `git check-ignore -q .env.local` succeeds (secret never committable; the repo is public).
Not tested (visible in two seconds): look visuals, studio layout, palette colours, icon drawings.

## 13. Wave Execution Plan (no two parallel tasks share a file)
| Wave | Task | Owner | Files | Type |
|---|---|---|---|---|
| 1 | 1.1 failing tests | builder | `test/*` | auto |
| 1 | 1.2 contract v2, CLAUDE.md rules, learnings, gitignore | builder | `.claude/specs/contract.md`, `CLAUDE.md`, `.claude/learnings.md`, `.gitignore` | auto |
| 1 | 1.3 icons for 9 new kinds (hand-drawn, house style) | designer | `src/icons.js` | auto |
| 1 | 1.4 Cloudflare account, R2 bucket `khybrio-tap`, R2 token (Object R/W, that bucket only), workers.dev subdomain, fill `.env.local` | user | none in repo | checkpoint:human-action |
| 2 | 2.1 kinds, migrate, validate, embed, palettes stub (Khybrio brand only) | builder | `src/kinds.js src/migrate.js src/validate.js src/embed.js src/palettes.js` | auto |
| 2 | 2.2 font registry + deps (+ aws4fetch) | builder | `src/fonts.js package.json package-lock.json` | auto |
| 2 | 2.3 redirects + Worker | builder | `src/redirects.js worker/* wrangler.toml` | auto |
| 2 | 2.4 publish modules | builder | `src/publish/*` | auto |
| 3 | 3.1 render v2 + card/menu-board on blocks (functional CSS only) | builder | `src/render.js src/looks/shared.js src/looks/card.js src/looks/menu-board.js` | auto |
| 3 | 3.2 build, dev server, CI, client files to v2 | builder | `src/build.js scripts/serve.js .github/workflows/* clients/*/client.js` | auto |
| 3 | 3.3 studio server | builder | `src/studio/server.js` | auto |
| 3 | 3.4 `npx wrangler deploy`; tell builder the subdomain -> `site.config.js` | user + builder | `site.config.js` | checkpoint:human-action |
| 4 | 4.1 studio editor logic (section 11) | builder | `studio/studio.js` | auto |
| 4 | 4.2 four new looks + block styling in card/menu-board + 6-8 palettes | designer | `src/looks/*.js` (new ids, kebab-case), `src/looks/index.js`, `src/looks/card.js`, `src/looks/menu-board.js`, `src/palettes.js` | auto |
| 5 | 5.1 studio visuals (presentational edits only in studio.js: markup/classes, never `payload`/`fromData`/api calls) | designer | `studio/studio.css studio/index.html studio/studio.js` | auto |
| 5 | 5.2 disable GitHub Pages in repo settings | user | none | checkpoint:human-action |
| 6 | 6.1 publish live, every block type in preview and live, rename a throwaway page twice and back, old URL works | user | none | checkpoint:human-verify |
After 6.1: regression-verifier, then reviewer. Builder commits per task; push only after the push-safety scan (public repo).

## 14. Not specified (on purpose)
- Look visuals, studio layout, icon drawings, palette values, new look ids: designer's call within section 7.
- Images/mp4 hosting: on hold; seam is the R2 `media/` prefix plus reserved slug `media`. Click-to-load video facades: needs our own JS, out.
- Page deletion, studio login (Supabase), custom domain purchase, analytics, italic font files, branches as a block, per-kind host checks.
- Error-path remapping from `blocks[i]` back to `links[i]` for hand-written v1 files: only two exist and 3.2 rewrites them.
