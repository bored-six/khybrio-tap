// inspectMp4 must reject files cut at a box boundary (no mdat) and boxes that overrun the file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectMp4 } from '../src/assets.js'
import { box, ftyp, mdat, moov } from './mp4-fixtures.js'

test('mp4: ftyp + moov with no mdat is rejected (truncated at a box boundary)', () => {
  const r = inspectMp4(Buffer.concat([ftyp(), moov(['avc1'])]))
  assert.equal(r.ok, false)
  assert.match(r.error, /incomplete|truncated|media data/i)
})

test('mp4: ftyp + mdat + moov (moov last) is still accepted, faststart false', () => {
  assert.deepEqual(inspectMp4(Buffer.concat([ftyp(), mdat(), moov(['avc1'])])), { ok: true, faststart: false })
})

test('mp4: ftyp + moov + mdat is accepted, faststart true', () => {
  assert.deepEqual(inspectMp4(Buffer.concat([ftyp(), moov(['avc1']), mdat()])), { ok: true, faststart: true })
})

test('mp4: an mdat whose declared size runs past the end of the file is rejected', () => {
  const whole = Buffer.concat([ftyp(), moov(['avc1']), mdat(64)])
  const r = inspectMp4(whole.subarray(0, whole.length - 10))
  assert.equal(r.ok, false)
})

test('mp4: a last box declaring more bytes than remain is rejected even when mdat is present', () => {
  const lie = box('free', Buffer.alloc(20))
  lie.writeUInt32BE(500, 0)
  assert.equal(inspectMp4(Buffer.concat([ftyp(), mdat(), moov(['avc1']), lie])).ok, false)
})
