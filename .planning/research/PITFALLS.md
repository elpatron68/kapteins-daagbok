# Pitfalls Research

**Domain:** Offline-first PWA, Local Storage, Geolocation
**Researched:** 2026-05-26
**Confidence:** HIGH

## Common Domain Pitfalls

### 1. iOS Safari IndexedDB Expiration Policy
- **Problem**: Apple iOS Safari has a strict policy where IndexedDB data can be deleted if the user does not open the website for 7 days. This only affects standard websites, but if the app is installed as a PWA on the Home Screen, it is exempt from this rule.
- **Warning Signs**: Logbook entries or vessel profile data disappearing after a week of inactivity.
- **Prevention Strategy**: 
  - Add an onboarding notification prompting users to install the app on their Home Screen.
  - Implement a persistent storage request using the Storage Manager API (`navigator.storage.persist()`) when supported.
  - Encourage the user to download CSV backups regularly.
  - Show a prominent "Storage Status: Persistent/Temporary" badge in Settings.

### 2. Network Timeouts and Offline Weather API Calls
- **Problem**: When out at sea, cellular network connections are often weak or non-existent. Attempting to fetch OpenWeatherMap API details can hang the browser, causing the form to freeze or crash if timeouts are not managed.
- **Warning Signs**: The UI stops responding or loading spinner rotates infinitely when user clicks the weather lookup button.
- **Prevention Strategy**:
  - Enforce a strict 5-second timeout on all API fetch requests.
  - Check network state via `navigator.onLine` before making requests. If offline, instantly skip the request, show a toast notification ("Offline: Weather lookup skipped"), and fall back to manual form fields.
  - Wrap all API integrations in robust `try...catch` blocks to prevent unhandled promise rejections.

### 3. Inaccurate or Slow GPS Geolocations
- **Problem**: Geolocation requests in browsers can fail or return low-accuracy positions, especially when using devices without a dedicated GPS chip (like Wi-Fi-only iPads or laptops) or when indoors/below deck.
- **Warning Signs**: Lat/Long coordinates are empty, coordinates point to the wrong city (based on outdated IP databases), or the browser prompts times out.
- **Prevention Strategy**:
  - Set `enableHighAccuracy: true` in the Geolocation options.
  - Configure a `timeout: 10000` (10 seconds) so the app does not wait indefinitely.
  - Check the `accuracy` parameter returned by the API; if it exceeds 100 meters, warn the user with a subtle yellow icon near the coordinates.
  - Always allow the coordinates to be typed or corrected manually.

### 4. PWA Service Worker Update Lock (Stale Apps)
- **Problem**: A default Service Worker setup caches all files and might serve older app versions indefinitely, even after bug fixes are deployed. If the user loads the app, they keep getting the old cache unless they close all tabs.
- **Warning Signs**: Code changes are deployed, but the user's mobile screen still displays the old version.
- **Prevention Strategy**:
  - Use `vite-plugin-pwa`'s "Prompt for Update" behavior instead of auto-updating.
  - Detect service worker updates and show a Toast element: "New version available. [Reload to update]".
  - Trigger `window.location.reload(true)` upon user agreement.

### 5. Logbook Form Auto-Save (Drafts)
- **Problem**: Skipper is in the middle of filling out a logbook entry during rough seas, gets distracted, and the browser tab closes or reloads. All typed text (which they might have measured manually) is lost.
- **Warning Signs**: User frustration from losing details of an event due to a browser crash or navigation error.
- **Prevention Strategy**:
  - Implement an auto-save mechanism that writes the active form draft to IndexedDB (or LocalStorage) every 10 seconds.
  - On launching the logbook entry form, check if a draft exists and offer to restore it.

### 6. Passkey Authenticator Compatibility & WebAuthn Limitations
- **Problem**: Biometric hardware/WebAuthn APIs might be restricted on legacy operating systems, specific Android skins, or in private/incognito browsing windows.
- **Warning Signs**: Browser throws authentication errors or `navigator.credentials` returns undefined.
- **Prevention Strategy**:
  - Check `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` on onboarding.
  - Inform the user of browser/device capability limitations and recommend updating their system.
  - Fall back cleanly to hardware USB security keys if biometrics fail.

### 7. Permanent Data Loss due to E2E Encryption Key Loss
- **Problem**: In a zero-knowledge architecture, the server does not store plaintext passwords or master keys. If the user registers a Passkey, loses their device, and loses their 12-word recovery phrase, the server cannot recover their logbooks.
- **Warning Signs**: Skipper logs out or switches devices and cannot decrypt downloaded database chunks.
- **Prevention Strategy**:
  - Enforce a mandatory recovery phrase validation step (e.g. asking the user to re-enter words 3, 7, and 11) during sign-up.
  - Display clear warnings in the settings dashboard about the zero-knowledge nature of the server.

### 8. Concurrent Sync Conflicts from Offline Edits
- **Problem**: Skipper modifies a logbook entry or crew member on device A (phone) and device B (tablet) while both are offline at sea. Upon re-establishing internet, conflicting updates are pushed to the server.
- **Warning Signs**: Data edits are silently overwritten or entries become duplicated/corrupted.
- **Prevention Strategy**:
  - Use atomic delta packages containing object timestamps.
  - Apply Last-Write-Wins (LWW) strategy on standard field updates based on local timestamps.
  - For journal entry splits, append logs chronologically instead of overwriting, and flag conflict states to the user for manual merge.

---
*Pitfalls research for: Kapteins Daagbox PWA*
*Researched: 2026-05-26 (Updated 2026-05-27)*
