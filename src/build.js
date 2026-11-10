import { readdir, readFile, writeFile, mkdir, rm, copyFile, rename, stat } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { validateClient, validateSite } from './validate.js'
import { renderPage, render404 } from './render.js'
import { esc } from './html.js'
import { readRedirects, validateRedirects } from './redirects.js'
import { svgProblem, inspectMp4, MEDIA } from './assets.js'

const here = dirname(fileURLToPath(import.meta.url))

// Client folders that hold a client.js. Folders starting with '_' are drafts/templates, and a folder
// with no client.js is an abandoned upload from the studio: both are skipped, never a build failure.
export async function listClientFolders(clientsDir) {
  const dirs = (await readdir(clientsDir, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  const keep = []
  for (const d of dirs) {
    if (await stat(join(clientsDir, d.name, 'client.js')).then((s) => s.isFile(), () => false)) keep.push(d.name)
  }
  return keep.sort()
}

// allowMissingVideos: mp4s are git-ignored (R2 holds them), so CI has none. When set (or env
// KHYBRIO_ALLOW_MISSING_MP4=1) a referenced-but-absent .mp4 is a warning and is not copied, never an error.
export async function build({ root, outDir, site, looks, fonts, allowMissingVideos = process.env.KHYBRIO_ALLOW_MISSING_MP4 === '1' } = {}) {
  let icon
  if (!looks) looks = (await import('./looks/index.js')).looks
  if (!fonts) fonts = (await import('./fonts.js')).fonts
  try {
    icon = (await import('./icons.js')).icon
  } catch (e) {
    if (!(e?.code === 'ERR_MODULE_NOT_FOUND' && String(e.message).includes('icons.js'))) throw e
    icon = undefined
  }

  const problems = []
  const s = validateSite(site)
  if (!s.ok) problems.push(`site config:\n${s.errors.map((e) => `  - ${e}`).join('\n')}`)

  const clientsDir = join(root, 'clients')
  const folders = await listClientFolders(clientsDir)

  const clients = []
  const warnings = {}
  for (const folder of folders) {
    const dir = join(clientsDir, folder)
    let raw
    try {
      raw = (await import(`${pathToFileURL(join(dir, 'client.js')).href}?v=${Date.now()}`)).default
    } catch (e) {
      problems.push(`${folder}:\n  - client.js could not be loaded: ${e.message}`)
      continue
    }
    const files = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isFile() && d.name !== 'client.js').map((d) => d.name)
    const missingMp4 = new Set()
    const rbg = raw && raw.background
    if (allowMissingVideos && rbg && rbg.type === 'video' && typeof rbg.file === 'string' && /^[^/\\]+\.mp4$/i.test(rbg.file) && !files.includes(rbg.file)) {
      missingMp4.add(rbg.file)
      files.push(rbg.file)
    }
    const res = validateClient(raw, {
      folder,
      looks: Object.keys(looks),
      fonts: Object.keys(fonts),
      bodyFonts: Object.keys(fonts).filter((id) => fonts[id].body),
      files,
    })
    const errors = res.ok ? [] : [...res.errors]
    for (const key of ['logo', 'cover']) {
      const f = raw && raw[key]
      if (typeof f === 'string' && f.toLowerCase().endsWith('.svg') && files.includes(f)) {
        const text = await readFile(join(dir, f), 'utf8')
        const problem = svgProblem(text)
        if (problem) errors.push(`${key}: ${problem}`)
      }
    }
    const extraWarnings = []
    const bg = res.ok ? res.client.background : null
    if (bg?.type === 'video' && bg.file) {
      if (missingMp4.has(bg.file)) extraWarnings.push(`background.file: ${bg.file} is not in this checkout (mp4s are not in git); not copied`)
      else {
        const buf = await readFile(join(dir, bg.file))
        if (buf.length > MEDIA.videoMax) errors.push(`background.file: File is over ${MEDIA.videoMax / 1024 / 1024} MB`)
        else {
          const info = inspectMp4(buf)
          if (!info.ok) errors.push(`background.file: ${info.error}`)
        }
      }
    }
    if (errors.length === 0 && res.ok) {
      clients.push({ folder, dir, client: res.client, skip: missingMp4 })
      const all = [...(res.warnings || []), ...extraWarnings]
      if (all.length) warnings[res.client.slug] = all
    }
    else problems.push(`${folder}:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
  }
  let redirects = {}
  try {
    redirects = await readRedirects(clientsDir)
  } catch (e) {
    problems.push(`redirects: _redirects.json could not be read: ${e.message}`)
  }
  const redirectErrors = validateRedirects(redirects, clients.map((c) => c.client.slug))
  if (redirectErrors.length) problems.push(redirectErrors.map((e) => `  - ${e}`).join('\n'))
  if (problems.length) throw new Error(`Build refused. Fix these first:\n\n${problems.join('\n\n')}`)

  const tmpDir = `${outDir}.tmp-${process.pid}`
  await rm(tmpDir, { recursive: true, force: true })
  try {
    await mkdir(tmpDir, { recursive: true })

    const fontFiles = new Map()
    for (const { dir, client, skip } of clients) {
      const pageDir = join(tmpDir, client.slug)
      await mkdir(pageDir, { recursive: true })
      await writeFile(join(pageDir, 'index.html'), renderPage(client, site, { looks, fonts, icon }))
      const bgFiles = client.background?.type === 'image' ? [client.background.file] : client.background?.type === 'video' ? [client.background.file, client.background.poster] : []
      for (const f of new Set([client.logo, client.cover, ...bgFiles])) if (f && !skip.has(f)) await copyFile(join(dir, f), join(pageDir, f))
      for (const id of new Set([client.font.heading, client.font.tagline, client.font.body])) {
        for (const ff of fonts[id].files) fontFiles.set(ff.file, ff.path)
      }
    }
    if (fontFiles.size) {
      await mkdir(join(tmpDir, 'fonts'), { recursive: true })
      for (const [file, path] of fontFiles) await copyFile(path, join(tmpDir, 'fonts', file))
    }

    await writeFile(join(tmpDir, '404.html'), render404(site, { fonts }))
    const rkeys = Object.keys(redirects)
    if (rkeys.length) {
      await mkdir(join(tmpDir, '_redirect'), { recursive: true })
      for (const old of rkeys) await writeFile(join(tmpDir, '_redirect', old), redirects[old])
    }
    const m = esc(site.mainSite)
    await writeFile(
      join(tmpDir, 'index.html'),
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${m}"><link rel="canonical" href="${m}"><title>Khybrio</title></head><body><a href="${m}">Continue to Khybrio</a></body></html>`,
    )
    await rm(outDir, { recursive: true, force: true })
    await rename(tmpDir, outDir)
  } catch (e) {
    await rm(tmpDir, { recursive: true, force: true })
    throw e
  }

  return { pages: clients.map((c) => c.client.slug).sort(), warnings }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(here, '..')
  try {
    const site = (await import(pathToFileURL(join(root, 'site.config.js')).href)).default
    const { pages, warnings } = await build({ root, outDir: join(root, 'dist'), site })
    console.log(pages.join('\n'))
    for (const [slug, list] of Object.entries(warnings)) for (const w of list) console.warn(`warning ${slug}: ${w}`)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
