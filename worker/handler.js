// Cloudflare Worker request handler (section 9 of .claude/specs/mvp-showcase.md). Zero dependencies.
const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; " +
  "frame-src https://www.youtube-nocookie.com https://www.tiktok.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

function objectResponse(obj, request, status = 200) {
  const h = new Headers()
  const md = obj.httpMetadata ?? {}
  if (md.contentType) h.set('content-type', md.contentType)
  if (md.cacheControl) h.set('cache-control', md.cacheControl)
  if (obj.httpEtag) h.set('etag', obj.httpEtag)
  if ((md.contentType ?? '').startsWith('text/html')) {
    h.set('content-security-policy', CSP)
    h.set('x-content-type-options', 'nosniff')
    h.set('referrer-policy', 'strict-origin-when-cross-origin')
  }
  if (status === 200 && obj.httpEtag && request.headers.get('if-none-match') === obj.httpEtag) {
    return new Response(null, { status: 304, headers: h })
  }
  return new Response(request.method === 'HEAD' ? null : obj.body, { status, headers: h })
}

async function notFound(request, bucket) {
  const page = await bucket.get('404.html')
  if (!page) return new Response(request.method === 'HEAD' ? null : 'Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  return objectResponse(page, request, 404)
}

export async function handle(request, bucket) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  }
  const path = new URL(request.url).pathname
  if (path === '/') {
    const home = await bucket.get('index.html')
    return home ? objectResponse(home, request) : notFound(request, bucket)
  }
  if (/%2f|%5c/i.test(path) || !path.startsWith('/')) return notFound(request, bucket)

  if (path.length > 400) return notFound(request, bucket)
  const parts = path.slice(1).split('/')
  const trailing = parts.length > 1 && parts[parts.length - 1] === ''
  const segs = trailing ? parts.slice(0, -1) : parts
  let decoded
  try {
    decoded = segs.map(decodeURIComponent)
  } catch {
    return notFound(request, bucket)
  }
  if (decoded.some((s) => s.length > 200 || /[\u0000-\u001f\u007f]/.test(s))) return notFound(request, bucket)
  if (decoded.some((s) => s === '' || s.startsWith('_') || s.startsWith('.') || s.includes('/') || s.includes('\\'))) {
    return notFound(request, bucket)
  }
  if (segs.length > 2) return notFound(request, bucket)

  const [first, file] = decoded
  if (segs.length === 1 && !trailing) {
    return new Response(null, { status: 301, headers: { location: `/${segs[0]}/` } })
  }
  if (trailing && segs.length === 2) return notFound(request, bucket)

  const key = segs.length === 1 ? `${first}/index.html` : `${first}/${file}`
  const hit = await bucket.get(key)
  if (hit) return objectResponse(hit, request)

  if (first !== 'fonts' && SLUG_RE.test(first)) {
    const rec = await bucket.get(`_redirect/${first}`)
    const target = rec ? (await rec.text()).trim() : ''
    if (SLUG_RE.test(target)) {
      return new Response(null, {
        status: 302,
        headers: { location: file ? `/${target}/${encodeURIComponent(file)}` : `/${target}/`, 'cache-control': 'no-store' },
      })
    }
  }
  return notFound(request, bucket)
}
