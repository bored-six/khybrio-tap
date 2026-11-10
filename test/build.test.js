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
  links: [{ kind: 'website', url: `https://example.com/${slug}` }],
  ...extra,
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'khybrio-tap-'))
  await mkdir(join(dir, 'fontsrc'))
  await writeFile(join(dir, 'fontsrc', 'f.woff2'), 'FONT-F')
  await writeFile(join(dir, 'fontsrc', 'i.woff2'), 'FONT-I')
  await writeFile(join(dir, 'fontsrc', 'm.woff2'), 'FONT-M')
  fonts = {
    fraunces: { family: 'Fraunces', fallback: 'serif', files: [{ file: 'f.woff2', weight: '100 900', style: 'normal', path: join(dir, 'fontsrc', 'f.woff2') }] },
    inter: { family: 'Inter', fallback: 'sans-serif', files: [{ file: 'i.woff2', weight: '400', style: 'normal', path: join(dir, 'fontsrc', 'i.woff2') }] },
    mono: { family: 'Mono', fallback: 'monospace', files: [{ file: 'm.woff2', weight: '400', style: 'normal', path: join(dir, 'fontsrc', 'm.woff2') }] },
  }
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const run = (outDir = join(dir, 'dist')) => build({ root: dir, outDir, site: SITE, looks: FAKE_LOOKS, fonts })

test('writes a page per client, its assets, used fonts once, 404, .nojekyll and a root redirect', async () => {
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
  assert.ok(await exists(join(out, '.nojekyll')))

  const index = await readFile(join(out, 'index.html'), 'utf8')
  assert.match(index, /http-equiv="refresh"/i)
  assert.ok(index.includes('https://khybrio.com/'))
  assert.ok(!index.includes('alpha-cafe') && !index.includes('zeta-bar'), 'root must not list clients')
})

test('one invalid client fails the whole build, names every problem, writes nothing', async () => {
  await addClient('fine-one', good('fine-one'))
  await addClient('broken-one', good('broken-one', { theme: { bg: '#ffffff', ink: '#777777', accent: '#000000' } }))
  await addClient('broken-two', good('wrong-slug'))

  const out = join(dir, 'dist')
  await mkdir(out)
  await writeFile(join(out, 'keep.txt'), 'old')

  await assert.rejects(run(out), (err) => {
    assert.match(err.message, /broken-one/)
    assert.match(err.message, /theme\.ink/)
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
