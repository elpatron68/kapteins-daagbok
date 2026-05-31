#!/usr/bin/env node
/**
 * Generates the beta flyer PDF from docs/marketing/beta-flyer.html
 * Usage: npm run generate:flyer --prefix client
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
const htmlPath = resolve(marketingDir, 'beta-flyer.html')
const qrPath = resolve(assetsDir, 'qr-kapteins-daagbok.eu.png')
const pdfPath = resolve(marketingDir, 'kapteins-daagbok-beta-flyer.pdf')
const pngPath = resolve(marketingDir, 'kapteins-daagbok-beta-flyer.png')
const appUrl = 'https://kapteins-daagbok.eu'

const require = createRequire(resolve(clientDir, 'package.json'))

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

async function renderPdf() {
  let playwright
  try {
    playwright = require('playwright')
  } catch {
    console.error('Fehlende Abhängigkeit: "npm install -D playwright" in client/ ausführen.')
    process.exit(1)
  }

  await ensurePlaywrightChromium(playwright)

  const browser = await playwright.chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    })
    console.log('PDF written:', pdfPath)
  } finally {
    await browser.close()
  }
}

async function renderPng() {
  let playwright
  try {
    playwright = require('playwright')
  } catch {
    console.error('Fehlende Abhängigkeit: "npm install -D playwright" in client/ ausführen.')
    process.exit(1)
  }

  await ensurePlaywrightChromium(playwright)

  const browser = await playwright.chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 794, height: 1123 },
      deviceScaleFactor: 2
    })
    const page = await context.newPage()
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
    await page.screenshot({
      path: pngPath,
      fullPage: true,
      type: 'png'
    })
    console.log('PNG written:', pngPath)
    await context.close()
  } finally {
    await browser.close()
  }
}

await ensureQrCode()
const outputMode = process.argv.includes('--png') ? 'png' : 'pdf'

if (outputMode === 'png') {
  await renderPng()
} else {
  await renderPdf()
}
