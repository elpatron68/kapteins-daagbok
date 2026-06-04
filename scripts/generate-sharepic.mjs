#!/usr/bin/env node
/**
 * Generates the sharepic PNGs (landscape & portrait) from HTML files
 *
 * Usage:
 *   node scripts/generate-sharepic.mjs
 */

import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const clientDir = resolve(repoRoot, 'client')
const marketingDir = resolve(repoRoot, 'docs/marketing')

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

function loadPlaywright() {
  try {
    return require('playwright')
  } catch {
    console.error('Fehlende Abhängigkeit: "npm install -D playwright" in client/ ausführen.')
    process.exit(1)
  }
}

async function renderSharepic(browser, htmlName, pngName, width, height) {
  const htmlPath = resolve(marketingDir, htmlName)
  const pngPath = resolve(marketingDir, pngName)
  
  console.log(`Generating sharepic (${width}x${height}) from ${htmlName}...`)
  
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2 // High-DPI for crisp text
  })
  const page = await context.newPage()
  
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
    await page.screenshot({
      path: pngPath,
      type: 'png'
    })
    console.log('Successfully wrote:', pngPath)
  } finally {
    await page.close()
  }
}

async function main() {
  const playwright = loadPlaywright()
  await ensurePlaywrightChromium(playwright)
  
  const browser = await playwright.chromium.launch({ headless: true })
  
  try {
    // Landscape 1200x630
    await renderSharepic(browser, 'sharepic.html', 'kapteins-daagbok-sharepic.png', 1200, 630)
    
    // Portrait 1080x1920
    await renderSharepic(browser, 'sharepic-portrait.html', 'kapteins-daagbok-sharepic-portrait.png', 1080, 1920)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('Error generating sharepics:', err)
  process.exit(1)
})
