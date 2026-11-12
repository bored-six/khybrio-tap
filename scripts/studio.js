import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { validateSite } from '../src/validate.js'
import { createStudio } from '../src/studio/server.js'
import { createSupabaseAuth } from '../src/studio/supabase.js'
import { loadStudioEnv } from '../src/publish/env.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT) || 4322
const site = (await import(pathToFileURL(join(root, 'site.config.js')).href)).default
const v = validateSite(site)
if (!v.ok) {
  console.error(`site.config.js is invalid:\n${v.errors.map((e) => `  - ${e}`).join('\n')}`)
  process.exit(1)
}

const env = loadStudioEnv(root)
if (env.error) {
  console.error(env.error)
  process.exit(1)
}
const auth = env.auth ? createSupabaseAuth(env.auth) : null
if (!auth) console.warn('Studio login is OFF (no Supabase keys in .env.local). Anyone on this Mac can use the studio.')

createStudio({ root, site, auth, publicOrigin: env.publicOrigin })
  .on('error', (e) => {
    if (e.code !== 'EADDRINUSE') throw e
    console.error(`Port ${port} is already in use (probably another copy of the studio).`)
    console.error(`Open http://localhost:${port}/ or pick another port: PORT=${port + 1} npm run studio`)
    process.exit(1)
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`Khybrio studio: http://localhost:${port}/${auth ? ' (login on)' : ''}`)
    if (env.publicOrigin) console.log(`Co-workers: ${env.publicOrigin}/ (point your tunnel at http://localhost:${port})`)
  })
