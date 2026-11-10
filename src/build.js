import { readdir, readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { validateClient, validateSite } from './validate.js'
import { renderPage, render404 } from './render.js'
import { esc } from './html.js'

const here = dirname(fileURLToPath(import.meta.url))

export async function build({ root, outDir, site, looks, fonts } = {}) {
  let icon
  if (!looks) looks = (await import('./looks/index.js')).looks
  if (!fonts) fonts = (await import('./fonts.js')).fonts
  try {
    icon = (await import('./icons.js')).icon
  } catch {
    icon = undefined
  }

  const problems = []
  const s = validateSite(site)
  if (!s.ok) problems.push(`site config:\n${s.errors.map((e) => `  - ${e}`).join('\n')}`)

  const clientsDir = join(root, 'clients')
  const folders = (await readdir(clientsDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .sort()

  const clients = []
  for (const folder of folders) {
    const dir = join(clientsDir, folder)
    let raw
    try {
      raw = (await import(`${pathToFileURL(join(dir, 'client.js')).href}?v=${Date.now()}`)).default
    } catch (e) {
      problems.push(`${folder}:\n  - client.js could not be loaded: ${e.message}`)
      continue
    }
    const files = (await readdir(dir)).filter((f) => f !== 'client.js')
    const res = validateClient(raw, { folder, looks: Object.keys(looks), fonts: Object.keys(fonts), files })
    if (res.ok) clients.push({ folder, dir, client: res.client })
    else problems.push(`${folder}:\n${res.errors.map((e) => `  - ${e}`).join('\n')}`)
  }
  if (problems.length) throw new Error(`Build refused. Fix these first:\n\n${problems.join('\n\n')}`)

  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const fontFiles = new Map()
  for (const { dir, client } of clients) {
    const pageDir = join(outDir, client.slug)
    await mkdir(pageDir, { recursive: true })
    await writeFile(join(pageDir, 'index.html'), renderPage(client, site, { looks, fonts, icon }))
    for (const f of [client.logo, client.cover]) if (f) await copyFile(join(dir, f), join(pageDir, f))
    for (const id of new Set([client.font.display, client.font.body])) {
      for (const ff of fonts[id].files) fontFiles.set(ff.file, ff.path)
    }
  }
  if (fontFiles.size) {
    await mkdir(join(outDir, 'fonts'), { recursive: true })
    for (const [file, path] of fontFiles) await copyFile(path, join(outDir, 'fonts', file))
  }

  await writeFile(join(outDir, '404.html'), render404(site, { fonts }))
  await writeFile(join(outDir, '.nojekyll'), '')
  const m = esc(site.mainSite)
  await writeFile(
    join(outDir, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${m}"><link rel="canonical" href="${m}"><title>Khybrio</title></head><body><a href="${m}">Continue to Khybrio</a></body></html>`,
  )

  return { pages: clients.map((c) => c.client.slug).sort() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(here, '..')
  try {
    const site = (await import(pathToFileURL(join(root, 'site.config.js')).href)).default
    const { pages } = await build({ root, outDir: join(root, 'dist'), site })
    console.log(pages.join('\n'))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
