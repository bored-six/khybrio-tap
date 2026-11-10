# khybrio-tap

Tap pages for Khybrio's NFC cards. One folder in `clients/` = one page.
Separate from the main site (`../Khybrio`) on purpose: a site redesign must never break a card.

**This is not a Salesforce project.** The Salesforce orchestrator rules in `~/Documents/CLAUDE.md`
do not apply here. The global `~/.claude/CLAUDE.md` does.

## Rules
- The contract is `.claude/specs/contract.md`. Tests in `test/` were written from it first. Change the
  contract before changing behaviour.
- Pages ship zero JavaScript. One inline `<style>`. Keep each page under 30 KB before images/fonts.
- **A chip URL is permanent.** No chips get written until the domain (`tap.khybrio.com`) is live.
  Switching hosts = edit `site.config.js` only. Never rename a client folder once its chip exists.
- Brand: teal-deep `#1c4d4a`, cream `#f5f7f6`, coral `#e8622d` (accent, sparingly), ink `#0f2b29`.
  Fraunces for display, Inter for body. No emojis, no stock icon packs: icons are hand-made in `src/icons.js`.
- Real client details go in only with the client's written permission (same rule as the main site).

## Adding or editing a client
Easiest: `npm run studio`, open http://localhost:4322/, click New page (or Edit), Save, then Publish live.
By hand: copy `clients/demo-cafe/` to `clients/<slug>/`, edit `client.js`, `npm run build` to check.
The studio runs only on this Mac and has no login yet (planned: Supabase, admin-managed accounts).

## Commands
- `npm test`, `npm run build`, `npm run dev` (serves `dist/` at http://localhost:4321/khybrio-tap/)
- `npm run studio` (dashboard at http://localhost:4322/)
