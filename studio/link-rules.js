// Pure rules for what happens to a link row when its kind changes. Browser + node safe.
const HINTS = {
  'tel:': 'Phone links need a number like +63 912 345 6789',
  'mailto:': 'Email links need an address like name@example.com',
  'https:': 'This link needs an address starting with https://',
  'viber:': 'Viber links look like viber://chat?number=%2B639XXXXXXXXX',
}

// Placeholder text per kind, for the address input. Hints for the newer kinds come from the spec (section 2).
const PLACEHOLDER = {
  review: 'https://g.page/r/your-place/review', maps: 'https://maps.app.goo.gl/...', menu: 'https://...', booking: 'https://...',
  order: 'https://...', website: 'https://yourshop.ph', custom: 'https://...', messenger: 'https://m.me/yourpage',
  facebook: 'https://facebook.com/yourpage', instagram: 'https://instagram.com/yourhandle', tiktok: 'https://tiktok.com/@yourhandle',
  phone: 'tel:+639171234567', email: 'mailto:hello@yourshop.ph', whatsapp: 'https://wa.me/639XXXXXXXXX',
  viber: 'viber://chat?number=%2B639XXXXXXXXX', youtube: 'https://youtube.com/@yourchannel', shopee: 'https://shopee.ph/yourshop',
  lazada: 'https://lazada.com.ph/shop/yourshop', x: 'https://x.com/yourhandle', linkedin: 'https://linkedin.com/company/yourco',
  spotify: 'https://open.spotify.com/...',
}
export function placeholderFor(kind, scheme) {
  return PLACEHOLDER[kind] || (scheme === 'tel:' ? 'tel:+63...' : scheme === 'mailto:' ? 'mailto:...' : scheme === 'viber:' ? 'viber://chat?number=...' : 'https://...')
}

// Returns { kind, label, url, hint, needsLabel }. hint is '' when the url fits (or is empty).
export function switchKind(link, toKind, kinds) {
  const by = (id) => kinds.find((k) => k.id === id)
  const prev = by(link.kind)
  const next = by(toKind) || { id: toKind, label: toKind, scheme: 'https:' }
  const typed = (link.label || '').trim()
  const label = !typed || (prev && typed === prev.label) ? next.label : link.label
  let url = link.url || ''
  const v = url.trim()
  if (v && !v.toLowerCase().startsWith(next.scheme)) {
    if (next.scheme === 'tel:' && /^\+?[\d\s()-]{6,}$/.test(v)) url = 'tel:' + v.replace(/[\s()-]/g, '')
    else if (next.scheme === 'mailto:' && /^[^\s@:]+@[^\s@]+\.[^\s@]+$/.test(v)) url = 'mailto:' + v
    else if (next.scheme === 'viber:' && /^\+?[\d\s()-]{6,}$/.test(v)) url = 'viber://chat?number=%2B' + v.replace(/[^\d]/g, '')
    else if (next.scheme === 'https:' && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)) url = 'https://' + v
  }
  const fits = !url.trim() || url.trim().toLowerCase().startsWith(next.scheme)
  const h = HINTS[next.scheme]
  const hint = fits ? '' : h
  return { kind: toKind, label, url, hint, needsLabel: toKind === 'custom' && !label.trim() }
}
