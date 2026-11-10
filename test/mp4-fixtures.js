// Minimal MP4 byte builders for tests. Not a test file (no .test.js suffix), so the runner skips it.
// Only the box structure the v3 spec talks about: top-level boxes (ftyp, moov, mdat) and the sample
// entry fourcc (avc1, hvc1, ...) nested in moov > trak > mdia > minf > stbl > stsd.
const u32 = (n) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}
const u64 = (n) => {
  const b = Buffer.alloc(8)
  b.writeBigUInt64BE(BigInt(n))
  return b
}
const cc = (s) => Buffer.from(s, 'latin1')

// Normal box: u32 size (header included) + type + body.
export const box = (type, ...parts) => {
  const body = Buffer.concat(parts)
  return Buffer.concat([u32(8 + body.length), cc(type), body])
}
// Box with a 64-bit largesize: size field 1, type, u64 size, body.
export const box64 = (type, ...parts) => {
  const body = Buffer.concat(parts)
  return Buffer.concat([u32(1), cc(type), u64(16 + body.length), body])
}
// Last box of the file: size field 0 means "to the end of the file".
export const boxToEnd = (type, ...parts) => Buffer.concat([u32(0), cc(type), ...parts])

export const ftyp = () => box('ftyp', cc('isom'), u32(512), cc('isomiso2avc1mp41'))
export const mdat = (n = 64) => box('mdat', Buffer.alloc(n, 0x5a))

const trak = (fourcc) =>
  box(
    'trak',
    box('tkhd', Buffer.alloc(84)),
    box('mdia', box('mdhd', Buffer.alloc(24)), box('hdlr', Buffer.alloc(33)), box('minf', box('stbl', box('stsd', u32(0), u32(1), box(fourcc, Buffer.alloc(78)))))),
  )

// codecs: sample entry fourccs, one track each, in order. [] = a moov with no tracks at all.
export const moov = (codecs = ['avc1']) => box('moov', box('mvhd', Buffer.alloc(100)), ...codecs.map(trak))
export const moovToEnd = (codecs = ['avc1']) => boxToEnd('moov', box('mvhd', Buffer.alloc(100)), ...codecs.map(trak))

// A whole file. faststart true = moov before mdat, false = mdat first (index at the end).
export function mp4({ codecs = ['avc1'], faststart = true, mdatBytes = 64 } = {}) {
  const parts = faststart ? [ftyp(), moov(codecs), mdat(mdatBytes)] : [ftyp(), mdat(mdatBytes), moov(codecs)]
  return Buffer.concat(parts)
}

// Real image headers for the sniff tests. Just enough bytes to be recognisable.
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)])
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), cc('JFIF'), Buffer.alloc(24)])
export const WEBP = Buffer.concat([cc('RIFF'), u32(28), cc('WEBP'), cc('VP8 '), Buffer.alloc(20)])
