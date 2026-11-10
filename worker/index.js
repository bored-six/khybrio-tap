import { handle } from './handler.js'

export default { fetch: (req, env) => handle(req, env.TAP) }
