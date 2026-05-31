#!/usr/bin/env node
/**
 * Verify all locale JSON files have identical key sets.
 * Usage: node scripts/validate-i18n-keys.mjs
 */

import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { flattenTranslation } from './lib/deepl-translate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localesDir = resolve(__dirname, '../client/src/i18n/locales')
const localeFiles = ['de.json', 'en.json', 'da.json', 'sv.json', 'nb.json']

async function loadKeys(filename) {
  const raw = await readFile(resolve(localesDir, filename), 'utf8')
  const json = JSON.parse(raw)
  return flattenTranslation(json.translation).map(([path]) => path).sort()
}

async function main() {
  const keySets = {}
  for (const file of localeFiles) {
    keySets[file] = await loadKeys(file)
  }

  const master = keySets['de.json']
  let failed = false

  for (const file of localeFiles) {
    if (file === 'de.json') continue
    const keys = keySets[file]
    const missing = master.filter((k) => !keys.includes(k))
    const extra = keys.filter((k) => !master.includes(k))
    if (missing.length || extra.length) {
      failed = true
      console.error(`\n${file}:`)
      if (missing.length) console.error(`  missing (${missing.length}):`, missing.slice(0, 10).join(', '))
      if (extra.length) console.error(`  extra (${extra.length}):`, extra.slice(0, 10).join(', '))
    } else {
      console.log(`${file}: OK (${keys.length} keys)`)
    }
  }

  if (failed) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
