# Contract: khybrio-tap v1

Static generator. Each folder in `clients/` becomes one page at `{origin}{base}{slug}/`.
Pages ship **zero JavaScript**: plain HTML with CSS inlined in one `<style>`.
Node >= 20, no runtime dependencies. Tests: `node --test test/`.

## Files and ownership

| File | Owner | Purpose |
|---|---|---|
| `src/kinds.js` | core | link kinds: default label + allowed URL scheme |
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
KINDS                    // { [kind]: { label: string, scheme: 'https:'|'tel:'|'mailto:' } }
// kinds: review maps menu booking order website messenger facebook instagram tiktok phone email
// phone -> 'tel:', email -> 'mailto:', every other kind -> 'https:'

// src/validate.js
validateSite(raw)        // -> { ok, site, errors }
validateClient(raw, { folder, looks, fonts, files })  // -> { ok, client, errors }
//   looks: string[] of allowed look ids, fonts: string[] of font ids,
//   files: string[] of file names present in the client folder

// src/render.js
renderPage(client, site, { looks, fonts })  // -> full HTML string
render404(site, { fonts })                  // -> full HTML string

// src/build.js
build({ root, outDir, site, looks, fonts }) // -> Promise<{ pages: string[] }>  (slugs, sorted)
//   root: folder containing clients/. looks/fonts default to the real registries.

// src/looks/index.js
looks                    // { [id]: { label, render(ctx) -> string, css(ctx) -> string } }

// src/fonts.js
fonts                    // { [id]: { family, fallback, files: [{ file, weight, style, path }] } }
//   file: output name under /fonts/, path: absolute or root-relative source path

// src/icons.js
icon(kind)               // -> '<svg ...>...</svg>' (aria-hidden="true", currentColor)
```

## Normalized client (what validateClient returns, what looks receive)

```js
{
  slug, name, tagline,              // tagline: string | null
  look,                             // a key of looks
  theme: { bg, ink, accent, onAccent },   // lowercase #rrggbb
  font: { display, body },          // font ids, default 'fraunces' / 'inter'
  logo, cover,                      // file name in the client folder, or null
  links: [{ kind, url, label }],    // 1..12, order kept, links[0] is the primary action
  branches: [{ name, address, maps, hours }],  // missing fields -> null; [] when absent
  credit,                           // boolean, default true
}
```

## Validation rules (validateClient)

Collect **every** error, not the first. Each error is a string starting with the field path,
e.g. `links[2].url: ...`, `theme.ink: ...`, `slug: ...`.

- Unknown top-level key -> error (catches typos like `colour`).
  Allowed keys: slug name tagline look theme font logo cover links branches credit.
- `slug`: `/^[a-z0-9]+(-[a-z0-9]+)*$/`, length 2..40, not one of `assets fonts 404 index`,
  must equal `folder`.
- `name`: non-empty after trim, <= 60 chars. Trimmed.
- `tagline`: optional string <= 120 chars.
- `look`: must be in `looks`.
- `theme.bg`, `theme.ink`, `theme.accent`: required, must parse with `parseHex`.
  - `contrastRatio(ink, bg) >= 4.5`, else error on `theme.ink`.
  - `onAccent` = whichever of `ink` / `bg` has the higher contrast with `accent`
    (tie -> ink). If that contrast is < 3 -> error on `theme.accent`.
    3:1 is the WCAG large-text bar, so looks may only put `--on-accent` text on `--accent`
    at >= 19px bold (or >= 24px regular). Body-size text never sits on the accent.
- `font.display`, `font.body`: optional, must be in `fonts`.
- `logo`, `cover`: optional. Must match `/^[a-z0-9][a-z0-9._-]*\.(svg|png|jpe?g|webp)$/i`,
  contain no `..`, and be in `files`.
- `links`: array, 1..12 items. Each:
  - `kind` in `KINDS`.
  - `url`: string, no whitespace or control characters, and `new URL(url).protocol`
    equals the kind's scheme. (`javascript:`, `http:`, `data:` all rejected.)
  - `label`: optional, non-empty, <= 40 chars; default `KINDS[kind].label`.
- `branches`: optional array <= 10. `name` required. `maps` if present must be `https:`.
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
- Each link renders as `<a href="{url}" data-kind="{kind}">`, in the client's order.
  `links[0]` also carries `data-primary`.
- `credit: true` -> a link to `site.mainSite` containing the text `Khybrio`. `false` -> none.
- No `<script` anywhere. No external stylesheet. One inline `<style>`.
- `@font-face` only for the fonts the client uses, src `{base}fonts/{file}`.
- Theme exposed as CSS custom properties on `:root`:
  `--bg --ink --accent --on-accent --font-display --font-body`.
- Size: the HTML string (inline CSS included, images and fonts excluded) < 30 KB.

## Look ctx (what `render(ctx)` / `css(ctx)` receive)

```js
{ client, site, asset(file) /* -> '{base}{slug}/{file}' */, esc, icon, pageUrl }
```
Looks own markup inside `<body>`. Core owns `<head>`, `:root` vars and `@font-face`.
A look must output each link exactly as the page rules say (href, data-kind, data-primary).
- `data-kind` goes ONLY on `client.links` anchors. Branch map links and the credit link get none.
- Looks never use `<b>`, `<i>` or `<u>` elements (tests treat those as leaked client markup).
  Use `<strong>`, `<em>`, `<span>`.
- Looks render the credit link (placement is a design call) when `client.credit` is true.
- Meta tags are written as `<meta property|name="..." content="...">` (key before content).

## build()

- Reads every `clients/<folder>/client.js` (default export). Folders starting with `_` are skipped.
- Validates the site and **all** clients first. If any is invalid: throw one Error whose
  message lists every failing folder and its errors, and write **nothing** (outDir untouched).
- Otherwise: empty outDir, then write
  - `{slug}/index.html` per client, plus its `logo` / `cover` files copied beside it
  - `fonts/{file}` for every font file any client uses (each once)
  - `404.html` (render404) and `.nojekyll`
  - `index.html`: redirect to `site.mainSite` (meta refresh + a plain link), no client list
- Returns `{ pages }`, the slugs sorted.

## Hardening (added after review, 2026-11-10)

- `site.base` must match `/^\/([A-Za-z0-9._~-]+\/)*$/`.
- build() writes into a temp dir beside `outDir` and swaps it in only when everything succeeded.
  Any failure (validation, render, copy, font) leaves `outDir` exactly as it was.
- Asset names in `files` are regular files only (a directory named `logo.png` is not a file).
- SVG logo/cover: rejected (error on `logo` / `cover`) if it contains `<script`, an `on*=` attribute
  (any case, optional spaces before `=`), or `foreignObject`.
- Dev server: concurrent requests share one in-flight rebuild; binds 127.0.0.1.
