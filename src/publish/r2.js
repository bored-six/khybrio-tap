import { AwsClient } from 'aws4fetch'

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const encKey = (key) => key.split('/').map(encodeURIComponent).join('/')

export function createR2Store({ accountId, bucket, accessKeyId, secretAccessKey, fetch: fetchFn = globalThis.fetch }) {
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
  const base = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`
  const send = async (url, init, what) => {
    const req = await client.sign(url, init)
    const res = await fetchFn(req)
    if (!res.ok) throw new Error(`R2 ${what} failed (HTTP ${res.status})`)
    return res
  }
  return {
    async list() {
      const out = new Map()
      let token
      do {
        const q = new URLSearchParams({ 'list-type': '2' })
        if (token) q.set('continuation-token', token)
        const xml = await (await send(`${base}?${q}`, { method: 'GET' }, 'list')).text()
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const key = /<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1]
          const etag = /<ETag>([\s\S]*?)<\/ETag>/.exec(m[1])?.[1]
          if (key == null) continue
          out.set(decode(key), decode(etag ?? '').replace(/"/g, ''))
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
          ? /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1]
          : undefined
        if (token) token = decode(token)
      } while (token)
      return out
    },
    async put(key, buf, { contentType, cacheControl } = {}) {
      const headers = {}
      if (contentType) headers['content-type'] = contentType
      if (cacheControl) headers['cache-control'] = cacheControl
      await send(`${base}/${encKey(key)}`, { method: 'PUT', headers, body: buf }, `put ${key}`)
    },
    async del(key) {
      await send(`${base}/${encKey(key)}`, { method: 'DELETE' }, `delete ${key}`)
    },
  }
}
