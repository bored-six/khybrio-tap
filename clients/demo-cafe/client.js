// A made-up cafe, used to show prospects what a tap page looks like.
// Every link points at example.com on purpose. Not a real business.
export default {
  slug: 'demo-cafe',
  name: 'Demo Cafe',
  tagline: 'Sample tap page. Shakes, coffee and pastries, two branches.',
  look: 'menu-board',
  theme: { bg: '#fff4e6', ink: '#3b1f14', accent: '#e8622d' },
  font: { display: 'fraunces', body: 'inter' },
  cover: 'cover.svg', // sample illustration, swap for a real photo (jpg/webp) per client
  links: [
    { kind: 'menu', url: 'https://example.com/menu', label: 'See the menu' },
    { kind: 'order', url: 'https://example.com/order', label: 'Order for pickup' },
    { kind: 'review', url: 'https://example.com/review', label: 'Leave us a review' },
    { kind: 'messenger', url: 'https://example.com/messenger' },
    { kind: 'instagram', url: 'https://example.com/instagram' },
    { kind: 'phone', url: 'tel:+639000000000', label: 'Call the shop' },
  ],
  branches: [
    { name: 'Pasonanca', address: 'Example St, Pasonanca', maps: 'https://example.com/maps/1', hours: '8 AM to 9 PM' },
    { name: 'Tetuan', address: 'Example Ave, Tetuan', maps: 'https://example.com/maps/2', hours: '9 AM to 10 PM' },
  ],
}
