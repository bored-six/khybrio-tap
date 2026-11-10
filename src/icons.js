// Hand-drawn icons. One family, so the next glyph can be drawn without guessing:
//
//   Grid      24x24 viewBox, live area 3..21, optical centre 12,12.
//   Stroke    1.75, round caps, round joins, currentColor, never filled.
//   Corners   radius 2.5 on boxes (4.75 on the Instagram square), radius 0 nowhere.
//   Dot       at most ONE solid dot per glyph, r = 1.5, at the glyph's focal point
//             (pin centre, booked day, nail, browser light, lens). Keep 0.6+ clear of strokes.
//   Brands    simplified to the one silhouette people recognise, drawn in the same stroke.
//
// Returned markup is decorative: aria-hidden, the link text carries the meaning.

const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.5" fill="currentColor" stroke="none"/>`

const GLYPHS = {
  // five-point star, outer r 9.2, inner r 4.2, centred at 12,12.6
  review: '<path d="M12 3.4l2.47 5.8 6.28.56L16 13.9l1.41 6.14L12 16.8l-5.41 3.24L8 13.9 3.25 9.76l6.28-.56z"/>',
  // teardrop pin, head r 6.5 at 12,10.25
  maps:
    '<path d="M12 21.25s-6.5-5.85-6.5-11a6.5 6.5 0 0 1 13 0c0 5.15-6.5 11-6.5 11z"/>' + dot(12, 10.25),
  // a menu board hanging off a nail
  menu: '<path d="M8 8.5L12 4.25 16 8.5"/><rect x="3.5" y="8.5" width="17" height="12" rx="2.5"/><path d="M7.5 12.75h9M7.5 16.5h5.5"/>' + dot(12, 4.25),
  // calendar page, the booked day is the dot
  booking: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>' + dot(15.75, 15.25),
  // carry bag, slightly tapered
  order: '<path d="M5.2 8.5h13.6L18 19.1a1.5 1.5 0 0 1-1.5 1.4h-9A1.5 1.5 0 0 1 6 19.1z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  // browser window: one light, one address bar
  website: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 10h18M9.75 7h7.5"/>' + dot(6.6, 7),
  // speech bubble with the zigzag
  messenger:
    '<path d="M12 3.75c-4.8 0-8.25 3.45-8.25 7.85 0 2.4 1.05 4.5 2.75 5.9v3l2.9-1.5c.8.25 1.7.4 2.6.4 4.8 0 8.25-3.45 8.25-7.8S16.8 3.75 12 3.75z"/><path d="M7.75 13.5l2.85-3.1 2.6 2.2 3.05-3"/>',
  // ring with the f; the stem runs into the ring
  facebook: '<circle cx="12" cy="12" r="8.75"/><path d="M13.25 20.6v-9.85A2.75 2.75 0 0 1 16 8h.75M9.75 13H16"/>',
  // rounded square, lens, light
  instagram: '<rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.75"/><circle cx="12" cy="12" r="3.75"/>' + dot(16.9, 7.1),
  // the note: head, stem, flag
  tiktok: '<path d="M13.5 3.75v11.5a3.75 3.75 0 1 1-3.75-3.75M13.5 3.75c.35 2.65 2.25 4.55 5 4.75"/>',
  // handset
  phone:
    '<path d="M6.2 3.75h2.7l1.6 4.15-2.05 1.4a10.7 10.7 0 0 0 5.25 5.25l1.4-2.05 4.15 1.6v2.7c0 1.8-1.35 3.45-3.15 3.45C9.4 19.8 4.2 14.6 3.75 7.9V6.2c0-1.35 1.1-2.45 2.45-2.45z"/>',
  // envelope
  email: '<rect x="3.25" y="5.5" width="17.5" height="13" rx="2.5"/><path d="M4.25 7.5L12 13l7.75-5.5"/>',

  // extras used by the looks, not link kinds
  arrow: '<path d="M4.75 12h14.5M13.75 6.5L19.25 12l-5.5 5.5"/>',
  out: '<path d="M7 17L17 7M9.5 7H17v7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.75"/><path d="M12 7.5V12l3 1.75"/>',
}
GLYPHS.pin = GLYPHS.maps

export function icon(kind) {
  const body = GLYPHS[kind] || GLYPHS.arrow
  return (
    `<svg class="ic" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
  )
}
