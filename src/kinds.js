// Link kinds: default label, the one URL scheme each kind may use, and whether it may sit in a socials block.
// `custom` has no default label: the page author must give one.
const k = (label, social, scheme = 'https:') => ({ label, scheme, social })

export const KINDS = {
  review: k('Leave a review', false),
  maps: k('Get directions', false),
  menu: k('See the menu', false),
  booking: k('Book now', false),
  order: k('Order now', false),
  website: k('Visit our website', false),
  custom: k(undefined, false),
  messenger: k('Message us', true),
  facebook: k('Facebook', true),
  instagram: k('Instagram', true),
  tiktok: k('TikTok', true),
  phone: k('Call us', true, 'tel:'),
  email: k('Email us', true, 'mailto:'),
  whatsapp: k('Chat on WhatsApp', true), // hint https://wa.me/639XXXXXXXXX
  viber: k('Message on Viber', true, 'viber:'), // hint viber://chat?number=%2B639XXXXXXXXX
  youtube: k('YouTube', true),
  shopee: k('Shop on Shopee', true),
  lazada: k('Shop on Lazada', true),
  x: k('X', true),
  linkedin: k('LinkedIn', true),
  spotify: k('Spotify', true),
}
