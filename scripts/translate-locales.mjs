#!/usr/bin/env node
/**
 * Translate i18n locale JSON from German master via DeepL.
 *
 * Usage:
 *   node scripts/translate-locales.mjs [--lang da,sv,nb] [--source client/src/i18n/locales/de.json]
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  flattenTranslation,
  loadEnvKey,
  translateTexts,
  unflattenTranslation
} from './lib/deepl-translate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const defaultSource = resolve(repoRoot, 'client/src/i18n/locales/de.json')

const TARGETS = {
  da: 'DA',
  sv: 'SV',
  nb: 'NB'
}

/** Keys whose values stay identical to source (language names, brand). */
const COPY_AS_IS_PREFIXES = ['languages.', 'app.name']

function parseArgs(argv) {
  let langs = Object.keys(TARGETS)
  let sourcePath = defaultSource

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--lang' && argv[i + 1]) {
      langs = argv[++i].split(',').map((l) => l.trim())
    } else if (argv[i] === '--source' && argv[i + 1]) {
      sourcePath = resolve(repoRoot, argv[++i])
    }
  }

  return { langs, sourcePath }
}

function shouldCopyAsIs(path) {
  return COPY_AS_IS_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))
}

async function translateLocale(sourceJson, langCode, apiKey) {
  const entries = flattenTranslation(sourceJson.translation)
  const toTranslate = []
  const indices = []

  entries.forEach(([path, value], index) => {
    if (shouldCopyAsIs(path)) return
    toTranslate.push(value)
    indices.push(index)
  })

  console.log(`Translating ${toTranslate.length} strings to ${langCode.toUpperCase()}…`)
  const translated = await translateTexts(toTranslate, TARGETS[langCode], {
    sourceLang: 'DE',
    apiKey
  })

  const resultEntries = [...entries]
  indices.forEach((entryIndex, i) => {
    resultEntries[entryIndex][1] = translated[i]
  })

  return { translation: unflattenTranslation(resultEntries) }
}

async function main() {
  const { langs, sourcePath } = parseArgs(process.argv)
  const apiKey = loadEnvKey()
  const sourceRaw = await readFile(sourcePath, 'utf8')
  const sourceJson = JSON.parse(sourceRaw)

  for (const lang of langs) {
    if (!TARGETS[lang]) {
      console.error(`Unknown language: ${lang}`)
      process.exit(1)
    }

    const outPath = resolve(repoRoot, `client/src/i18n/locales/${lang}.json`)
    console.log(`\n→ ${lang}.json`)
    const translated = await translateLocale(sourceJson, lang, apiKey)
    await writeFile(outPath, `${JSON.stringify(translated, null, 2)}\n`, 'utf8')
    console.log(`Wrote ${outPath}`)
  }
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
