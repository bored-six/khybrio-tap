// Khybrio's own tap page: the card the team hands out.
export default {
  slug: 'khybrio',
  name: 'Khybrio',
  tagline: 'Digital services studio for small businesses. Zamboanga City.',
  look: 'card',
  theme: { bg: '#1c4d4a', ink: '#f5f7f6', accent: '#e8622d' },
  font: { heading: 'fraunces', tagline: 'inter', body: 'inter' },
  logo: 'logo.png', // synced from the main site: npm run sync-brand
  blocks: [
    { type: 'link', kind: 'messenger', url: 'https://m.me/khybrio', label: 'Message us' },
    { type: 'link', kind: 'website', url: 'https://bored-six.github.io/Khybrio/', label: 'See what we do' },
    { type: 'link', kind: 'facebook', url: 'https://www.facebook.com/khybrio' },
    { type: 'link', kind: 'instagram', url: 'https://www.instagram.com/khybrio' },
    { type: 'link', kind: 'email', url: 'mailto:khybrio.org@gmail.com' },
  ],
  credit: false,
}
