// Shared asset checks. Used by the build and by the studio upload.
export function svgProblem(text) {
  if (/<script/i.test(text) || /\son[a-z]+\s*=/i.test(text) || /foreignObject/i.test(text)) {
    return 'SVG must not contain <script>, on* event attributes or foreignObject'
  }
  return null
}

// ---- v3: media limits, magic-byte sniffing, MP4 inspection (spec section 6) ----
const MB = 1024 * 1024
export const MEDIA = { imageMax: 3 * MB, videoMax: 15 * MB, videoWarn: 5 * MB, videoSecondsWarn: 15, videoWidthWarn: 1280 }

const startsWith = (buf, bytes, at = 0) => buf.length >= at + bytes.length && bytes.every((b, i) => buf[at + i] === b)
const ascii = (buf, at, n) => buf.toString('latin1', at, at + n)

// ext without the dot. Returns null when the bytes match, else an error string.
export function sniff(buf, ext) {
  const e = String(ext).toLowerCase()
  if (e === 'svg') return svgProblem(buf.toString('utf8'))
  let ok = false
  if (e === 'png') ok = startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  else if (e === 'jpg' || e === 'jpeg') ok = startsWith(buf, [0xff, 0xd8, 0xff])
  else if (e === 'webp') ok = buf.length >= 12 && ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP'
  return ok ? null : `File content is not a real ${e.toUpperCase()}`
}

// Child boxes of buf[start, end). Returns null on a malformed box.
function boxes(buf, start, end) {
  const out = []
  let pos = start
  while (pos < end) {
    if (end - pos < 8) return null
    let size = buf.readUInt32BE(pos)
    const type = ascii(buf, pos + 4, 4)
    let head = 8
    if (size === 1) {
      if (end - pos < 16) return null
      const big = buf.readBigUInt64BE(pos + 8)
      if (big > BigInt(end - pos)) return null
      size = Number(big)
      head = 16
    } else if (size === 0) size = end - pos
    if (size < head || pos + size > end) return null
    out.push({ type, start: pos, body: pos + head, end: pos + size })
    pos += size
  }
  return out
}

function sampleEntries(buf, moov) {
  const found = []
  const walk = (b, path) => {
    const kids = boxes(buf, b.body, b.end)
    if (!kids) return
    for (const k of kids) {
      if (path.length < 5 && ['trak', 'mdia', 'minf', 'stbl'][path.length] === k.type) walk(k, [...path, k.type])
      else if (path.length === 4 && k.type === 'stsd') {
        const entries = boxes(buf, k.body + 8, k.end)
        if (entries) for (const e of entries) found.push(e.type)
      }
    }
  }
  walk(moov, [])
  return found
}

export function inspectMp4(buf) {
  const bad = { ok: false, error: 'not a valid MP4 file' }
  if (buf.length < 8) return bad
  if (ascii(buf, 4, 4) !== 'ftyp') return { ok: false, error: 'not an MP4 file' }
  const top = boxes(buf, 0, buf.length)
  if (!top) return bad
  const moov = top.find((b) => b.type === 'moov')
  if (!moov) return { ok: false, error: 'MP4 has no index (moov), re-export it' }
  const mdat = top.find((b) => b.type === 'mdat')
  const faststart = !mdat || moov.start < mdat.start
  const codecs = sampleEntries(buf, moov)
  if (codecs.some((c) => c === 'avc1' || c === 'avc3')) return { ok: true, faststart }
  if (codecs.some((c) => c === 'hvc1' || c === 'hev1')) {
    return { ok: false, error: 'This video is HEVC (iPhone default). Export it as H.264 ("Most Compatible") so Android phones can play it' }
  }
  if (codecs.some((c) => c === 'av01' || c === 'vp09')) return { ok: false, error: 'Use an H.264 MP4' }
  return { ok: false, error: 'MP4 has no H.264 video track' }
}
