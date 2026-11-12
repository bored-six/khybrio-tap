# khybrio-tap

Tap pages for Khybrio's NFC cards. One folder in `clients/` = one page.
Separate from the main site (`../Khybrio`) on purpose: a site redesign must never break a card.

**This is not a Salesforce project.** The Salesforce orchestrator rules in `~/Documents/CLAUDE.md`
do not apply here. The global `~/.claude/CLAUDE.md` does.

## Rules
- The contract is `.claude/specs/contract.md` (v3; details in `.claude/specs/mvp-showcase.md` and `.claude/specs/v3-style-and-media.md`). Tests in `test/` were written from it first. Change the
  contract before changing behaviour.
- We ship no JavaScript of our own. The one exception is YouTube/TikTok video iframes, built only by `videoEmbed`.
  One inline `<style>`. Keep each page under 30 KB before images/fonts.
- Pages can have a `background` (colour, gradient, photo, mp4) and a `style` (8 shape/fill/layout options, `src/style.js`).
  Looks declare `supports`; unset = the look as it was. **mp4 files are git-ignored** (`clients/**/*.mp4`): R2 and this Mac are the
  only copies, so never delete one from `clients/` before it is published. Video cap 15 MB (studio warns over 5 MB), H.264 only.
- **A chip URL is permanent.** No chips get written until the domain (`tap.khybrio.com`) is live.
  Switching hosts = edit `site.config.js` only. Rename a page only through the studio, which leaves a
  redirect in `clients/_redirects.json` so the old URL keeps working. Never rename a client folder by hand.
- Hosting is Cloudflare R2 + one Worker (GitHub Pages is retired). Secrets live in `.env.local`, which is
  git-ignored. The repo is public: never commit a key, never push without a client-name/price scan.
- Brand: teal-deep `#1c4d4a`, cream `#f5f7f6`, coral `#e8622d` (accent, sparingly), ink `#0f2b29`.
  Fraunces for display, Inter for body. No emojis, no stock icon packs: icons are hand-made in `src/icons.js`.
- **Khybrio's own logo is never copied by hand.** It comes from the main site via `npm run sync-brand`
  (list in `brand/sync.json`). `npm test` fails when the main site's logo changes and this repo has not synced.
- Real client details go in only with the client's written permission (same rule as the main site).

## Adding or editing a client
Easiest: `npm run studio`, open http://localhost:4322/, click New page (or Edit), Save, then Publish live
(uploads changed files to R2, then commits and pushes `clients/` as a backup).
By hand: copy `clients/demo-cafe/` to `clients/<slug>/`, edit `client.js`, `npm run build` to check.
The studio runs only on this Mac. Login is Supabase (accounts only; files stay in `clients/` and R2): put
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, make yourself admin once with
`npm run studio-admin -- you@example.com`, then add co-workers on the studio's Team page. Co-workers reach the studio
through a tunnel; set `STUDIO_PUBLIC_ORIGIN` to its https address. No Supabase keys = no login, localhost only.

## Commands
- `npm test`, `npm run build`, `npm run dev` (serves `dist/` through the Worker handler at http://localhost:4321/)
- `npx wrangler deploy` (Worker only; page content goes live through Publish, not a deploy)
- `npm run studio` (dashboard at http://localhost:4322/), `npm run studio-admin -- <email>` (first admin)
