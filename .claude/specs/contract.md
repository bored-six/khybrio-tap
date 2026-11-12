# Contract: khybrio-tap v3

Static generator. Each folder in `clients/` becomes one page at `{origin}{base}{slug}/`.
Pages ship **no JavaScript of our own**: plain HTML with CSS inlined in one `<style>`. The one exception is
YouTube/TikTok video iframes (`videoEmbed`, `.claude/specs/mvp-showcase.md` section 5); the page still contains no `<script`.
Node >= 20.12, no runtime dependencies (`aws4fetch` is the one publish-time dependency, fonts are devDependencies). Tests: `node --test "test/*.test.js"`.

**v2 delta.** `.claude/specs/mvp-showcase.md` is the full spec for everything below marked v2 (tables, exact messages,
hosting, publish, studio UI, test list, wave plan). This file keeps the contract rules and points there for detail.
Where the two ever disagree, fix both in the same commit.

**v3 delta (2026-11-11).** `.claude/specs/v3-style-and-media.md` is the full spec (tables, exact messages, contrast maths, backdrop
markup/CSS, Range/206 table, studio UI, tests, wave plan); its "User decisions" block overrides its body. Summary of what v3 adds:
- `plain` look; client keys `background` (color | gradient | image | video) and `style` (8 options: buttonShape, buttonFill, linkLayout,
  align, logoShape, coverShape, spacing, shadow) with CSS-variable mapping in `src/style.js`. Absent keys = the v2 page byte for byte (no `data-bg`, no `.kb`, no style vars).
- Looks gain `supports` and `styleDefaults`. Core draws the fixed backdrop layer `.kb`; looks never use `kb*` classes nor put transform/filter/contain/will-change on html/body.
- Contrast over photo/video is a warning from `worstContrast`/`minDim` (src/color.js); never blocks.
- mp4 backgrounds: H.264 only, hard cap 15 MB, studio warns over 5 MB. Stored as `<stem>-<md5 8>.mp4`, served `immutable`.
  `clients/**/*.mp4` is git-ignored (R2 + the author's Mac are the copies); CI's real-clients build must skip missing mp4s.
- Worker answers Range with 206/416 (iOS Safari will not play video without it) and CSP adds `media-src 'self'`.
Unchanged hard rules: no `<script`, one inline `<style>`, page HTML < 30 KB (media excluded), look CSS colour from theme vars only.
Where this file and the v3 spec disagree, fix both in the same commit.

## Files and ownership

| File | Owner | Purpose |
|---|---|---|
| `src/kinds.js` | core | link kinds: default label, URL scheme, `social` flag (v2: 18 kinds, spec section 2) |
| `src/migrate.js` | core | v1 -> v2 raw migration, `migrateRaw` (v2, spec section 3) |
| `src/embed.js` | core | `parseVideo`, `videoEmbed` (v2, spec section 5) |
| `src/redirects.js` | core | `applyRename`, `validateRedirects` (v2, spec section 8) |
| `src/palettes.js` | design | `PALETTES:[{id,label,bg,ink,accent}]` (v2) |
| `worker/*`, `wrangler.toml` | core | Cloudflare Worker serving the R2 bucket (v2, spec section 9) |
| `src/publish/*` | core | R2 sync + publish (v2, spec section 10) |
| `src/color.js` | core | hex parsing, contrast math |
| `src/html.js` | core | escaping |
| `src/validate.js` | core | `validateClient`, `validateSite` |
| `src/render.js` | core | `renderPage`, `render404` |
| `src/build.js` | core | `build()` + CLI (`npm run build`) |
| `scripts/serve.js` | core | `npm run dev` |
| `src/fonts.js` | design | font registry |
| `src/icons.js` | design | `icon(kind)` -> inline SVG string |
| `src/looks/index.js` + `src/looks/*.js` | design | the page looks |

## Exports (exact)

```js
// src/color.js
parseHex(str)            // '#abc' | '#AABBCC' -> '#aabbcc'; anything else -> null
contrastRatio(a, b)      // WCAG 2.x ratio, hex in, Number out (1..21)

// src/html.js
esc(str)                 // escapes & < > " '  (safe for text AND attribute values)

// src/kinds.js
KINDS                    // { [kind]: { label: string, scheme: 'https:'|'tel:'|'mailto:'|'viber:', social: boolean } }
// v2 kinds: spec section 2 (adds whatsapp viber youtube shopee lazada x linkedin spotify custom).
// phone -> 'tel:', email -> 'mailto:', viber -> 'viber:', every other kind -> 'https:'

// src/migrate.js
migrateRaw(raw)          // pure, never throws, never mutates, idempotent; see spec section 3

// src/embed.js
parseVideo(url)          // -> { provider, id, vertical } | { error }
videoEmbed(block, name)  // -> the only iframe markup any look may emit

// src/redirects.js
applyRename(redirects, from, to, liveSlugs)   // -> { ok:true, redirects } | { ok:false, status, error }
validateRedirects(redirects, liveSlugs)       // -> string[]

// src/validate.js
validateSite(raw)        // -> { ok, site, errors }
validateClient(raw, { folder, looks, fonts, bodyFonts = fonts, files })  // -> { ok, client, errors, warnings }
//   looks: string[] of allowed look ids, fonts: string[] of font ids, bodyFonts: ids with body:true,
//   files: string[] of file names present in the client folder. Calls migrateRaw first.
//   warnings is always an array, also when ok is false.
LIMITS                   // { blocks:30, links:20, videos:3, socials:2, socialItems:8, heading:60, text:280, label:40, branches:6, branchName:40, branchAddress:80, branchHours:40 }

// src/render.js
renderPage(client, site, { looks, fonts })  // -> full HTML string (v2: blocks, three fonts)
render404(site, { fonts })                  // -> full HTML string

// src/build.js
build({ root, outDir, site, looks, fonts }) // -> Promise<{ pages: string[], warnings: { [slug]: string[] } }>
//   pages: slugs, sorted. warnings: only slugs that have any; warnings never block a build.
//   root: folder containing clients/. looks/fonts default to the real registries.

// src/looks/index.js
looks                    // { [id]: { label, render(ctx) -> string, css(ctx) -> string } }

// src/fonts.js
fonts                    // { [id]: { family, fallback, group, body, headingWeight, files: [{ file, weight, style, path }] } }
//   30 families, registry rules in spec section 6. file: output name under /fonts/, path: source path

// src/icons.js
icon(kind)               // -> '<svg ...>...</svg>' (aria-hidden="true", currentColor)
```

## Normalized client (what validateClient returns, what looks receive)

```js
{
  slug, name, tagline,              // tagline: string | null
  look,                             // a key of looks
  theme: { bg, ink, accent, onAccent },   // lowercase #rrggbb
  font: { heading, tagline, body }, // font ids, defaults 'fraunces' / body / 'inter'
  logo, cover,                      // file name in the client folder, or null
  blocks: [                         // 1..30, order kept (v2, replaces links)
    { type:'link', kind, url, label, primary },   // primary: true on the FIRST link block only; zero link blocks allowed
    { type:'heading'|'text', text },
    { type:'socials', items:[{ kind, url, label }] },
    { type:'video', url, provider, id, vertical, src },
  ],
  branches: [{ name, address, maps, hours }],  // missing fields -> null; [] when absent
  credit,                           // boolean, default true
}
```

## Validation rules (validateClient)

Collect **every** error, not the first. Each error is a string starting with the field path,
e.g. `links[2].url: ...`, `theme.ink: ...`, `slug: ...`.

- Unknown top-level key -> error (catches typos like `colour`).
  Allowed keys: slug name tagline look theme font logo cover blocks branches credit.
  `links` is accepted only via `migrateRaw`; next to `blocks` it is the error `links: v1 key, use blocks`.
- `slug`: `/^[a-z0-9]+(-[a-z0-9]+)*$/`, length 2..40, not one of `assets fonts 404 index api media`,
  must equal `folder`.
- `name`: non-empty after trim, <= 60 chars. Trimmed.
- `tagline`: optional string <= 120 chars.
- `look`: must be in `looks`.
- `theme.bg`, `theme.ink`, `theme.accent`: required, must parse with `parseHex`.
  - v2: contrast is **warning only** (`warnings`, path-prefixed, ratio to 2 dp; exact texts in spec section 4):
    ink/bg < 4.5 on `theme.ink`; best text on accent < 3 on `theme.accent`; accent/bg < 3 on `theme.accent`.
  - `onAccent` = whichever of `ink` / `bg` has the higher contrast with `accent` (tie -> ink).
    Looks may only put `--on-accent` text on `--accent` at >= 19px bold (or >= 24px regular). Body-size text never sits on the accent.
- `font.heading`, `font.tagline`: optional, in `fonts`. `font.body`: optional, in `bodyFonts`.
  `font.display` next to `font.heading` -> `font.display: v1 key, use font.heading`.
- `logo`, `cover`: optional. Must match `/^[a-z0-9][a-z0-9._-]*\.(svg|png|jpe?g|webp)$/i`,
  contain no `..`, and be in `files`.
- `blocks`: array, 1..30 items, types `link heading text socials video`; per-type rules, limits and
  unknown-key errors (`blocks[i].<key>: unknown key`) in spec section 1. Link blocks:
  - `kind` in `KINDS`; `kind: 'custom'` requires `label` (1..40).
  - `url`: string, no whitespace or control characters, and `new URL(url).protocol`
    equals the kind's scheme. (`javascript:`, `http:`, `data:` all rejected.)
  - `label`: optional, non-empty, <= 40 chars; default `KINDS[kind].label`.
  - `socials.items[j].kind` must have `social: true`. `video.url` goes through `parseVideo`.
- `branches`: optional array <= 6 (was 10; changed 2026-11-11 so the worst-case page stays under 30 KB). `name` required <= 40 chars, `address` <= 80, `hours` <= 40; errors are path-prefixed like the other limits. `maps` if present must be `https:`.
- `credit`: optional boolean.

## validateSite

- `origin`: `https://` URL with no path and no trailing slash.
- `base`: starts and ends with `/`.
- `mainSite`: `https://` URL.

## Page rules (renderPage), for every look

- `<!doctype html>`, `<html lang="en">`, viewport meta, `<title>` = name,
  `<meta name="theme-color" content="{theme.bg}">`.
- Page URL = `{origin}{base}{slug}/`. Used for `<link rel="canonical">` and `og:url`.
- `og:title` = name. `og:description` = tagline, else `"{name}: links, location and contact"`.
- `og:image` = absolute URL of cover, else of logo, else omitted.
- Asset URLs in the page are root-relative with base: `{base}{slug}/{file}`.
- Every client string is escaped with `esc`, in text and attributes.
- Each block renders as exactly one element with `data-block="{type}"`, in the client's order.
  Link blocks render `<a href="{url}" data-block="link" data-kind="{kind}">`; the block with `primary:true` also carries `data-primary`.
  Socials, heading, text and video markup: spec section 7.
- `credit: true` -> a link to `site.mainSite` containing the text `Khybrio`. `false` -> none.
- No `<script` anywhere. No external stylesheet. One inline `<style>`. Video iframes only via `videoEmbed`, no `style=` attribute.
- `@font-face` only for the (deduped) heading, tagline and body fonts the client uses, src `{base}fonts/{file}`.
- Theme exposed as CSS custom properties on `:root`:
  `--bg --ink --accent --on-accent --font-heading --font-tagline --font-body --heading-weight`.
- Size: the HTML string (inline CSS included, images and fonts excluded) < 30 KB.

## Look ctx (what `render(ctx)` / `css(ctx)` receive)

```js
{ client, site, asset(file) /* -> '{base}{slug}/{file}' */, esc, icon, pageUrl, embed(block), text(str) }
```
Look interface and the per-look enforced rules: spec section 7. `src/looks/shared.js` exports `blockHtml(ctx, block, cls)`.
Looks own markup inside `<body>`. Core owns `<head>`, `:root` vars and `@font-face`.
A look must output each link exactly as the page rules say (href, data-kind, data-primary).
- `data-kind` goes ONLY on link-block and socials anchors. Branch map links and the credit link get none.
- Looks never use `<b>`, `<i>` or `<u>` elements (tests treat those as leaked client markup).
  Use `<strong>`, `<em>`, `<span>`.
- Looks render the credit link (placement is a design call) when `client.credit` is true.
- Meta tags are written as `<meta property|name="..." content="...">` (key before content).

## build()

- Reads every `clients/<folder>/client.js` (default export). Folders starting with `_` are skipped.
- Validates the site, **all** clients and `clients/_redirects.json` (`validateRedirects`) first. If any is invalid: throw one Error whose
  message lists every failing folder and its errors, and write **nothing** (outDir untouched).
- Otherwise: empty outDir, then write
  - `{slug}/index.html` per client, plus its `logo` / `cover` files copied beside it
  - `fonts/{file}` for every font file any client uses (each once)
  - `_redirect/{old}` per redirect record (text body = target slug)
  - `404.html` (render404). No `.nojekyll` (GitHub Pages is retired)
  - `index.html`: redirect to `site.mainSite` (meta refresh + a plain link), no client list
- Returns `{ pages, warnings }`: the slugs sorted, and warnings only for slugs that have any.

## Hardening (added after review, 2026-11-10)

- `site.base` must match `/^\/([A-Za-z0-9._~-]+\/)*$/`.
- build() writes into a temp dir beside `outDir` and swaps it in only when everything succeeded.
  Any failure (validation, render, copy, font) leaves `outDir` exactly as it was.
- Asset names in `files` are regular files only (a directory named `logo.png` is not a file).
- SVG logo/cover: rejected (error on `logo` / `cover`) if it contains `<script`, an `on*=` attribute
  (any case, optional spaces before `=`), or `foreignObject`.
- Dev server: concurrent requests share one in-flight rebuild; binds 127.0.0.1.

## Studio (local dashboard)

`npm run studio` -> `node scripts/studio.js` -> listens on 127.0.0.1, PORT env or 4322, prints the URL.
v2 studio changes (state fields, rename route, publish, UI): spec sections 8, 10, 11.
The studio always runs on the owner's Mac. Login (Supabase) is in "Studio login (v4)" below.

### Module
`src/studio/server.js` exports `createStudio({ root, site, publish, auth, publicOrigin, now })` -> an `http.Server` (not listening).
`auth` and `publicOrigin` are v4, see "Studio login (v4)". `now` (tests only): `() -> ms`, defaults to `Date.now`.
- `root`: repo root (contains `clients/`). `site`: validated site config.
- `publish`: `async ({ root, force }) -> { ok, output, live, backup, push }`. v2 default (`src/publish/index.js`, spec section 10):
  build to a temp dir, sync changed files to the R2 bucket, then a local git commit of `clients` and a background push as backup.
  v1 (git push as the deploy) is retired.
- Shared SVG check lives in `src/assets.js` as `svgProblem(text) -> string | null`; build.js uses it too.

### Security (every /api/* route)
- Request must carry header `x-khybrio-studio: 1`, else 403.
- If an `Origin` header is present it must be `http://localhost:{port}`, `http://127.0.0.1:{port}` or (v4) `publicOrigin`, else 403.
- `:slug` in any route must match the slug regex; anything else -> 400. No path is ever built from
  unchecked input.
- JSON bodies over 256 KB -> 413.

### Routes
| Method + path | Result |
|---|---|
| `GET /` and `/studio/*` static | the dashboard app from `studio/` (index.html, studio.css, studio.js) |
| `GET /api/state` | v2: `{ site, looks, fonts:[{id,family,group,body}], kinds:[{id,label,scheme,social}], palettes, limits, backup, clients:[...], pending:[slug] }` (spec section 10) |
| `GET /api/clients/:slug` | `{ data, files }` migrated (v2) object from client.js + regular file names in the folder; 404 if missing |
| `POST /api/clients/:slug/rename` `{ to }` | v2: 200 `{ ok:true, slug }`; 404/409/422 `{ error }`. Moves the folder, rewrites `slug`, writes `clients/_redirects.json` (spec section 8) |
| `POST /api/preview` `{ slug, data }` | 200 `{ ok:true, errors:[], warnings, html }` or 200 `{ ok:false, errors, warnings, html:null }` |
| `PUT /api/clients/:slug` `{ data, create }` | 200 `{ ok:true, warnings }` (writes migrated data); 422 `{ ok:false, errors }` (nothing written); 409 if `create` and folder has a client.js; 404 if not `create` and missing |
| `POST /api/clients/:slug/assets?name=<file>` raw body | 201 `{ file }`; 422 `{ error }` |
| `POST /api/publish` `{ force? }` | `{ ok, output, live, backup, push }` from `publish`; 409 while another publish runs |
| `GET /p/fonts/:file`, `GET /p/:slug/:file` | preview assets: fonts from the registry, files from `clients/:slug/` |

- `clients[]` items: `{ slug, name, tagline, look, theme:{bg,ink,accent}, logo, blockCount, liveUrl, valid, errors, warnings }`,
  sorted by slug. Folders starting with `_` skipped. A broken client.js shows up with `valid:false`, it never
  breaks the list. `liveUrl` = `{origin}{base}{slug}/`.
- `pending`: slugs whose folder has uncommitted git changes (empty list when not a git repo).
- Preview renders with site `{ origin: 'http://localhost', base: '/p/', mainSite: site.mainSite }`,
  validating with `files` = what is on disk in that client folder (empty for a new client).
- PUT validates exactly like build (folder = slug, files on disk) and writes
  `clients/<slug>/client.js` as `export default <JSON, 2-space indent>\n`. Write is atomic (temp file + rename).
- Asset upload: `name` is lowercased, spaces -> `-`, then must match the asset regex from validate
  (svg/png/jpg/jpeg/webp). Max 3 MB. SVG must pass `svgProblem`. Creates the folder if missing
  (slug already checked). Overwrites a same-named file.

### QR codes (studio)
`GET /qr/:slug.png` (1200px) and `GET /qr/:slug.svg` encode exactly `{origin}{base}{slug}/`, the same
URL as the NFC chip. Plain GET with no studio header (an `<img>` cannot send one; the URL is public).
404 for a bad slug, a missing client or a client.js that does not load. `?download=1` adds
`Content-Disposition: attachment; filename="<slug>-qr.<ext>"`. Dark #0f2b29 on white, ECC M, 4-module margin.

## Studio login (v4, Supabase)

The studio still runs only on the owner's Mac. v4 adds accounts so a co-worker can use it through a tunnel
(Cloudflare Tunnel, Tailscale Funnel, ngrok: the owner's choice, not part of this repo). Supabase is used for
accounts only: pages, images and video stay in `clients/` and R2. Sessions live in the studio's memory.

### Config (`.env.local`, git-ignored, values never logged or sent to the browser)
- `SUPABASE_URL` (https), `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: all three, or none.
- `STUDIO_PUBLIC_ORIGIN` (optional): the tunnel's address, e.g. `https://studio.example.com`. `https:` origin, no path.
- `scripts/studio.js`: all three Supabase keys -> login on. None -> login off, prints a warning, loopback only (v3 behaviour).
  Some but not all -> exit 1 naming the missing keys. `STUDIO_PUBLIC_ORIGIN` without login -> exit 1 (never expose an open studio).
- `src/publish/env.js` exports `loadStudioEnv(root) -> { auth: {url, anonKey, serviceKey} | null, missing: [names], publicOrigin: string | null, error: string | null }`.

### Supabase adapter (`src/studio/supabase.js`)
`createSupabaseAuth({ url, anonKey, serviceKey, fetch })` -> the `auth` object. Plain `fetch`, no SDK.
- `signIn(email, password)` -> user | null. `POST {url}/auth/v1/token?grant_type=password` with `apikey: anonKey`. 400/401 -> null.
- `getUser(id)` -> user | null (404 -> null). `listUsers()` -> users with a studio role only (pages of 200, at most 20 pages).
- `createUser({ email, password, role })` -> user; email already registered -> throws `{ code: 'exists' }`.
  Sets `email_confirm: true` and `app_metadata.studio_role`.
- `setPassword(id, password)`, `setRole(id, role)` -> user. `deleteUser(id)` -> undefined.
- Admin calls use `apikey` + `Authorization: Bearer` = serviceKey against `{url}/auth/v1/admin/users[...]`.
- user = `{ id, email, role, createdAt, lastSignInAt, banned }`. `role` = `app_metadata.studio_role` when it is `admin`
  or `editor`, else null. `banned` = `banned_until` is in the future. Any other non-2xx -> throws `{ code: 'upstream', status }`,
  message never contains a key.

### Server rules when `auth` is given
- `publicOrigin` without `auth` -> `createStudio` throws. With it, `Host` may also be the public origin's host.
- Open without a session: `GET /`, `/studio/*`, `/p/fonts/*`, `GET /api/session`, `POST /api/login`. Everything else needs a session:
  `/api/*` -> 401 `{ error: 'Sign in first' }`; `/p/:slug/*` and `/qr/*` -> 401 text. The studio header + Origin rules still apply to every `/api/*`.
- `POST /api/login { email, password }`: unknown email, wrong password, no studio role or banned -> 401
  `{ error: 'Wrong email or password' }` (one message for all). Success -> 200 `{ user: {id,email,role} }` and cookie
  `khybrio_studio=<43-char base64url>; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`, plus `; Secure` when the request came
  through `publicOrigin` (Host is its host or `x-forwarded-proto: https`). 10 failures for one email within 15 minutes -> 429
  `{ error: 'Too many tries. Wait 15 minutes.' }` for that email until the window passes; 100 failures overall in 15 minutes -> 429 for everyone.
- Sessions: in memory (a restart signs everyone out), 12 hours from sign-in. Every 5 minutes of use the server re-reads the user
  with `getUser`: gone, banned or no role -> session ended (401); role change applies. Supabase unreachable on a re-check -> 503, session kept.
- `GET /api/session` -> `{ login: true, user: {id,email,role} | null }`; without `auth`: `{ login: false, user: null }`.
- `POST /api/logout` -> 200 `{ ok: true }`, ends the session, clears the cookie.
- Roles: `editor` = everything in "Routes" above (edit, upload, rename, publish). `admin` = editor + the Team routes.

### Team routes (admin only; editor -> 403 `{ error: 'Admins only' }`; `:id` must be a UUID else 400)
| Method + path | Result |
|---|---|
| `GET /api/users` | `{ users: [{id,email,role,createdAt,lastSignInAt,banned}] }` sorted by email |
| `POST /api/users { email, role }` | 201 `{ user, password }`; 422 bad email / role; 409 `{ error: 'That email already has an account' }` |
| `POST /api/users/:id/password` | 200 `{ password }` (new generated password; that user's studio sessions end) |
| `PUT /api/users/:id { role }` | 200 `{ user }`; 422 bad role |
| `DELETE /api/users/:id` | 200 `{ ok: true }` (that user's studio sessions end) |
- An admin cannot change their own role or delete themselves -> 409 `{ error: 'You cannot do that to your own account' }`.
- Generated password: 20 characters from `abcdefghjkmnpqrstuvwxyzACDEFGHJKMNPQRTUVWXYZ2346789` via `crypto.randomInt`, shown as
  4 groups of 5 joined by `-` (23 chars). Returned once, never stored or logged by the studio.
- Supabase errors -> 502 `{ error: 'Supabase did not answer. Try again.' }`.

### First admin
`npm run studio-admin -- <email>` (`scripts/studio-admin.js`): creates the account as `admin` with a generated password and prints it once,
or, if the email exists, makes it `admin` and prints a new password. Needs the three Supabase keys.

### UI
- Boot: `GET /api/session`; login on and no user -> sign-in screen (email, password). Any 401 from the API -> back to sign-in.
- Top bar: the signed-in email, `Team` (admins), `Sign out`.
- `#/team` (admins): list of logins; add (email + role) shows the generated password once with a copy button; reset password;
  change role; remove (with confirm). Your own row has no role change or remove.

## Hosting v2 (Cloudflare R2 + Worker)

GitHub Pages is retired. Full design and the reasons (R2 over KV and Static Assets): spec section 9.
- Bucket `khybrio-tap` mirrors `dist/` exactly, plus `_redirect/{old}` objects and a `media/` prefix that sync never touches.
- `site.config.js` base is `/`. Origin is `https://khybrio-tap.{subdomain}.workers.dev` now, `https://tap.khybrio.com` later (origin edit only). Publish refuses any other base.
- `worker/handler.js` `handle(request, bucket)` response table, CSP and object metadata: spec section 9.
- Rename leaves a permanent record in `clients/_redirects.json` (flat `{ old: live }`). The response is **302 + `no-store`**, never 301.
- Publish secrets live in `.env.local` (`CF_ACCOUNT_ID R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY`), git-ignored (`.env*`, `.wrangler/`). The repo is public.
- Sync refuses to delete more than `max(3, half)` of live pages unless `force:true`.
