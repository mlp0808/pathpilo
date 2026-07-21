/** Public social profile URLs — used in footer and Organization schema sameAs. */
export const socialLinks = {
  facebook: 'https://www.facebook.com/profile.php?id=61578519940136',
  instagram: 'https://www.instagram.com/pathpilo/',
  /** Public company page — not the admin dashboard URL. */
  linkedin: 'https://www.linkedin.com/company/112351700/',
} as const

export const socialSameAs = Object.values(socialLinks)
