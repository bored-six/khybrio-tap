// Look registry. Each look: { label, render(ctx) -> body markup, css(ctx) -> look CSS }.
import card from './card.js'
import menuBoard from './menu-board.js'

export const looks = {
  card,
  'menu-board': menuBoard,
}
