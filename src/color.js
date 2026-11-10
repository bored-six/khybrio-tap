export function parseHex(str) {
  if (typeof str !== 'string') return null
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str)
  if (!m) return null
  let h = m[1].toLowerCase()
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  return '#' + h
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

export function contrastRatio(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ---- v3: contrast over backgrounds (spec section 2) ----

const toChannels = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
}
const lum = (ch) => {
  const l = ch.map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4))
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
}
const ratio = (la, lb) => (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)

// Contrast of ink against the worst composited pixel: d*bg + (1-d)*p for any p in [0,1] per channel.
export function worstContrast(ink, bg, dim) {
  const d = dim / 100
  const b = toChannels(bg)
  const lMin = lum(b.map((c) => d * c))
  const lMax = lum(b.map((c) => d * c + (1 - d)))
  const li = lum(toChannels(ink))
  if (li >= lMin && li <= lMax) return 1
  return li < lMin ? ratio(li, lMin) : ratio(li, lMax)
}

// Smallest integer dim 0..100 with worstContrast >= target. 100 when even full dim cannot reach it.
export function minDim(ink, bg, target = 4.5) {
  for (let d = 0; d <= 100; d++) if (worstContrast(ink, bg, d) >= target) return d
  return 100
}

// Lowest contrast of ink against sRGB-lerped samples (t = 0, .1 .. 1) along each segment of the stops.
export function gradientMinContrast(ink, stopHexes) {
  const li = lum(toChannels(ink))
  let min = Infinity
  for (let i = 0; i < stopHexes.length - 1; i++) {
    const a = toChannels(stopHexes[i])
    const b = toChannels(stopHexes[i + 1])
    for (let s = 0; s <= 10; s++) {
      const t = s / 10
      min = Math.min(min, ratio(li, lum(a.map((c, k) => c + (b[k] - c) * t))))
    }
  }
  return min
}
