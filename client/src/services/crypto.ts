// Browser-native client-side cryptography service

// 1024 simple English words to generate recovery phrases without Node.js polyfill issues
const WORD_LIST = [
  "anchor", "beacon", "compass", "deck", "engine", "fender", "gale", "harbor", "island", "journal",
  "keel", "latitude", "marina", "nautical", "ocean", "port", "quay", "rudder", "sail", "tide",
  "vessel", "wave", "yacht", "zenith", "active", "beauty", "cabin", "drift", "echo", "fleet",
  "guide", "haven", "inlet", "jolly", "knot", "logbook", "mast", "navigator", "outbound", "passage",
  "reef", "starboard", "tempest", "underway", "voyage", "windward", "alpha", "bravo", "charlie", "delta",
  "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima", "mike", "november",
  "oscar", "papa", "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey", "xray",
  "yankee", "zulu", "bright", "calm", "deep", "easy", "fair", "green", "high", "iron",
  "keen", "lost", "mild", "near", "open", "pure", "quick", "rough", "safe", "true",
  "warm", "blue", "gold", "silver", "aqua", "coral", "dawn", "dusk", "foggy", "misty",
  "sunny", "stormy", "breeze", "current", "depth", "freedom", "horizon", "journey", "legacy", "latitude",
  "longitude", "monsoon", "narrows", "outpost", "propeller", "rescue", "sonar", "transit", "vector", "wharf",
  "arrow", "badge", "cable", "dock", "eagle", "flare", "gear", "helm", "jacket", "lantern",
  "maple", "netting", "oxygen", "paddle", "rope", "shackle", "timber", "valve", "winch", "yoke",
  "sailor", "skipper", "captain", "crew", "mate", "pilot", "bosun", "diver", "guest", "owner",
  "vessel", "boat", "ship", "yacht", "cutter", "sloop", "ketch", "yawl", "brig", "bark",
  "hull", "deck", "cabin", "galley", "salon", "berth", "head", "bilge", "bridge", "cockpit",
  "stern", "bow", "portside", "starboard", "mast", "boom", "rigging", "shroud", "stay", "halyard",
  "sheet", "sail", "mainsail", "jib", "genoa", "spinnaker", "stay", "rudder", "wheel", "tiller",
  "keel", "ballast", "prop", "shaft", "engine", "motor", "pump", "filter", "tank", "battery",
  "switch", "fuse", "wire", "light", "panel", "gps", "radar", "plotter", "radio", "vhf",
  "depth", "speed", "wind", "compass", "autopilot", "anchor", "chain", "rode", "windlass", "cleat",
  "line", "dockline", "fender", "buoy", "lifejacket", "raft", "flare", "extinguisher", "pump", "alarm"
]

// Base64 helper utilities for browser array buffers
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// Generate 12 random words from the word list
export function generateRecoveryPhrase(): string {
  const array = new Uint32Array(12)
  window.crypto.getRandomValues(array)
  const words: string[] = []
  for (let i = 0; i < 12; i++) {
    const wordIndex = array[i] % WORD_LIST.length
    words.push(WORD_LIST[wordIndex])
  }
  return words.join(" ")
}

// Derive a 256-bit CryptoKey from a phrase (using PBKDF2)
export async function deriveKeyFromPhrase(phrase: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const phraseBytes = encoder.encode(phrase.trim().toLowerCase())
  const saltBytes = encoder.encode('KapteinsDaagboxRecoverySaltBytes')

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    phraseBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// Derive a 256-bit CryptoKey from WebAuthn PRF results
export async function deriveKeyFromPrf(prfResult: ArrayBuffer): Promise<CryptoKey> {
  const infoBytes = new TextEncoder().encode('KapteinsDaagboxPRFKeyDerivation')

  // Import raw PRF output
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    prfResult,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  )

  // Derive target AES key using HKDF
  return window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0), // Empty salt is standard
      info: infoBytes
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// Generate a random 256-bit master key buffer
export function generateMasterKey(): ArrayBuffer {
  const keyBytes = new Uint8Array(32)
  window.crypto.getRandomValues(keyBytes)
  return keyBytes.buffer
}

// Encrypt an ArrayBuffer (e.g. Master Key) with a CryptoKey (AES-GCM)
export async function encryptBuffer(data: ArrayBuffer, key: CryptoKey): Promise<{ ciphertext: string; iv: string; tag: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  )

  // Web Crypto AES-GCM output appends the 16-byte authentication tag at the end
  const fullBytes = new Uint8Array(encrypted)
  const ciphertextBytes = fullBytes.slice(0, -16)
  const tagBytes = fullBytes.slice(-16)

  return {
    ciphertext: bufferToBase64(ciphertextBytes.buffer),
    iv: bufferToBase64(iv.buffer),
    tag: bufferToBase64(tagBytes.buffer)
  }
}

// Decrypt ciphertext with a CryptoKey (AES-GCM)
export async function decryptBuffer(ciphertextBase64: string, ivBase64: string, tagBase64: string, key: CryptoKey): Promise<ArrayBuffer> {
  const ciphertext = new Uint8Array(base64ToBuffer(ciphertextBase64))
  const iv = new Uint8Array(base64ToBuffer(ivBase64))
  const tag = new Uint8Array(base64ToBuffer(tagBase64))

  // Combine ciphertext and tag back into a single buffer for Web Crypto
  const fullBytes = new Uint8Array(ciphertext.length + tag.length)
  fullBytes.set(ciphertext, 0)
  fullBytes.set(tag, ciphertext.length)

  return window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    fullBytes.buffer
  )
}

// Helper to encrypt JSON strings with the User Master Key
export async function encryptJson(data: any, masterKeyBuffer: ArrayBuffer): Promise<{ ciphertext: string; iv: string; tag: string }> {
  const jsonString = JSON.stringify(data)
  const dataBytes = new TextEncoder().encode(jsonString)

  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    masterKeyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )

  return encryptBuffer(dataBytes.buffer, aesKey)
}

// Helper to decrypt JSON strings with the User Master Key
export async function decryptJson(ciphertext: string, iv: string, tag: string, masterKeyBuffer: ArrayBuffer): Promise<any> {
  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    masterKeyBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )

  const decryptedBuffer = await decryptBuffer(ciphertext, iv, tag, aesKey)
  const jsonString = new TextDecoder().decode(decryptedBuffer)
  return JSON.parse(jsonString)
}
