# Learnings: khybrio-tap

## 2026-11-10 - Colour rule
Coral `#e8622d` is a mid-tone: it cannot reach 4.5:1 with cream or teal-deep. The accent rule is
therefore 3:1 (WCAG large text), and looks may only put text on the accent at >= 19px bold.

## 2026-11-10 - Hosting
GitHub Pages cannot route `/slug` to one app, so every client is a real `slug/index.html`.
A project repo with a custom domain forwards its old github.io URLs, which is why the main
Khybrio site stays in `bored-six/Khybrio` (old cards point there).

## 2026-11-10 - Hosting v2
- R2 over KV and Static Assets: KV is eventually consistent (up to 60 s) with 1k free writes/day, so "live in 1-2 s"
  is not guaranteed. Static Assets needs a full wrangler deploy per publish (10-20 s). R2 is strongly consistent and a
  publish is a few PUTs of changed files. The same bucket later holds images/mp4 under `media/`, which sync never deletes.
- Renames answer 302 + `no-store`, not 301. A browser-cached 301 A->B plus a later rename back B->A makes phones loop
  forever; a 302 cannot be cached that way. The redirect record itself is permanent. Tap pages need no SEO juice.
- Mass-delete guard: sync refuses to delete more than `max(3, half)` of live pages (or to run on an empty `dist/`)
  unless `force:true`, so one bad build or a wrong folder cannot wipe the live site.
- The repo is public and `.env.local` now holds Cloudflare keys: `.env*` and `.wrangler/` are git-ignored, and a test
  asserts `git check-ignore -q .env.local`.

## 2026-11-10 - Build and dev server
- Builds go to a temp dir and swap in only on success. Never `rm` outDir before rendering finishes.
- The dev server rebuilds per request; concurrent requests must share one in-flight build or
  they delete each other's files mid-write.
- SVG client assets are served raw on our origin, so the build rejects script, on*= and
  foreignObject inside them. Facebook/Messenger ignore SVG og:images: real covers should be jpg/webp.
- Node 24 `node --test test/` treats `test/` as a file; use the glob `"test/*.test.js"`.

## 2026-11-10 - Studio
- The studio is a localhost write server: every /api call needs the `x-khybrio-studio` header and a
  local Origin, so another website open in the browser cannot make it write files or push.
- Uploading an image for a never-saved page leaves a folder with no client.js. Build and studio both
  skip such folders (`listClientFolders`), otherwise Publish would push a folder that breaks CI.
- Studio saves rewrite client.js as plain JSON, so hand-written comments in client.js are lost on save.

## 2026-11-10 - Brand
- The main site's `khybrio-mark.svg` / `-clean.svg` / `khybrio-glyph.svg` were the OLD K-burst mark and
  were still named as "the logo" in its ASSETS.md. The current mark is `khybrio-mark.png` (swirl on teal tile)
  and `khybrio-glyph.png` (cream, no tile). Never copy brand files by hand: `npm run sync-brand`.

## 2026-11-10 - Studio preview security
- The preview is a srcdoc iframe with `allow-scripts allow-same-origin` (YouTube embeds need both), so it runs
  on the studio origin next to the write/publish API. It is safe only because `withPreviewCsp` injects
  `script-src 'none'` as the first `<head>` child. Any new path that sets the preview's srcdoc/src must go through it.
- The studio answers only Host `localhost:{port}` / `127.0.0.1:{port}` (DNS rebinding sends no Origin).

## 2026-11-10 - Brand contrast
- Khybrio coral `#e8622d` on teal-deep `#1c4d4a` is 2.81:1 accent/bg, so the v2 check warns on the Khybrio page.
  It is a warning, not a block. The `khybrio` starter palette uses a cream bg instead (3.14:1).

## 2026-11-10 - Parallel agents
- Agents share one git index: a `git commit` takes whatever anyone has staged. Stage only your files and check
  `git show --stat HEAD` after committing.
