// DNS-rebinding guard: the studio only answers to Host localhost:{port} or 127.0.0.1:{port}.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStudio } from '../src/studio/server.js'
import { SITE_SUBPATH } from './helpers.js'

let root, server, port
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'khybrio-host-'))
  server = createStudio({ root, site: SITE_SUBPATH, publish: async () => ({ ok: true, output: '' }) })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  port = server.address().port
})
after(async () => {
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
})

const get = (path, host) =>
  new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers: host === undefined ? {} : { host } }, (r) => {
      r.resume()
      r.on('end', () => res(r.statusCode))
    })
    req.on('error', rej)
    req.end()
  })

test('allowed hosts get through', async () => {
  assert.equal(await get('/studio/studio.js', `127.0.0.1:${port}`), 200)
  assert.equal(await get('/studio/studio.js', `localhost:${port}`), 200)
  assert.notEqual(await get('/p/fonts/fraunces.woff2', `localhost:${port}`), 403)
})
test('foreign hosts are 403 on every route kind', async () => {
  for (const h of ['evil.example.com', `evil.example.com:${port}`, `127.0.0.1.evil.com:${port}`, 'localhost', `localhost:${port + 1}`, '[::1]:' + port]) {
    for (const p of ['/', '/api/clients', '/p/fonts/fraunces.woff2', '/qr/x.png', '/studio/studio.js']) {
      assert.equal(await get(p, h), 403, `${h} ${p}`)
    }
  }
})
test('missing Host header is refused', async () => {
  // raw socket: http.request always fills in a Host, so send an HTTP/1.0 request with none
  const status = await new Promise((res, rej) => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write('GET / HTTP/1.0\r\n\r\n'))
    let buf = ''
    sock.on('data', (d) => (buf += d))
    sock.on('end', () => res(Number(/^HTTP\/1\.\d (\d+)/.exec(buf)[1])))
    sock.on('error', rej)
  })
  assert.equal(status, 403)
})
