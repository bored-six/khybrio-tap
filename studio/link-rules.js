// Pure rules for what happens to a link row when its kind changes. Browser + node safe.
const HINTS = {
  'tel:': 'Phone links need a number like +63 912 345 6789',
  'mailto:': 'Email links need an address like name@example.com',
  'https:': 'This link needs an address starting with https://',
}

// Returns { kind, label, url, hint }. hint is '' when the url fits (or is empty).
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
    else if (next.scheme === 'https:' && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)) url = 'https://' + v
  }
  const fits = !url.trim() || url.trim().toLowerCase().startsWith(next.scheme)
  const h = HINTS[next.scheme]
  const hint = fits ? '' : h
  return { kind: toKind, label, url, hint }
}
