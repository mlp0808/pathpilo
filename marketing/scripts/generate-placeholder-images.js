/**
 * Creates minimal placeholder PNGs under public/images/ so filenames are stable.
 * You can replace any file with a real image — keep the same name.
 *
 * Usage: node scripts/generate-placeholder-images.js
 */

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const publicDir = path.join(root, 'public')

/** 1×1 transparent PNG (valid, tiny) */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

/** All managed files (must stay in sync with app/config/marketingImages.ts) */
const ALL_RELATIVE = [
  'images/brand/logo-header.png',
  'images/brand/logo-footer-white.png',
  'images/features/scheduling.png',
  'images/features/jobs.png',
  'images/features/recurring.png',
  'images/features/clients.png',
  'images/features/leads.png',
  'images/features/invoicing.png',
  'images/features/analytics.png',
  'images/features/routes.png',
  'images/features/team.png',
  'images/og/og-image.png',
]

function writeFile(rel, buf) {
  const dest = path.join(publicDir, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, buf)
  console.log('wrote', rel, `(${buf.length} bytes)`)
}

console.log('Generating marketing placeholder images…\n')

for (const rel of ALL_RELATIVE) {
  const dest = path.join(publicDir, rel)
  if (fs.existsSync(dest)) {
    console.log('skip (exists):', rel)
    continue
  }
  writeFile(rel, TINY_PNG)
}

console.log('\nDone. Replace any file under public/images/ keeping the same filename.')
