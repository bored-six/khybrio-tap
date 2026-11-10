# Learnings: khybrio-tap

## 2026-11-10 - Colour rule
Coral `#e8622d` is a mid-tone: it cannot reach 4.5:1 with cream or teal-deep. The accent rule is
therefore 3:1 (WCAG large text), and looks may only put text on the accent at >= 19px bold.

## 2026-11-10 - Hosting
GitHub Pages cannot route `/slug` to one app, so every client is a real `slug/index.html`.
A project repo with a custom domain forwards its old github.io URLs, which is why the main
Khybrio site stays in `bored-six/Khybrio` (old cards point there).

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
