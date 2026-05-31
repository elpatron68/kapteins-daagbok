#!/usr/bin/env node
/**
 * Generates beta flyer PDF/PNG from docs/marketing/beta-flyer*.html
 *
 * Usage:
 *   node scripts/generate-beta-flyer.mjs              # German PDF
 *   node scripts/generate-beta-flyer.mjs --png          # German PNG
 *   node scripts/generate-beta-flyer.mjs --all          # all locales, PDF + PNG
 *   node scripts/generate-beta-flyer.mjs --lang da,sv # selected locales
 */

import { execSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const clientDir = resolve(repoRoot, 'client')
const marketingDir = resolve(repoRoot, 'docs/marketing')
const assetsDir = resolve(marketingDir, 'assets')
const qrPath = resolve(assetsDir, 'qr-kapteins-daagbok.eu.png')
const appUrl = 'https://kapteins-daagbok.eu'

const LOCALES = {
  de: { html: 'beta-flyer.html', suffix: '' },
  da: { html: 'beta-flyer.da.html', suffix: '.da' },
  sv: { html: 'beta-flyer.sv.html', suffix: '.sv' },
  nb: { html: 'beta-flyer.nb.html', suffix: '.nb' }
}

const require = createRequire(resolve(clientDir, 'package.json'))

function parseArgs(argv) {
  const all = argv.includes('--all')
  let langs = all ? Object.keys(LOCALES) : ['de']
  let pdf = !argv.includes('--png-only')
  let png = argv.includes('--png') || argv.includes('--all') || argv.includes('--png-only')

  if (argv.includes('--pdf-only')) {
    pdf = true
    png = false
  }

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--lang' && argv[i + 1]) {
      langs = argv[++i].split(',').map((l) => l.trim())
    }
  }

  return { langs, pdf, png }
}

function isMissingBrowserError(err) {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes("Executable doesn't exist") || msg.includes('browserType.launch')
}

async function ensurePlaywrightChromium(playwright) {
  try {
    const browser = await playwright.chromium.launch({ headless: true })
    await browser.close()
    return
  } catch (err) {
    if (!isMissingBrowserError(err)) throw err
  }

  console.log('Playwright Chromium fehlt — installiere Browser (einmalig)…')
  execSync('npx playwright install chromium', {
    cwd: clientDir,
    stdio: 'inherit'
  })
}

async function ensureQrCode() {
  let QRCode
  try {
    QRCode = require('qrcode')
  } catch {
    console.error('Fehlende Abhängigkeit: "npm install -D qrcode playwright" in client/ ausführen.')
    process.exit(1)
  }

  await mkdir(assetsDir, { recursive: true })
  const png = await QRCode.toBuffer(appUrl, {
    type: 'png',
    width: 512,
    margin: 1,
    color: { dark: '#0f172a', light: '#ffffff' }
  })
  await writeFile(qrPath, png)
  console.log('QR code written:', qrPath)
}

function loadPlaywright() {
  try {
    return require('playwright')
  } catch {
    console.error('Fehlende Abhängigkeit: "npm install -D playwright" in client/ ausführen.')
    process.exit(1)
  }
}

async function renderPdf(page, htmlPath, pdfPath) {
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  })
  console.log('PDF written:', pdfPath)
}

async function renderPng(page, htmlPath, pngPath) {
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
  await page.screenshot({
    path: pngPath,
    fullPage: true,
    type: 'png'
  })
  console.log('PNG written:', pngPath)
}

async function generateForLocale(playwright, lang, { pdf, png }) {
  const locale = LOCALES[lang]
  if (!locale) {
    console.error(`Unknown locale: ${lang}`)
    process.exit(1)
  }

  const htmlPath = resolve(marketingDir, locale.html)
  const baseName = `kapteins-daagbok-beta-flyer${locale.suffix}`
  const pdfPath = resolve(marketingDir, `${baseName}.pdf`)
  const pngPath = resolve(marketingDir, `${baseName}.png`)

  console.log(`\n→ ${lang.toUpperCase()} (${locale.html})`)

  await ensurePlaywrightChromium(playwright)
  const browser = await playwright.chromium.launch({ headless: true })

  try {
    if (pdf) {
      const page = await browser.newPage()
      await renderPdf(page, htmlPath, pdfPath)
      await page.close()
    }

    if (png) {
      const context = await browser.newContext({
        viewport: { width: 794, height: 1123 },
        deviceScaleFactor: 2
      })
      const page = await context.newPage()
      await renderPng(page, htmlPath, pngPath)
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

const { langs, pdf, png } = parseArgs(process.argv)
await ensureQrCode()

const playwright = loadPlaywright()
for (const lang of langs) {
  await generateForLocale(playwright, lang, { pdf, png })
}
