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

  // round bubble, tail bottom-left, handset reduced to one hooked stroke
  whatsapp: '<path d="M3.75 20.25l1.06-4.38a8.5 8.5 0 1 1 3.32 3.31z"/><path d="M9.25 8.5v1a5.5 5.5 0 0 0 5.5 5.5h1"/>',
  // squarer bubble, tail straight down, the handset rings: one wave
  viber:
    '<path d="M8.25 17.75V21l3.25-3.25h4.25a4.5 4.5 0 0 0 4.5-4.5v-5.5a4.5 4.5 0 0 0-4.5-4.5h-7.5a4.5 4.5 0 0 0-4.5 4.5v5.5a4.5 4.5 0 0 0 4.5 4.5z"/><path d="M7.75 7.5v.75a5.5 5.5 0 0 0 5.5 5.5H14M12.5 7a4 4 0 0 1 4 4"/>',
  // the lozenge and the play triangle
  youtube: '<rect x="2.75" y="5.5" width="18.5" height="13" rx="4.5"/><path d="M10 9.25v5.5L14.75 12z"/>',
  // upright bag, tall handle, the S
  shopee:
    '<path d="M4.75 8.25h14.5l.7 10.1a2 2 0 0 1-2 2.15H6.05a2 2 0 0 1-2-2.15z"/><path d="M9.25 8.25V6.5a2.75 2.75 0 0 1 5.5 0v1.75M14.3 12.5c-.45-.75-1.3-1.2-2.3-1.2-1.35 0-2.3.7-2.3 1.7 0 2.3 4.6 1.2 4.6 3.5 0 1-.95 1.7-2.3 1.7-1 0-1.85-.45-2.3-1.2"/>',
  // the heart that is also an open box: lobes, then the fold down to the point
  lazada: '<path d="M12 20.5l-7.6-7.4a4.4 4.4 0 0 1 6.2-6.2L12 8.3l1.4-1.4a4.4 4.4 0 0 1 6.2 6.2zM7.5 10.25l4.5 3.25 4.5-3.25M12 13.5v7"/>',
  // heavy stroke drawn as an open bar, light stroke passes behind it
  x: '<path d="M4.25 4H8.5l11.25 16H15.5zM19 4l-5.6 6.4M10.5 13.7L5 20"/>',
  // tile with "in"; the dot is the i
  linkedin: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M8 11.5v5M11.75 11.5v5M11.75 13.75a2.25 2.25 0 0 1 4.5 0v2.75"/>' + dot(8, 8),
  // ring and three sound bars, each shorter and flatter
  spotify: '<circle cx="12" cy="12" r="8.75"/><path d="M7.25 9.6c3.3-1 6.9-.7 9.75.9M7.9 12.7c2.7-.75 5.5-.5 7.8.8M8.6 15.6c2-.5 4-.3 5.7.6"/>',
  // two chain links on the diagonal, each broken where it passes under the other
  custom:
    '<path d="M13.27 12.18a3 3 0 0 0-4.84-.85l-4.1 4.1a3 3 0 0 0 4.24 4.24l4.1-4.1a3 3 0 0 0 .5-.67M10.73 11.82a3 3 0 0 0 4.84.85l4.1-4.1a3 3 0 0 0-4.24-4.24l-4.1 4.1a3 3 0 0 0-.5.67"/>',

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
