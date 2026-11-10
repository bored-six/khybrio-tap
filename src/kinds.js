// Link kinds: default label + the one URL scheme each kind may use.
const https = (label) => ({ label, scheme: 'https:' })

export const KINDS = {
  review: https('Leave a review'),
  maps: https('Get directions'),
  menu: https('See the menu'),
  booking: https('Book now'),
  order: https('Order now'),
  website: https('Visit our website'),
  messenger: https('Message us'),
  facebook: https('Facebook'),
  instagram: https('Instagram'),
  tiktok: https('TikTok'),
  phone: { label: 'Call us', scheme: 'tel:' },
  email: { label: 'Email us', scheme: 'mailto:' },
}
