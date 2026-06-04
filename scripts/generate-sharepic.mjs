#!/usr/bin/env node
/**
 * Generates the sharepic PNG from docs/marketing/sharepic.html
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
const htmlPath = resolve(marketingDir, 'sharepic.html')
const pngPath = resolve(marketingDir, 'kapteins-daagbok-sharepic.png')

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

async function main() {
  const playwright = loadPlaywright()
  await ensurePlaywrightChromium(playwright)
  
  console.log('Generating sharepic from HTML...')
  const browser = await playwright.chromium.launch({ headless: true })
  
  try {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 2 // High-DPI for crisp text
    })
    const page = await context.newPage()
    
    // Wait for fonts/images to load fully
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
    
    // Take a screenshot of the viewport
    await page.screenshot({
      path: pngPath,
      type: 'png'
    })
    console.log('Sharepic PNG written successfully to:', pngPath)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('Error generating sharepic:', err)
  process.exit(1)
})
