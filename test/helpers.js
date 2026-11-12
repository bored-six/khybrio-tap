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
    group: 'serif',
    body: true,
    headingWeight: 600,
    files: [{ file: 'fraunces.woff2', weight: '100 900', style: 'normal', path: '/nowhere/fraunces.woff2' }],
  },
  inter: {
    family: 'Inter',
    fallback: 'system-ui, sans-serif',
    group: 'sans',
    body: true,
    headingWeight: 700,
    files: [{ file: 'inter-400.woff2', weight: '400', style: 'normal', path: '/nowhere/inter-400.woff2' }],
  },
  mono: {
    family: 'Mono',
    fallback: 'monospace',
    group: 'mono',
    body: false,
    headingWeight: 400,
    files: [{ file: 'mono.woff2', weight: '400', style: 'normal', path: '/nowhere/mono.woff2' }],
  },
}

// A deliberately dumb look that follows the block rules, so core tests do not depend on design.
export const FAKE_LOOKS = {
  plain: {
    label: 'Plain',
    render: (ctx) => {
      const blocks = ctx.client.blocks
        .map((b) => {
          if (b.type === 'link') {
            const primary = b.primary ? ' data-primary' : ''
            return `<a href="${ctx.esc(b.url)}" data-block="link" data-kind="${b.kind}"${primary}>${ctx.esc(b.label)}</a>`
          }
          if (b.type === 'heading') return `<h2 data-block="heading">${ctx.esc(b.text)}</h2>`
          if (b.type === 'text') return `<p data-block="text">${ctx.text(b.text)}</p>`
          if (b.type === 'socials')
            return (
              '<div data-block="socials">' +
              b.items.map((i) => `<a href="${ctx.esc(i.url)}" data-kind="${i.kind}" aria-label="${ctx.esc(i.label)}">${ctx.icon(i.kind)}</a>`).join('') +
              '</div>'
            )
          return `<div data-block="video">${ctx.embed(b)}</div>`
        })
        .join('')
      return (
        `<main><h1>${ctx.esc(ctx.client.name)}</h1>` +
        (ctx.client.logo ? `<img src="${ctx.asset(ctx.client.logo)}" alt="">` : '') +
        blocks +
        '</main>'
      )
    },
    css: () => 'main{display:block}',
  },
}

export const OPTS = {
  folder: 'sunrise-cafe',
  looks: Object.keys(FAKE_LOOKS),
  fonts: Object.keys(FAKE_FONTS),
  files: ['logo.svg', 'cover.jpg'],
}

export function rawClient(overrides = {}) {
  return {
    slug: 'sunrise-cafe',
    name: 'Sunrise Cafe',
    look: 'plain',
    theme: { bg: '#FFF4E6', ink: '#3B1F14', accent: '#E8622D' },
    blocks: [
      { type: 'link', kind: 'menu', url: 'https://example.com/menu' },
      { type: 'link', kind: 'messenger', url: 'https://m.me/sunrise' },
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
