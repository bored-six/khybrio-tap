// src/assets.js v3: magic-byte sniffing, MP4 box inspection, MEDIA limits.
// Written from section 6 of .claude/specs/v3-style-and-media.md before the code existed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sniff, inspectMp4, MEDIA, svgProblem } from '../src/assets.js'
import { box, box64, boxToEnd, ftyp, mdat, moov, moovToEnd, mp4, PNG, JPEG, WEBP } from './mp4-fixtures.js'

const MB = 1024 * 1024

test('MEDIA carries the limits (15 MB video cap, warn over 5 MB, 15 s, 1280 px)', () => {
  assert.deepEqual(MEDIA, {
    imageMax: 3 * MB,
    videoMax: 15 * MB,
    videoWarn: 5 * MB,
    videoSecondsWarn: 15,
    videoWidthWarn: 1280,
  })
})

test('sniff: real headers pass for their own extension', () => {
  assert.equal(sniff(PNG, 'png'), null)
  assert.equal(sniff(JPEG, 'jpg'), null)
  assert.equal(sniff(JPEG, 'jpeg'), null)
  assert.equal(sniff(WEBP, 'webp'), null)
  assert.equal(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'), 'svg'), null)
})

test('sniff: swapped extensions say the content is not the claimed type', () => {
  assert.equal(sniff(JPEG, 'png'), 'File content is not a real PNG')
  assert.equal(sniff(PNG, 'jpg'), 'File content is not a real JPG')
  assert.equal(sniff(PNG, 'jpeg'), 'File content is not a real JPEG')
  assert.equal(sniff(PNG, 'webp'), 'File content is not a real WEBP')
  assert.equal(sniff(WEBP, 'png'), 'File content is not a real PNG')
})

test('sniff: a RIFF file that is not WEBP is refused as webp', () => {
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.from([28, 0, 0, 0]), Buffer.from('WAVE'), Buffer.alloc(20)])
  assert.equal(sniff(wav, 'webp'), 'File content is not a real WEBP')
})

test('sniff: junk, a truncated signature and an empty buffer are not real images', () => {
  assert.equal(sniff(Buffer.from('hello, I am text'), 'png'), 'File content is not a real PNG')
  assert.equal(sniff(PNG.subarray(0, 4), 'png'), 'File content is not a real PNG')
  assert.equal(sniff(JPEG.subarray(0, 2), 'jpg'), 'File content is not a real JPG')
  assert.equal(sniff(Buffer.alloc(0), 'webp'), 'File content is not a real WEBP')
})

test('sniff: svg goes through svgProblem', () => {
  const bad = '<svg><script>alert(1)</script></svg>'
  assert.equal(sniff(Buffer.from(bad), 'svg'), svgProblem(bad))
  assert.equal(typeof sniff(Buffer.from('<svg><g onload="x"/></svg>'), 'svg'), 'string')
})

/* ---------------------------------------------------------------- inspectMp4 */

test('inspectMp4: H.264 with the index first is ok and faststart', () => {
  assert.deepEqual(inspectMp4(mp4({ codecs: ['avc1'], faststart: true })), { ok: true, faststart: true })
})

test('inspectMp4: moov after mdat is ok but not faststart', () => {
  assert.deepEqual(inspectMp4(mp4({ codecs: ['avc1'], faststart: false })), { ok: true, faststart: false })
})

test('inspectMp4: avc3 counts as H.264; an audio track next to the video does not matter', () => {
  assert.deepEqual(inspectMp4(mp4({ codecs: ['avc3'] })), { ok: true, faststart: true })
  assert.deepEqual(inspectMp4(mp4({ codecs: ['mp4a', 'avc1'] })), { ok: true, faststart: true })
})

test('inspectMp4: HEVC (hvc1 and hev1) is refused with the export instructions', () => {
  const want = 'This video is HEVC (iPhone default). Export it as H.264 ("Most Compatible") so Android phones can play it'
  assert.deepEqual(inspectMp4(mp4({ codecs: ['hvc1'] })), { ok: false, error: want })
  assert.deepEqual(inspectMp4(mp4({ codecs: ['hev1'] })), { ok: false, error: want })
})

test('inspectMp4: AV1 and VP9 are refused, a file with no video track says so', () => {
  assert.deepEqual(inspectMp4(mp4({ codecs: ['av01'] })), { ok: false, error: 'Use an H.264 MP4' })
  assert.deepEqual(inspectMp4(mp4({ codecs: ['vp09'] })), { ok: false, error: 'Use an H.264 MP4' })
  assert.deepEqual(inspectMp4(mp4({ codecs: ['mp4a'] })), { ok: false, error: 'MP4 has no H.264 video track' })
  assert.deepEqual(inspectMp4(mp4({ codecs: [] })), { ok: false, error: 'MP4 has no H.264 video track' })
})

test('inspectMp4: no moov box', () => {
  assert.deepEqual(inspectMp4(Buffer.concat([ftyp(), mdat()])), { ok: false, error: 'MP4 has no index (moov), re-export it' })
})

test('inspectMp4: the first box must be ftyp', () => {
  assert.deepEqual(inspectMp4(Buffer.concat([box('free', Buffer.alloc(8)), ftyp(), moov(), mdat()])), { ok: false, error: 'not an MP4 file' })
  assert.deepEqual(inspectMp4(Buffer.concat([moov(), ftyp(), mdat()])), { ok: false, error: 'not an MP4 file' })
})

test('inspectMp4: a size-0 last box runs to the end of the file', () => {
  const file = Buffer.concat([ftyp(), moov(['avc1']), boxToEnd('mdat', Buffer.alloc(40, 1))])
  assert.deepEqual(inspectMp4(file), { ok: true, faststart: true })
  // moov itself can be the size-0 box
  assert.deepEqual(inspectMp4(Buffer.concat([ftyp(), mdat(), moovToEnd(['avc1'])])), { ok: true, faststart: false })
})

test('inspectMp4: a size-1 box reads its 64-bit largesize', () => {
  const file = Buffer.concat([ftyp(), box64('mdat', Buffer.alloc(40, 1)), moov(['avc1'])])
  assert.deepEqual(inspectMp4(file), { ok: true, faststart: false })
  const first = Buffer.concat([ftyp(), moov(['avc1']), box64('mdat', Buffer.alloc(40, 1))])
  assert.deepEqual(inspectMp4(first), { ok: true, faststart: true })
})

test('inspectMp4: a box that claims more bytes than the file has is not a valid MP4', () => {
  const whole = mp4({ faststart: false })
  assert.deepEqual(inspectMp4(whole.subarray(0, whole.length - 10)), { ok: false, error: 'not a valid MP4 file' })
  const lie = Buffer.concat([ftyp(), Buffer.from([0, 0, 3, 232]), Buffer.from('mdat'), Buffer.alloc(12)])
  assert.deepEqual(inspectMp4(lie), { ok: false, error: 'not a valid MP4 file' })
})

test('inspectMp4: a box smaller than its own header (size 2..7) is not a valid MP4', () => {
  for (const size of [2, 4, 7]) {
    const junk = Buffer.concat([ftyp(), Buffer.from([0, 0, 0, size]), Buffer.from('free'), Buffer.alloc(16)])
    assert.deepEqual(inspectMp4(junk), { ok: false, error: 'not a valid MP4 file' }, `size ${size}`)
  }
})
