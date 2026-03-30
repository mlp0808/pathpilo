const path = require('path')

// Pin Tailwind to this app’s config (repo root also has tailwind.config.js).
module.exports = {
  plugins: {
    tailwindcss: {
      config: path.join(__dirname, 'tailwind.config.js'),
    },
    autoprefixer: {},
  },
}
