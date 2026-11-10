// v1 -> v2 raw client migration. Pure, never throws, never mutates its input.
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

export function migrateRaw(raw) {
  if (!isObj(raw)) return raw
  const out = { ...raw }

  if (Array.isArray(raw.links) && raw.blocks === undefined) {
    out.blocks = raw.links.map((l) =>
      isObj(l) ? { type: 'link', kind: l.kind, url: l.url, ...(l.label !== undefined && { label: l.label }) } : l,
    )
    delete out.links
  }

  const f = raw.font
  if (isObj(f) && (f.display !== undefined || f.body !== undefined) && f.heading === undefined && f.tagline === undefined) {
    const { display, body, ...rest } = f
    out.font = { ...rest, heading: display ?? 'fraunces', tagline: body ?? 'inter', body: body ?? 'inter' }
  }
  return out
}
