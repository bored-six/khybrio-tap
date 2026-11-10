// Shared asset checks. Used by the build and by the studio upload.
export function svgProblem(text) {
  if (/<script/i.test(text) || /\son[a-z]+\s*=/i.test(text) || /foreignObject/i.test(text)) {
    return 'SVG must not contain <script>, on* event attributes or foreignObject'
  }
  return null
}
