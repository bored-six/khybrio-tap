// Font registry. Latin subset, woff2 only, straight from the installed @fontsource packages.
// file: the name it is copied to under {base}fonts/. path: absolute source on disk.
import { fileURLToPath } from 'node:url'

const nm = (rel) => fileURLToPath(new URL(`../node_modules/${rel}`, import.meta.url))

export const fonts = {
  fraunces: {
    family: 'Fraunces',
    fallback: 'Georgia, "Times New Roman", serif',
    files: [
      {
        file: 'fraunces.woff2',
        weight: '100 900',
        style: 'normal',
        path: nm('@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2'),
      },
    ],
  },
  inter: {
    family: 'Inter',
    fallback: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    files: ['400', '600', '700'].map((w) => ({
      file: `inter-${w}.woff2`,
      weight: w,
      style: 'normal',
      path: nm(`@fontsource/inter/files/inter-latin-${w}-normal.woff2`),
    })),
  },
  'space-grotesk': {
    family: 'Space Grotesk',
    fallback: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    files: ['500', '700'].map((w) => ({
      file: `space-grotesk-${w}.woff2`,
      weight: w,
      style: 'normal',
      path: nm(`@fontsource/space-grotesk/files/space-grotesk-latin-${w}-normal.woff2`),
    })),
  },
}
