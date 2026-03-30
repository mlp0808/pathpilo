const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', 'app', 'i18n', 'messages')
const basePath = path.join(root, 'en.json')
const targetFiles = ['da.json']

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function main() {
  const base = readJson(basePath)
  const baseKeys = Object.keys(base).sort()
  let hasErrors = false

  for (const filename of targetFiles) {
    const filePath = path.join(root, filename)
    const target = readJson(filePath)
    const targetKeys = new Set(Object.keys(target))

    const missing = baseKeys.filter((k) => !targetKeys.has(k))
    if (missing.length > 0) {
      hasErrors = true
      console.error(`\n${filename} is missing ${missing.length} keys:`)
      for (const key of missing) console.error(`  - ${key}`)
    } else {
      console.log(`${filename}: OK`)
    }
  }

  if (hasErrors) {
    process.exitCode = 1
  }
}

main()

