import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Ship, LogIn, UserPlus, AlertTriangle, ShieldCheck, Languages, ArrowRight } from 'lucide-react'
import { getActiveMasterKey, registerUser, loginUser } from '../services/auth.js'
import { decryptJson, encryptBuffer } from '../services/crypto.js'
import { saveLogbookKey } from '../services/logbookKeys.js'
import { db } from '../services/db.js'
import { useDialog } from './ModalDialog.tsx'

interface InvitationAcceptanceProps {
  onAccepted: (logbookId: string, title: string) => void
  onCancel: () => void
}

// Convert Hex String back to ArrayBuffer
const hexToBuffer = (hex: string): ArrayBuffer => {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes.buffer
}

export default function InvitationAcceptance({ onAccepted, onCancel }: InvitationAcceptanceProps) {
  const { i18n } = useTranslation()
  const { showAlert } = useDialog()

  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Link parameters
  const [token, setToken] = useState('')
  const [logbookKey, setLogbookKey] = useState<ArrayBuffer | null>(null)

  // Details loaded from server
  const [ownerUsername, setOwnerUsername] = useState('')
  const [decryptedTitle, setDecryptedTitle] = useState('')
  const [logbookId, setLogbookId] = useState('')
  const [rawEncryptedTitle, setRawEncryptedTitle] = useState('')

  // Authentication states
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [loginMode, setLoginMode] = useState<'options' | 'login' | 'register'>('options')
  const [regUsername, setRegUsername] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)

  // Check login state on mount
  useEffect(() => {
    const key = getActiveMasterKey()
    const savedUser = localStorage.getItem('active_username')
    if (key && savedUser) {
      setIsLoggedIn(true)
      setUsername(savedUser)
    }

    // Extract parameters from URL
    const params = new URLSearchParams(window.location.search)
    const tokenVal = params.get('token') || ''
    setToken(tokenVal)

    // Hash anchor (#key=xxx)
    const hash = window.location.hash
    if (hash.startsWith('#key=')) {
      const hexKey = hash.substring(5)
      try {
        const keyBuffer = hexToBuffer(hexKey)
        setLogbookKey(keyBuffer)
      } catch (err) {
        console.error('Invalid key in URL fragment:', err)
        setError('The invitation link is cryptographically invalid or corrupted (missing key).')
      }
    } else {
      setError('The invitation link is missing the necessary decryption key fragment (#key=...).')
    }

    // Suggest a random guest skipper username
    const rand = Math.floor(1000 + Math.random() * 9000)
    setRegUsername(`CrewSkipper_${rand}`)
  }, [])

  // Load invitation details once parameters are ready
  useEffect(() => {
    if (token && logbookKey) {
      loadDetails()
    }
  }, [token, logbookKey])

  const loadDetails = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/collaboration/invite-details?token=${token}`)
      
      if (res.status === 410) {
        setError('This invitation link has expired (valid for 48 hours only).')
        return
      }

      if (!res.ok) {
        throw new Error('Failed to verify invitation token.')
      }

      const details = await res.json()
      setOwnerUsername(details.ownerUsername)
      setLogbookId(details.logbookId)

      setRawEncryptedTitle(details.encryptedTitle)
      
      // Decrypt title client-side using URL key
      const parsed = JSON.parse(details.encryptedTitle)
      const title = await decryptJson(parsed.ciphertext, parsed.iv, parsed.tag, logbookKey!)
      setDecryptedTitle(title)
    } catch (err: any) {
      console.error('Failed to load invitation details:', err)
      setError(err.message || 'Invitation details could not be retrieved from the server.')
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async () => {
    const masterKey = getActiveMasterKey()
    const activeUserId = localStorage.getItem('active_userid')
    if (!masterKey || !activeUserId || !logbookKey || !logbookId) return

    setAccepting(true)
    setError(null)

    try {
      // 1. Encrypt logbook key with user's master key
      const aesMasterKey = await window.crypto.subtle.importKey(
        'raw',
        masterKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      )
      const encrypted = await encryptBuffer(logbookKey, aesMasterKey)

      // 2. Register collaboration on server
      const res = await fetch('/api/collaboration/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': activeUserId
        },
        body: JSON.stringify({
          token,
          encryptedLogbookKey: encrypted.ciphertext,
          iv: encrypted.iv,
          tag: encrypted.tag
        })
      })

      if (!res.ok) {
        const serverError = await res.json()
        throw new Error(serverError.error || 'Failed to join logbook on the server.')
      }

      // 3. Save key locally in Dexie
      await saveLogbookKey(logbookId, logbookKey)

      // 3b. Save logbook index locally in Dexie so sync is triggered immediately
      if (rawEncryptedTitle) {
        await db.logbooks.put({
          id: logbookId,
          encryptedTitle: rawEncryptedTitle,
          updatedAt: new Date().toISOString(),
          isSynced: 1
        })
      }

      // 4. Redirect to workspace
      onAccepted(logbookId, decryptedTitle)
    } catch (err: any) {
      console.error('Accepting invitation failed:', err)
      setError(err.message || 'Acceptance failed.')
    } finally {
      setAccepting(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setLoading(true)

    try {
      const result = await loginUser()
      if (result.verified && result.prfSuccess) {
        setIsLoggedIn(true)
        setUsername(result.username || 'Skipper')
      } else if (result.verified) {
        // Biometrics succeeded but fallback phrase is needed
        setAuthError('Device doesn\'t support PRF key derivation. Traditional login is not supported in the invitation screen. Please log in normally on the main page first.')
      }
    } catch (err: any) {
      setAuthError(err.message || 'Passkey authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regUsername.trim()) return

    setAuthError(null)
    setLoading(true)

    try {
      const result = await registerUser(regUsername.trim())
      if (result.verified) {
        setIsLoggedIn(true)
        setUsername(regUsername.trim())
        showAlert(`Account created successfully! Your 12-word recovery phrase is: ${result.recoveryPhrase}. Write it down securely!`)
      }
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('de') ? 'en' : 'de'
    i18n.changeLanguage(nextLang)
  }

  if (loading && !accepting) {
    return (
      <div className="auth-card glass">
        <div className="auth-header">
          <Ship className="auth-icon accent spin" size={48} />
          <h2>{i18n.language.startsWith('de') ? 'Einladung wird geprüft...' : 'Checking Invitation...'}</h2>
        </div>
        <p className="recovery-warning">
          {i18n.language.startsWith('de') ? 'Lade Verschlüsselungsschlüssel und Verifizierungstoken...' : 'Retrieving credentials and secure key components...'}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="auth-card glass">
        <div className="auth-header">
          <AlertTriangle className="auth-icon warn" size={48} />
          <h2>{i18n.language.startsWith('de') ? 'Einladungsfehler' : 'Invitation Error'}</h2>
        </div>
        <p className="recovery-warning" style={{ color: '#ef4444' }}>{error}</p>
        
        <div className="auth-actions mt-6">
          <button className="btn primary" onClick={onCancel} style={{ width: '100%' }}>
            {i18n.language.startsWith('de') ? 'Zurück zum Start' : 'Back to Dashboard'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-card glass">
      <div className="auth-header">
        <ShieldCheck className="auth-icon success" size={48} style={{ color: '#10b981' }} />
        <h2>{i18n.language.startsWith('de') ? 'Logbuch-Einladung' : 'Logbook Invitation'}</h2>
      </div>

      <div style={{ textAlign: 'center', margin: '20px 0', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
        <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#64748b', textTransform: 'uppercase' }}>
          {i18n.language.startsWith('de') ? 'Einladung von' : 'INVITED BY'}
        </p>
        <p style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#f1f5f9' }}>
          Skipper {ownerUsername}
        </p>
        <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#64748b', textTransform: 'uppercase' }}>
          {i18n.language.startsWith('de') ? 'Schiff / Logbuch' : 'VESSEL / LOGBOOK'}
        </p>
        <p style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#fbbf24' }}>
          {decryptedTitle}
        </p>
      </div>

      {isLoggedIn ? (
        /* If logged in: Accept and Join immediately */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', lineHeight: '145%' }}>
            {i18n.language.startsWith('de') 
              ? `Sie sind angemeldet als ${username}. Möchten Sie diesem Logbuch als Crewmitglied beitreten?` 
              : `You are logged in as ${username}. Would you like to join this logbook with write permissions?`
            }
          </p>

          <div className="auth-actions mt-4" style={{ display: 'flex', gap: '12px' }}>
            <button className="btn secondary" onClick={onCancel} disabled={accepting} style={{ flex: 1 }}>
              {i18n.language.startsWith('de') ? 'Abbrechen' : 'Cancel'}
            </button>
            <button className="btn primary" onClick={handleAccept} disabled={accepting} style={{ flex: 2 }}>
              {accepting ? (i18n.language.startsWith('de') ? 'Beitritt...' : 'Joining...') : (i18n.language.startsWith('de') ? 'Beitreten' : 'Accept & Join')}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : (
        /* If not logged in: Ask to authenticate or register */
        <div style={{ width: '100%' }}>
          {loginMode === 'options' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '13.5px', color: '#94a3b8', textAlign: 'center', lineHeight: '145%' }}>
                {i18n.language.startsWith('de') 
                  ? 'Sie müssen ein Passkey-Konto besitzen oder erstellen, um E2E-verschlüsselte Einträge zu schreiben.' 
                  : 'You must authenticate or register an E2E-secured crew account to write entries.'
                }
              </p>

              <button className="btn primary" onClick={handleLogin} style={{ width: '100%', padding: '14px' }}>
                <LogIn size={16} />
                {i18n.language.startsWith('de') ? 'Mit Passkey anmelden' : 'Log In with Passkey'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }}></div>
                <span style={{ padding: '0 10px', fontSize: '12px', color: '#64748b' }}>
                  {i18n.language.startsWith('de') ? 'ODER NEU REGISTRIEREN' : 'OR SIGN UP'}
                </span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }}></div>
              </div>

              <button className="btn secondary" onClick={() => setLoginMode('register')} style={{ width: '100%' }}>
                <UserPlus size={16} />
                {i18n.language.startsWith('de') ? 'Neues Crew-Konto erstellen' : 'Register New Crew Account'}
              </button>
            </div>
          )}

          {loginMode === 'register' && (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group">
                <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
                  {i18n.language.startsWith('de') ? 'Skipper- / Benutzername' : 'Skipper / User Name'}
                </label>
                <input
                  type="text"
                  className="input-text"
                  placeholder="e.g. Max Mustermann"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  required
                />
              </div>

              <div className="auth-actions">
                <button type="button" className="btn secondary" onClick={() => setLoginMode('options')}>
                  {i18n.language.startsWith('de') ? 'Zurück' : 'Back'}
                </button>
                <button type="submit" className="btn primary" disabled={!regUsername.trim()}>
                  {i18n.language.startsWith('de') ? 'Passkey erstellen & beitreten' : 'Create Passkey & Join'}
                </button>
              </div>
            </form>
          )}

          {authError && (
            <div className="auth-error mt-4" style={{ fontSize: '13px' }}>
              {authError}
            </div>
          )}
        </div>
      )}

      <div className="auth-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginTop: '24px' }}>
        <button className="btn-icon-text" onClick={toggleLanguage}>
          <Languages size={18} />
          {i18n.language.startsWith('de') ? 'English' : 'Deutsch'}
        </button>
      </div>
    </div>
  )
}
