// Style options (contract v3, spec section 3). Data only: { key: { value: 'css var declarations' } }.
// Core emits the declarations for every non-null key on :root; nothing for null.

export const STYLE = {
  buttonShape: {
    square: '--btn-r:0',
    rounded: '--btn-r:14px',
    pill: '--btn-r:999px',
  },
  buttonFill: {
    solid: '--btn-bg:var(--ink);--btn-ink:var(--bg);--btn-line:transparent;--btn-blur:none',
    outline: '--btn-bg:transparent;--btn-ink:var(--ink);--btn-line:var(--ink);--btn-blur:none',
    soft: '--btn-bg:color-mix(in srgb,var(--ink) 10%,var(--bg));--btn-ink:var(--ink);--btn-line:transparent;--btn-blur:none',
    glass:
      '--btn-bg:color-mix(in srgb,var(--bg) 60%,transparent);--btn-ink:var(--ink);--btn-line:color-mix(in srgb,var(--ink) 16%,transparent);--btn-blur:blur(12px) saturate(1.3)',
  },
  linkLayout: {
    list: '--link-cols:1',
    grid: '--link-cols:2',
  },
  align: {
    left: '--align:left;--justify:flex-start',
    center: '--align:center;--justify:center',
  },
  logoShape: {
    square: '--logo-r:0',
    rounded: '--logo-r:22%',
    circle: '--logo-r:50%',
  },
  coverShape: {
    banner: '--cover-r:0;--cover-ratio:16/9;--cover-w:100%',
    rounded: '--cover-r:20px;--cover-ratio:16/10;--cover-w:100%',
    circle: '--cover-r:50%;--cover-ratio:1;--cover-w:168px',
  },
  spacing: {
    compact: '--gap:8px;--btn-h:52px',
    comfortable: '--gap:14px;--btn-h:62px',
  },
  shadow: {
    none: '--btn-shadow:none',
    soft: '--btn-shadow:0 8px 20px -10px color-mix(in srgb,#000 50%,transparent)',
    hard: '--btn-shadow:4px 4px 0 var(--ink)',
  },
}

export const STYLE_KEYS = Object.keys(STYLE)
