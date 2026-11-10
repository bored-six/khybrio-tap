// Font registry: 30 families. Latin subset, woff2 only, straight from the installed @fontsource packages.
// Entry: { family, fallback, group, body, headingWeight, files:[{ file, weight, style, path }] }
// file: the name it is copied to under {base}fonts/. path: absolute source on disk.
// Ids are package names. Variable = one file, weight range from the package's wght.css.
// Static = one file per weight. Normal style only.
import { fileURLToPath } from 'node:url'

const nm = (rel) => fileURLToPath(new URL(`../node_modules/${rel}`, import.meta.url))

const FALLBACK = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  display: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  script: '"Brush Script MT", cursive',
  mono: 'ui-monospace, Menlo, Consolas, monospace',
}

const variable = (id, family, group, range, body, headingWeight) => ({
  family,
  fallback: FALLBACK[group],
  group,
  body,
  headingWeight,
  files: [
    {
      file: `${id}.woff2`,
      weight: range,
      style: 'normal',
      path: nm(`@fontsource-variable/${id}/files/${id}-latin-wght-normal.woff2`),
    },
  ],
})

const fixed = (id, family, group, weights, body, headingWeight) => ({
  family,
  fallback: FALLBACK[group],
  group,
  body,
  headingWeight,
  files: weights.map((w) => ({
    file: `${id}-${w}.woff2`,
    weight: String(w),
    style: 'normal',
    path: nm(`@fontsource/${id}/files/${id}-latin-${w}-normal.woff2`),
  })),
})

export const fonts = {
  // serif
  fraunces: variable('fraunces', 'Fraunces', 'serif', '100 900', true, 600),
  lora: variable('lora', 'Lora', 'serif', '400 700', true, 600),
  'eb-garamond': variable('eb-garamond', 'EB Garamond', 'serif', '400 800', true, 600),
  'source-serif-4': variable('source-serif-4', 'Source Serif 4', 'serif', '200 900', true, 600),
  'playfair-display': variable('playfair-display', 'Playfair Display', 'serif', '400 900', false, 600),
  'dm-serif-display': fixed('dm-serif-display', 'DM Serif Display', 'serif', [400], false, 400),
  'instrument-serif': fixed('instrument-serif', 'Instrument Serif', 'serif', [400], false, 400),
  // sans (all body)
  inter: variable('inter', 'Inter', 'sans', '100 900', true, 700),
  'dm-sans': variable('dm-sans', 'DM Sans', 'sans', '100 1000', true, 700),
  manrope: variable('manrope', 'Manrope', 'sans', '200 800', true, 700),
  'plus-jakarta-sans': variable('plus-jakarta-sans', 'Plus Jakarta Sans', 'sans', '200 800', true, 700),
  outfit: variable('outfit', 'Outfit', 'sans', '100 900', true, 700),
  'space-grotesk': variable('space-grotesk', 'Space Grotesk', 'sans', '300 700', true, 700),
  figtree: variable('figtree', 'Figtree', 'sans', '300 900', true, 700),
  'work-sans': variable('work-sans', 'Work Sans', 'sans', '100 900', true, 700),
  'bricolage-grotesque': variable('bricolage-grotesque', 'Bricolage Grotesque', 'sans', '200 800', true, 700),
  // display
  syne: variable('syne', 'Syne', 'display', '400 800', false, 700),
  unbounded: variable('unbounded', 'Unbounded', 'display', '200 900', false, 700),
  'bebas-neue': fixed('bebas-neue', 'Bebas Neue', 'display', [400], false, 400),
  anton: fixed('anton', 'Anton', 'display', [400], false, 400),
  'archivo-black': fixed('archivo-black', 'Archivo Black', 'display', [400], false, 400),
  'abril-fatface': fixed('abril-fatface', 'Abril Fatface', 'display', [400], false, 400),
  // script
  caveat: variable('caveat', 'Caveat', 'script', '400 700', false, 600),
  'dancing-script': variable('dancing-script', 'Dancing Script', 'script', '400 700', false, 600),
  pacifico: fixed('pacifico', 'Pacifico', 'script', [400], false, 400),
  'great-vibes': fixed('great-vibes', 'Great Vibes', 'script', [400], false, 400),
  satisfy: fixed('satisfy', 'Satisfy', 'script', [400], false, 400),
  // mono
  'jetbrains-mono': variable('jetbrains-mono', 'JetBrains Mono', 'mono', '100 800', true, 600),
  'ibm-plex-mono': fixed('ibm-plex-mono', 'IBM Plex Mono', 'mono', [400, 600, 700], true, 600),
  'space-mono': fixed('space-mono', 'Space Mono', 'mono', [400, 700], false, 700),
}
