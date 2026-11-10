# Learnings: khybrio-tap

## 2026-11-10 - Colour rule
Coral `#e8622d` is a mid-tone: it cannot reach 4.5:1 with cream or teal-deep. The accent rule is
therefore 3:1 (WCAG large text), and looks may only put text on the accent at >= 19px bold.

## 2026-11-10 - Hosting
GitHub Pages cannot route `/slug` to one app, so every client is a real `slug/index.html`.
A project repo with a custom domain forwards its old github.io URLs, which is why the main
Khybrio site stays in `bored-six/Khybrio` (old cards point there).
