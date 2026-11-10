import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from '../src/build.js'
import { FAKE_LOOKS, SITE } from './helpers.js'

let dir, fonts

const exists = (p) => access(p).then(() => true, () => false)

async function addClient(folder, data, files = {}) {
  const d = join(dir, 'clients', folder)
  await mkdir(d, { recursive: true })
  await writeFile(join(d, 'client.js'), `export default ${JSON.stringify(data, null, 2)}\n`)
  for (const [name, body] of Object.entries(files)) await writeFile(join(d, name), body)
}

const good = (slug, extra = {}) => ({
  slug,
  name: `Client ${slug}`,
  look: 'plain',
  theme: { bg: '#ffffff', ink: '#111111', accent: '#e8622d' },
  blocks: [{ type: 'link', kind: 'website', url: `https://example.com/${slug}` }],
  ...extra,
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'khybrio-tap-'))
  await mkdir(join(dir, 'fontsrc'))
  await writeFile(join(dir, 'fontsrc', 'f.woff2'), 'FONT-F')
  await writeFile(join(dir, 'fontsrc', 'i.woff2'), 'FONT-I')
  await writeFile(join(dir, 'fontsrc', 'm.woff2'), 'FONT-M')
  fonts = {
    fraunces: { family: 'Fraunces', fallback: 'serif', group: 'serif', body: true, headingWeight: 600, files: [{ file: 'f.woff2', weight: '100 900', style: 'normal', path: join(dir, 'fontsrc', 'f.woff2') }] },
    inter: { family: 'Inter', fallback: 'sans-serif', group: 'sans', body: true, headingWeight: 700, files: [{ file: 'i.woff2', weight: '400', style: 'normal', path: join(dir, 'fontsrc', 'i.woff2') }] },
    mono: { family: 'Mono', fallback: 'monospace', group: 'mono', body: false, headingWeight: 400, files: [{ file: 'm.woff2', weight: '400', style: 'normal', path: join(dir, 'fontsrc', 'm.woff2') }] },
  }
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const run = (outDir = join(dir, 'dist')) => build({ root: dir, outDir, site: SITE, looks: FAKE_LOOKS, fonts })

test('writes a page per client, its assets, used fonts once, 404 and a root redirect (no .nojekyll)', async () => {
  await addClient('zeta-bar', good('zeta-bar', { logo: 'logo.svg' }), { 'logo.svg': '<svg/>' })
  await addClient('alpha-cafe', good('alpha-cafe', { cover: 'cover.jpg' }), { 'cover.jpg': 'JPG' })
  await addClient('_template', { anything: 'is ignored' })

  const out = join(dir, 'dist')
  const res = await run(out)
  assert.deepEqual(res.pages, ['alpha-cafe', 'zeta-bar'])

  assert.match(await readFile(join(out, 'alpha-cafe', 'index.html'), 'utf8'), /Client alpha-cafe/)
  assert.equal(await readFile(join(out, 'zeta-bar', 'logo.svg'), 'utf8'), '<svg/>')
  assert.equal(await readFile(join(out, 'alpha-cafe', 'cover.jpg'), 'utf8'), 'JPG')
  assert.ok(!(await exists(join(out, '_template'))))

  assert.deepEqual((await readdir(join(out, 'fonts'))).sort(), ['f.woff2', 'i.woff2'], 'only used fonts, each once')
  assert.ok(await exists(join(out, '404.html')))
  assert.ok(!(await exists(join(out, '.nojekyll'))), '.nojekyll is dropped: GitHub Pages is no longer the host')

  const index = await readFile(join(out, 'index.html'), 'utf8')
  assert.match(index, /http-equiv="refresh"/i)
  assert.ok(index.includes('https://khybrio.com/'))
  assert.ok(!index.includes('alpha-cafe') && !index.includes('zeta-bar'), 'root must not list clients')
})

test('one invalid client fails the whole build, names every problem, writes nothing', async () => {
  await addClient('fine-one', good('fine-one'))
  await addClient('broken-one', good('broken-one', { look: 'nope' }))
  await addClient('broken-two', good('wrong-slug'))

  const out = join(dir, 'dist')
  await mkdir(out)
  await writeFile(join(out, 'keep.txt'), 'old')

  await assert.rejects(run(out), (err) => {
    assert.match(err.message, /broken-one/)
    assert.match(err.message, /look/)
    assert.match(err.message, /broken-two/)
    assert.match(err.message, /slug/)
    assert.ok(!/fine-one/.test(err.message), 'valid clients should not be reported')
    return true
  })
  assert.deepEqual(await readdir(out), ['keep.txt'], 'outDir must be untouched on failure')
})

test('a referenced asset that is missing on disk is a validation error', async () => {
  await addClient('no-logo', good('no-logo', { logo: 'logo.svg' }))
  await assert.rejects(run(), /logo/)
})

test('an invalid site config fails the build', async () => {
  await addClient('fine-one', good('fine-one'))
  await assert.rejects(
    build({ root: dir, outDir: join(dir, 'dist'), site: { ...SITE, base: 'nope' }, looks: FAKE_LOOKS, fonts }),
    /base/,
  )
})

test('a successful build clears stale output', async () => {
  await addClient('fine-one', good('fine-one'))
  const out = join(dir, 'dist')
  await mkdir(join(out, 'removed-client'), { recursive: true })
  await writeFile(join(out, 'removed-client', 'index.html'), 'stale')
  await run(out)
  assert.ok(!(await exists(join(out, 'removed-client'))))
})

test('a failure after validation (render throws) still writes nothing', async () => {
  await addClient('fine-one', good('fine-one'))
  const out = join(dir, 'dist')
  await mkdir(out)
  await writeFile(join(out, 'keep.txt'), 'old')
  const boom = { plain: { label: 'Boom', render: () => { throw new Error('render exploded') }, css: () => '' } }
  await assert.rejects(build({ root: dir, outDir: out, site: SITE, looks: boom, fonts }), /render exploded/)
  assert.deepEqual(await readdir(out), ['keep.txt'], 'outDir must be untouched on failure')
})

test('a directory posing as an asset is rejected and writes nothing', async () => {
  await addClient('dir-logo', good('dir-logo', { logo: 'logo.png' }))
  await mkdir(join(dir, 'clients', 'dir-logo', 'logo.png'))
  const out = join(dir, 'dist')
  await mkdir(out)
  await writeFile(join(out, 'keep.txt'), 'old')
  await assert.rejects(run(out))
  assert.deepEqual(await readdir(out), ['keep.txt'])
})

test('SVG assets with script, event handlers or foreignObject are rejected', async () => {
  const bad = [
    '<svg><script>alert(1)</script></svg>',
    '<svg><rect onload="alert(1)"/></svg>',
    '<svg><rect ONCLICK = "x"/></svg>',
    '<svg><foreignObject><div/></foreignObject></svg>',
  ]
  for (const [i, body] of bad.entries()) {
    const slug = `svg-bad-${i}`
    await addClient(slug, good(slug, { logo: 'logo.svg' }), { 'logo.svg': body })
    await assert.rejects(run(join(dir, `out-${i}`)), /logo/, body)
    await rm(join(dir, 'clients', slug), { recursive: true })
  }
  await addClient('svg-ok', good('svg-ok', { logo: 'logo.svg' }), { 'logo.svg': '<svg><path d="M0 0"/></svg>' })
  await run()
})

test('a folder with no client.js (abandoned upload) is skipped, not a failure', async () => {
  await addClient('fine-one', good('fine-one'))
  await mkdir(join(dir, 'clients', 'orphan-up'))
  await writeFile(join(dir, 'clients', 'orphan-up', 'logo.png'), 'x')
  const res = await run()
  assert.deepEqual(res.pages, ['fine-one'])
})

// ---- v2: redirects, fonts, warnings, migration -------------------------------------------------

test('_redirects.json becomes dist/_redirect/{old} files whose body is the target slug', async () => {
  await addClient('zeta-bar', good('zeta-bar'))
  await writeFile(join(dir, 'clients', '_redirects.json'), JSON.stringify({ 'old-name': 'zeta-bar', 'older-one': 'zeta-bar' }))
  const out = join(dir, 'dist')
  const res = await run(out)
  assert.deepEqual(res.pages, ['zeta-bar'], '_redirects.json is not a client')
  assert.equal(await readFile(join(out, '_redirect', 'old-name'), 'utf8'), 'zeta-bar')
  assert.equal(await readFile(join(out, '_redirect', 'older-one'), 'utf8'), 'zeta-bar')
})

test('no redirects file means no _redirect output and no failure', async () => {
  await addClient('zeta-bar', good('zeta-bar'))
  const out = join(dir, 'dist')
  await run(out)
  assert.ok(!(await exists(join(out, '_redirect'))) || (await readdir(join(out, '_redirect'))).length === 0)
})

test('bad redirects refuse the build and leave outDir untouched', async () => {
  await addClient('zeta-bar', good('zeta-bar'))
  await addClient('alpha-cafe', good('alpha-cafe'))
  const out = join(dir, 'dist')
  await mkdir(out)
  await writeFile(join(out, 'keep.txt'), 'old')
  for (const bad of [{ 'alpha-cafe': 'zeta-bar' }, { 'old-name': 'ghost-one' }, { 'Bad Key': 'zeta-bar' }]) {
    await writeFile(join(dir, 'clients', '_redirects.json'), JSON.stringify(bad))
    await assert.rejects(run(out), /redirects/, JSON.stringify(bad))
    assert.deepEqual(await readdir(out), ['keep.txt'])
  }
})

test('fonts are copied for heading, tagline and body only (deduped)', async () => {
  await addClient('three-fonts', good('three-fonts', { font: { heading: 'mono', tagline: 'fraunces', body: 'inter' } }))
  const out = join(dir, 'dist')
  await run(out)
  assert.deepEqual((await readdir(join(out, 'fonts'))).sort(), ['f.woff2', 'i.woff2', 'm.woff2'])
  await rm(join(dir, 'clients', 'three-fonts'), { recursive: true })
  await addClient('one-font', good('one-font', { font: { heading: 'inter' } }))
  await run(out)
  assert.deepEqual((await readdir(join(out, 'fonts'))).sort(), ['i.woff2'])
})

test('warnings are returned per slug, never thrown, and only slugs with warnings appear', async () => {
  await addClient('fine-one', good('fine-one'))
  await addClient('pale-one', good('pale-one', { theme: { bg: '#ffffff', ink: '#777777', accent: '#000000' } }))
  const out = join(dir, 'dist')
  const res = await run(out)
  assert.deepEqual(res.pages, ['fine-one', 'pale-one'])
  assert.deepEqual(Object.keys(res.warnings), ['pale-one'])
  assert.ok(res.warnings['pale-one'].some((w) => w.startsWith('theme.ink: contrast against bg is')))
  assert.ok(await exists(join(out, 'pale-one', 'index.html')), 'the page is still built')
})

test('a clean build returns an empty warnings object', async () => {
  await addClient('fine-one', good('fine-one'))
  assert.deepEqual((await run()).warnings, {})
})

test('a v1 client.js (links, font.display) builds, and build never rewrites the file', async () => {
  const v1 = { slug: 'old-style', name: 'Old Style', look: 'plain', theme: { bg: '#ffffff', ink: '#111111', accent: '#e8622d' }, font: { display: 'fraunces', body: 'inter' }, links: [{ kind: 'website', url: 'https://example.com/old' }] }
  await addClient('old-style', v1)
  const file = join(dir, 'clients', 'old-style', 'client.js')
  const before = await readFile(file, 'utf8')
  const out = join(dir, 'dist')
  const res = await run(out)
  assert.deepEqual(res.pages, ['old-style'])
  assert.match(await readFile(join(out, 'old-style', 'index.html'), 'utf8'), /https:\/\/example\.com\/old/)
  assert.equal(await readFile(file, 'utf8'), before)
})

// ---- v3: background media is copied beside the page (spec section 6) -------------------------
import { mp4 } from './mp4-fixtures.js'

const VIDEO_BG = { type: 'video', file: 'clip.mp4', poster: 'poster.jpg' }

test('an image background file is copied beside the page', async () => {
  await addClient('photo-bar', good('photo-bar', { background: { type: 'image', file: 'photo.webp' } }), { 'photo.webp': 'WEBP-BYTES' })
  const out = join(dir, 'dist')
  await run(out)
  assert.equal(await readFile(join(out, 'photo-bar', 'photo.webp'), 'utf8'), 'WEBP-BYTES')
  assert.match(await readFile(join(out, 'photo-bar', 'index.html'), 'utf8'), /data-bg="image"/)
})

test('a video background copies the mp4 and its poster, byte for byte', async () => {
  const video = mp4({ codecs: ['avc1'], faststart: true, mdatBytes: 5000 })
  await addClient('video-bar', good('video-bar', { background: VIDEO_BG }), { 'clip.mp4': video, 'poster.jpg': 'POSTER' })
  const out = join(dir, 'dist')
  await run(out)
  assert.deepEqual(await readFile(join(out, 'video-bar', 'clip.mp4')), video)
  assert.equal(await readFile(join(out, 'video-bar', 'poster.jpg'), 'utf8'), 'POSTER')
  const html = await readFile(join(out, 'video-bar', 'index.html'), 'utf8')
  assert.match(html, /data-bg="video"/)
  assert.ok(html.includes('/video-bar/clip.mp4'))
})

test('a video that is not faststart still builds (it only warns at upload time)', async () => {
  await addClient('slow-bar', good('slow-bar', { background: VIDEO_BG }), { 'clip.mp4': mp4({ faststart: false }), 'poster.jpg': 'P' })
  const out = join(dir, 'dist')
  await run(out)
  assert.ok(await exists(join(out, 'slow-bar', 'clip.mp4')))
})

test('files the data does not reference are never copied: old videos, spare images, the poster of a colour page', async () => {
  await addClient('tidy-bar', good('tidy-bar', { background: VIDEO_BG }), {
    'clip.mp4': mp4(),
    'poster.jpg': 'P',
    'old-deadbeef.mp4': mp4(),
    'old-deadbeef-poster.jpg': 'OLD',
    'spare.png': 'SPARE',
  })
  const out = join(dir, 'dist')
  await run(out)
  assert.deepEqual((await readdir(join(out, 'tidy-bar'))).sort(), ['clip.mp4', 'index.html', 'poster.jpg'])
})

test('a colour-background page copies no mp4 even when one sits in the folder', async () => {
  await addClient('plain-bar', good('plain-bar'), { 'leftover.mp4': mp4() })
  const out = join(dir, 'dist')
  await run(out)
  assert.deepEqual(await readdir(join(out, 'plain-bar')), ['index.html'])
})

test('an HEVC video refuses the whole build, names background.file, writes nothing', async () => {
  await addClient('fine-one', good('fine-one'))
  await addClient('hevc-bar', good('hevc-bar', { background: VIDEO_BG }), { 'clip.mp4': mp4({ codecs: ['hvc1'] }), 'poster.jpg': 'P' })
  const out = join(dir, 'dist')
  await assert.rejects(run(out), (e) => {
    assert.match(e.message, /hevc-bar/)
    assert.match(e.message, /background\.file: This video is HEVC/)
    assert.ok(!/fine-one/.test(e.message), 'only the broken client is named')
    return true
  })
  assert.ok(!(await exists(out)))
})

test('an mp4 that is not an mp4 refuses the build on background.file', async () => {
  await addClient('fake-bar', good('fake-bar', { background: VIDEO_BG }), { 'clip.mp4': 'this is not a video at all, just text', 'poster.jpg': 'P' })
  await assert.rejects(run(join(dir, 'dist')), /background\.file: /)
})

test('an mp4 with no moov refuses the build on background.file', async () => {
  const { ftyp, mdat } = await import('./mp4-fixtures.js')
  await addClient('noidx-bar', good('noidx-bar', { background: VIDEO_BG }), { 'clip.mp4': Buffer.concat([ftyp(), mdat()]), 'poster.jpg': 'P' })
  await assert.rejects(run(join(dir, 'dist')), /background\.file: MP4 has no index \(moov\), re-export it/)
})

test('a missing background file is a validation error from the build too', async () => {
  await addClient('gone-bar', good('gone-bar', { background: { type: 'image', file: 'gone.png' } }))
  await assert.rejects(run(join(dir, 'dist')), /background\.file: file "gone\.png" not found in the client folder/)
})
