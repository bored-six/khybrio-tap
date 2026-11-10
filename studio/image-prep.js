// Pure rules for preparing a photo before upload. Browser + node safe. The canvas work lives in studio.js.
export const MAX_SIDE = { cover: 2000, logo: 800 }
export const TARGET_BYTES = 1.5 * 1024 * 1024

const ext = (name) => { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : '' }

export function targetSize(w, h, maxSide) {
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) throw new Error('image has no size')
  if (!(maxSide > 0)) throw new Error('maxSide must be positive')
  const long = Math.max(w, h)
  if (long <= maxSide) return { width: Math.round(w), height: Math.round(h) }
  const k = maxSide / long
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }
}

// Matches the server's ASSET_RE: lowercase, plain characters, no "..".
export function outputName(name, extension) {
  const base = String(name || '').replace(/\.[a-z0-9]+$/i, '').toLowerCase()
    .replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').replace(/\.{2,}/g, '.').replace(/^[^a-z0-9]+/, '').replace(/[._-]+$/, '')
  return `${base || 'photo'}.${extension}`
}

export function qualitySteps() { return [0.82, 0.72, 0.62, 0.52, 0.42, 0.32] }

export function isHeic(file) {
  const t = String(file.type || '').toLowerCase()
  return t === 'image/heic' || t === 'image/heif' || ['heic', 'heif'].includes(ext(file.name))
}

export function shouldReencode(file) {
  const t = String(file.type || '').toLowerCase()
  if (t === 'image/svg+xml' || ext(file.name) === 'svg') return false
  if (t.startsWith('image/')) return true
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif', 'bmp'].includes(ext(file.name))
}
