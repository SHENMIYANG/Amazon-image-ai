export function buildGlobalRules({
  marketplace = 'UK',
  imageLanguage = 'English',
  fontPreference = 'auto',
  brandColorMode = 'auto',
  brandColor = ''
} = {}) {
  return {
    truth: [
      'The primary product image is the highest authority for product truth.',
      'Supporting product images may supplement angles and details, but cannot override product identity.',
      'Do not change product appearance, proportions, structure, material, color, or included accessories.'
    ],
    physics: [
      'No penetration through solid surfaces.',
      'No floating parts or fake support logic.',
      'No fused geometry between product and environment.',
      'Respect gravity, real contact points, and continuous connected structure.'
    ],
    consistency: [
      'Do not add nonexistent parts, props, buttons, logos, brackets, bases, suction cups, or decorative elements.',
      'Do not remove real parts or real included accessories.',
      'Camera angle may change, but product design may not change.'
    ],
    referenceRules: [
      'Primary reference controls appearance, structure, and accessories.',
      'Supporting references may inform detail and angle only.',
      'Style references may influence layout, composition, lighting, and color mood only.'
    ],
    market: {
      marketplace,
      language: imageLanguage
    },
    presentation: {
      fontPreference,
      brandColorMode,
      brandColor: brandColorMode === 'manual' && brandColor ? brandColor : 'auto'
    }
  }
}
