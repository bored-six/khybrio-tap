// Look registry. Each look: { label, render(ctx) -> body markup, css(ctx) -> look CSS }.
// No look bakes in a colour or a face: both come from the client's theme and font vars.
import card from './card.js'
import menuBoard from './menu-board.js'
import masthead from './masthead.js'
import poster from './poster.js'
import tiles from './tiles.js'
import receipt from './receipt.js'
import plain from './plain.js'

export const looks = {
  card,
  'menu-board': menuBoard,
  masthead,
  poster,
  tiles,
  receipt,
  plain,
}
