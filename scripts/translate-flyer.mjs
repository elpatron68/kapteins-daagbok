#!/usr/bin/env node
/**
 * Generate localized beta flyer HTML files from the German master via DeepL.
 *
 * Usage: node scripts/translate-flyer.mjs [--lang da,sv,nb]
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnvKey, translateTexts } from './lib/deepl-translate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const sourcePath = resolve(repoRoot, 'docs/marketing/beta-flyer.html')

const TARGETS = {
  da: { code: 'DA', htmlLang: 'da', file: 'beta-flyer.da.html' },
  sv: { code: 'SV', htmlLang: 'sv', file: 'beta-flyer.sv.html' },
  nb: { code: 'NB', htmlLang: 'nb', file: 'beta-flyer.nb.html' }
}

/** Extract translatable text segments from HTML (text nodes only). */
function extractSegments(html) {
  const segments = []
  const re = />([^<]+)</g
  let match
  while ((match = re.exec(html)) !== null) {
    const text = match[1]
    if (!text.trim()) continue
    if (/^\s*$/.test(text)) continue
    segments.push({ text, index: segments.length })
  }
  return segments
}

function replaceSegments(html, originals, translated) {
  let result = html
  for (let i = 0; i < originals.length; i++) {
    const from = originals[i].text
    const to = translated[i]
    if (from === to) continue
    result = result.replace(`>${from}<`, `>${to}<`)
  }
  return result
}

function patchLanguageFeature(html, lang) {
  const langBlocks = {
    da: `<span class="lang-item"><svg class="feature-flag" viewBox="0 0 37 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="37" height="28" fill="#C8102E"/><rect x="12" width="4" height="28" fill="#fff"/><rect y="12" width="37" height="4" fill="#fff"/></svg>Dansk</span>`,
    sv: `<span class="lang-item"><svg class="feature-flag" viewBox="0 0 16 10" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="16" height="10" fill="#006AA7"/><rect x="5" width="2" height="10" fill="#FECC00"/><rect y="4" width="16" height="2" fill="#FECC00"/></svg>Svenska</span>`,
    nb: `<span class="lang-item"><svg class="feature-flag" viewBox="0 0 22 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="22" height="16" fill="#BA0C2F"/><rect x="6" width="4" height="16" fill="#fff"/><rect y="6" width="22" height="4" fill="#fff"/><rect x="7" width="2" height="16" fill="#00205B"/><rect y="7" width="22" height="2" fill="#00205B"/></svg>Norsk</span>`
  }

  const deEnBlock =
    /<span class="lang-list">[\s\S]*?<\/span><\/span><\/div>/
  const replacement = `<span class="lang-list">${langBlocks[lang]}<span class="lang-sep">&amp;</span><span class="lang-item"><svg class="feature-flag" viewBox="0 0 5 3" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="5" height="1" fill="#000"/><rect y="1" width="5" height="1" fill="#D00"/><rect y="2" width="5" height="1" fill="#FFCE00"/></svg>Deutsch</span><span class="lang-sep">&amp;</span><span class="lang-item"><svg class="feature-flag" viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><clipPath id="gb-a"><path d="M0 0v30h60V0z"/></clipPath><clipPath id="gb-b"><path d="M30 15h30v15zv15H0z"/></clipPath><g clip-path="url(#gb-a)"><path d="M0 0v30h60V0z" fill="#012169"/><path d="M0 0l60 30m0-30L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30m0-30L0 30" clip-path="url(#gb-b)" stroke="#C8102E" stroke-width="4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/></g></svg>Engelsk</span></span></div>`

  return html.replace(deEnBlock, replacement)
}

function parseArgs(argv) {
  let langs = Object.keys(TARGETS)
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--lang' && argv[i + 1]) {
      langs = argv[++i].split(',').map((l) => l.trim())
    }
  }
  return langs
}

async function main() {
  const langs = parseArgs(process.argv)
  const apiKey = loadEnvKey()
  const sourceHtml = await readFile(sourcePath, 'utf8')
  const segments = extractSegments(sourceHtml)
  const texts = segments.map((s) => s.text)

  for (const lang of langs) {
    const target = TARGETS[lang]
    if (!target) {
      console.error(`Unknown language: ${lang}`)
      process.exit(1)
    }

    console.log(`\n→ ${target.file}`)
    const translated = await translateTexts(texts, target.code, {
      sourceLang: 'DE',
      apiKey,
      batchSize: 20
    })

    let html = replaceSegments(sourceHtml, segments, translated)
    html = html.replace(/<html lang="de">/, `<html lang="${target.htmlLang}">`)
    html = html.replace(
      /<title>Kapteins Daagbok — Beta-Flyer<\/title>/,
      `<title>Kapteins Daagbok — Beta-Flyer (${target.htmlLang.toUpperCase()})</title>`
    )
    html = patchLanguageFeature(html, lang)

    const outPath = resolve(repoRoot, 'docs/marketing', target.file)
    await writeFile(outPath, html, 'utf8')
    console.log(`Wrote ${outPath}`)
  }
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
