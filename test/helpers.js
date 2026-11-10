// Shared fixtures. Written against .claude/specs/contract.md, before the code existed.

export const SITE = {
  origin: 'https://tap.khybrio.com',
  base: '/',
  mainSite: 'https://khybrio.com/',
}

export const SITE_SUBPATH = {
  origin: 'https://bored-six.github.io',
  base: '/khybrio-tap/',
  mainSite: 'https://bored-six.github.io/Khybrio/',
}

export const FAKE_FONTS = {
  fraunces: {
    family: 'Fraunces',
    fallback: 'Georgia, serif',
    files: [{ file: 'fraunces.woff2', weight: '100 900', style: 'normal', path: '/nowhere/fraunces.woff2' }],
  },
  inter: {
    family: 'Inter',
    fallback: 'system-ui, sans-serif',
    files: [{ file: 'inter-400.woff2', weight: '400', style: 'normal', path: '/nowhere/inter-400.woff2' }],
  },
  mono: {
    family: 'Mono',
    fallback: 'monospace',
    files: [{ file: 'mono.woff2', weight: '400', style: 'normal', path: '/nowhere/mono.woff2' }],
  },
}

// A deliberately dumb look that follows the link rules, so core tests do not depend on design.
export const FAKE_LOOKS = {
  plain: {
    label: 'Plain',
    render: (ctx) =>
      `<main><h1>${ctx.esc(ctx.client.name)}</h1>` +
      (ctx.client.logo ? `<img src="${ctx.asset(ctx.client.logo)}" alt="">` : '') +
      ctx.client.links
        .map(
          (l, i) =>
            `<a href="${ctx.esc(l.url)}" data-kind="${l.kind}"${i === 0 ? ' data-primary' : ''}>${ctx.esc(l.label)}</a>`,
        )
        .join('') +
      '</main>',
    css: () => 'main{display:block}',
  },
}

export const OPTS = {
  folder: 'creamy-creations',
  looks: Object.keys(FAKE_LOOKS),
  fonts: Object.keys(FAKE_FONTS),
  files: ['logo.svg', 'cover.jpg'],
}

export function rawClient(overrides = {}) {
  return {
    slug: 'creamy-creations',
    name: 'Creamy Creations',
    look: 'plain',
    theme: { bg: '#FFF4E6', ink: '#3B1F14', accent: '#E8622D' },
    links: [
      { kind: 'menu', url: 'https://example.com/menu' },
      { kind: 'messenger', url: 'https://m.me/creamy' },
    ],
    ...overrides,
  }
}

// Every <a> that carries data-kind, in document order.
export function linkTags(html) {
  return [...html.matchAll(/<a\b[^>]*\bdata-kind="([^"]*)"[^>]*>/g)].map((m) => ({
    tag: m[0],
    kind: m[1],
    href: (m[0].match(/\bhref="([^"]*)"/) || [])[1],
    primary: /\sdata-primary(?=[\s>=])/.test(m[0]),
  }))
}
