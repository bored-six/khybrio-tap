const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

// Safe for both text nodes and attribute values.
export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => MAP[c])
}
