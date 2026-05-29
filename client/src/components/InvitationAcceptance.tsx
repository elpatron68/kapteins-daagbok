import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Ship, LogIn, UserPlus, AlertTriangle, ShieldCheck, Languages, ArrowRight, KeyRound } from 'lucide-react'
import {
  getActiveMasterKey,
  registerUser,
  loginUser,
  completeLoginWithRecovery,
  getKnownUsernames
} from '../services/auth.js'
import { decryptJson, encryptBuffer } from '../services/crypto.js'
import { saveLogbookKey } from '../services/logbookKeys.js'
import { syncLogbook } from '../services/sync.js'
import { db } from '../services/db.js'

interface InvitationAcceptanceProps {
  onAccepted: (logbookId: string, title: string) => void
  onCancel: () => void
}

const hexToBuffer = (hex: string): ArrayBuffer => {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes.buffer
}

export default function InvitationAcceptance({ onAccepted, onCancel }: InvitationAcceptanceProps) {
  const { t, i18n } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [token, setToken] = useState('')
  const [logbookKey, setLogbookKey] = useState<ArrayBuffer | null>(null)

  const [ownerUsername, setOwnerUsername] = useState('')
  const [decryptedTitle, setDecryptedTitle] = useState('')
  const [logbookId, setLogbookId] = useState('')
  const [rawEncryptedTitle, setRawEncryptedTitle] = useState('')

  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [loginMode, setLoginMode] = useState<'options' | 'register'>('options')
  const [regUsername, setRegUsername] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)

  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null)
  const [showRecoveryFallback, setShowRecoveryFallback] = useState(false)
  const [recoveryInput, setRecoveryInput] = useState('')
  const [encryptedPayloads, setEncryptedPayloads] = useState<any>(null)

  const autoAcceptStarted = useRef(false)

  const isDe = i18n.language.startsWith('de')

  const sessionReady = (): boolean => {
    return !!(getActiveMasterKey() && localStorage.getItem('active_userid'))
  }

  useEffect(() => {
    const key = getActiveMasterKey()
    const savedUser = localStorage.getItem('active_username')
    const savedUserId = localStorage.getItem('active_userid')
    if (key && savedUser && savedUserId) {
      setIsLoggedIn(true)
      setUsername(savedUser)
    }

    const params = new URLSearchParams(window.location.search)
    const tokenVal = params.get('token') || ''
    setToken(tokenVal)

    const hash = window.location.hash
    if (hash.startsWith('#key=')) {
      const hexKey = hash.substring(5)
      try {
        setLogbookKey(hexToBuffer(hexKey))
      } catch (err) {
        console.error('Invalid key in URL fragment:', err)
        setError(isDe
          ? 'Der Einladungslink ist kryptografisch ungültig (Schlüssel fehlerhaft).'
          : 'The invitation link is cryptographically invalid (corrupted key).')
      }
    } else {
      setError(isDe
        ? 'Der Einladungslink enthält keinen Entschlüsselungsschlüssel (#key=...). Bitte den vollständigen Link vom Eigner verwenden.'
        : 'The invitation link is missing the decryption key (#key=...). Please use the complete link from the owner.')
    }

    const rand = Math.floor(1000 + Math.random() * 9000)
    setRegUsername(`CrewSkipper_${rand}`)
  }, [isDe])

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
        setError(isDe
          ? 'Diese Einladung ist abgelaufen (48 Stunden gültig).'
          : 'This invitation link has expired (valid for 48 hours only).')
        return
      }

      if (!res.ok) {
        throw new Error(isDe ? 'Einladungstoken ungültig.' : 'Failed to verify invitation token.')
      }

      const details = await res.json()
      setOwnerUsername(details.ownerUsername)
      setLogbookId(details.logbookId)
      setRawEncryptedTitle(details.encryptedTitle)

      const parsed = JSON.parse(details.encryptedTitle)
      const title = await decryptJson(parsed.ciphertext, parsed.iv, parsed.tag, logbookKey!)
      setDecryptedTitle(title)
    } catch (err: any) {
      console.error('Failed to load invitation details:', err)
      setError(err.message || (isDe ? 'Einladungsdetails konnten nicht geladen werden.' : 'Invitation details could not be retrieved.'))
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = useCallback(async () => {
    const masterKey = getActiveMasterKey()
    const activeUserId = localStorage.getItem('active_userid')
    if (!masterKey || !activeUserId) {
      autoAcceptStarted.current = false
      setError(isDe
        ? 'Sitzung unvollständig — bitte erneut anmelden (Benutzer-ID fehlt).'
        : 'Incomplete session — please log in again (user ID missing).')
      setIsLoggedIn(false)
      return
    }
    if (!logbookKey || !logbookId) return

    setAccepting(true)
    setError(null)

    try {
      const aesMasterKey = await window.crypto.subtle.importKey(
        'raw',
        masterKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      )
      const encrypted = await encryptBuffer(logbookKey, aesMasterKey)

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
        const serverError = await res.json().catch(() => ({}))
        throw new Error(serverError.error || (isDe ? 'Beitritt auf dem Server fehlgeschlagen.' : 'Failed to join logbook on the server.'))
      }

      await saveLogbookKey(logbookId, logbookKey)

      if (rawEncryptedTitle) {
        await db.logbooks.put({
          id: logbookId,
          encryptedTitle: rawEncryptedTitle,
          updatedAt: new Date().toISOString(),
          isSynced: 1,
          isShared: 1
        })
      }

      await syncLogbook(logbookId)
      onAccepted(logbookId, decryptedTitle)
    } catch (err: any) {
      console.error('Accepting invitation failed:', err)
      setError(err.message || (isDe ? 'Beitritt fehlgeschlagen.' : 'Acceptance failed.'))
      autoAcceptStarted.current = false
    } finally {
      setAccepting(false)
    }
  }, [logbookId, logbookKey, token, rawEncryptedTitle, decryptedTitle, onAccepted, isDe])

  useEffect(() => {
    if (loading || accepting || autoAcceptStarted.current) return
    if (!isLoggedIn || !logbookId || !logbookKey || !token) return
    if (!sessionReady()) {
      autoAcceptStarted.current = false
      return
    }

    autoAcceptStarted.current = true
    void handleAccept()
  }, [isLoggedIn, logbookId, logbookKey, token, loading, accepting, handleAccept])

  const handleLogin = async () => {
    setAuthError(null)
    setLoading(true)

    try {
      const remembered = getKnownUsernames()
      const target = remembered.length === 1 ? remembered[0] : undefined
      const result = await loginUser(target)

      if (!result.verified) return

      if (result.prfSuccess) {
        setIsLoggedIn(true)
        setUsername(result.username || 'Skipper')
        return
      }

      setEncryptedPayloads(result.encryptedPayloads)
      const resolvedUser = result.username || result.encryptedPayloads?.username || ''
      if (resolvedUser) setUsername(resolvedUser)
      setShowRecoveryFallback(true)
    } catch (err: any) {
      setAuthError(err.message || (isDe ? 'Passkey-Anmeldung fehlgeschlagen.' : 'Passkey authentication failed.'))
    } finally {
      setLoading(false)
    }
  }

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recoveryInput.trim() || !encryptedPayloads) return

    const resolvedUser = (username.trim() || encryptedPayloads.username || '').trim()
    if (!resolvedUser) {
      setAuthError(isDe
        ? 'Benutzername konnte nicht ermittelt werden — bitte erneut anmelden.'
        : 'Could not determine username — please try logging in again.')
      return
    }

    setLoading(true)
    setAuthError(null)
    try {
      const success = await completeLoginWithRecovery(resolvedUser, recoveryInput.trim(), encryptedPayloads)
      if (success) {
        setShowRecoveryFallback(false)
        setIsLoggedIn(true)
        setUsername(resolvedUser)
      } else {
        setAuthError(t('auth.error_incorrect_recovery'))
      }
    } catch (err: any) {
      setAuthError(err.message || t('auth.error_decryption_failed'))
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
        setUsername(regUsername.trim())
        setRecoveryPhrase(result.recoveryPhrase)
      }
    } catch (err: any) {
      setAuthError(err.message || (isDe ? 'Registrierung fehlgeschlagen.' : 'Registration failed.'))
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmRecovery = () => {
    setRecoveryPhrase(null)
    setIsLoggedIn(true)
  }

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language.startsWith('de') ? 'en' : 'de')
  }

  if (recoveryPhrase) {
    return (
      <div className="auth-card glass">
        <div className="auth-header">
          <KeyRound className="auth-icon accent" size={48} />
          <h2>{t('auth.recovery_title')}</h2>
        </div>
        <p className="recovery-warning">{t('auth.recovery_warning')}</p>
        <div className="recovery-phrase-grid">
          {recoveryPhrase.split(' ').map((word, idx) => (
            <div key={idx} className="recovery-word">
              <span className="word-index">{idx + 1}</span>
              {word}
            </div>
          ))}
        </div>
        <div className="auth-actions mt-6">
          <button className="btn primary" onClick={handleConfirmRecovery} style={{ width: '100%' }}>
            {t('auth.confirm_recovery')}
          </button>
        </div>
      </div>
    )
  }

  if (showRecoveryFallback) {
    return (
      <div className="auth-card glass">
        <div className="auth-header">
          <KeyRound className="auth-icon accent" size={48} />
          <h2>{t('auth.enter_recovery')}</h2>
        </div>
        <p className="recovery-warning">{t('auth.recovery_fallback_warning')}</p>
        <form onSubmit={handleRecoverySubmit}>
          <textarea
            className="input-text"
            placeholder={t('auth.recovery_placeholder')}
            value={recoveryInput}
            onChange={(e) => setRecoveryInput(e.target.value)}
            rows={3}
            required
          />
          <div className="auth-actions mt-4">
            <button type="button" className="btn secondary" onClick={() => setShowRecoveryFallback(false)}>
              {isDe ? 'Zurück' : 'Back'}
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              {t('auth.decrypt_logbook')}
            </button>
          </div>
        </form>
        {authError && <div className="auth-error mt-4">{authError}</div>}
      </div>
    )
  }

  if ((loading || accepting) && !error) {
    return (
      <div className="auth-card glass">
        <div className="auth-header">
          <Ship className="auth-icon accent spin" size={48} />
          <h2>{accepting ? (isDe ? 'Beitritt...' : 'Joining...') : (isDe ? 'Einladung wird geprüft...' : 'Checking Invitation...')}</h2>
        </div>
        <p className="recovery-warning">
          {accepting
            ? (isDe ? 'Logbuch wird freigeschaltet und synchronisiert...' : 'Unlocking logbook and syncing data...')
            : (isDe ? 'Lade Verschlüsselungsschlüssel...' : 'Retrieving encryption key...')}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="auth-card glass">
        <div className="auth-header">
          <AlertTriangle className="auth-icon warn" size={48} />
          <h2>{isDe ? 'Einladungsfehler' : 'Invitation Error'}</h2>
        </div>
        <p className="recovery-warning" style={{ color: '#ef4444' }}>{error}</p>
        <div className="auth-actions mt-6">
          <button className="btn primary" onClick={onCancel} style={{ width: '100%' }}>
            {isDe ? 'Zurück zum Start' : 'Back to Dashboard'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-card glass">
      <div className="auth-header">
        <ShieldCheck className="auth-icon success" size={48} style={{ color: '#10b981' }} />
        <h2>{isDe ? 'Logbuch-Einladung' : 'Logbook Invitation'}</h2>
      </div>

      <div style={{ textAlign: 'center', margin: '20px 0', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
        <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#64748b', textTransform: 'uppercase' }}>
          {isDe ? 'Einladung von' : 'INVITED BY'}
        </p>
        <p style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#f1f5f9' }}>
          Skipper {ownerUsername}
        </p>
        <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#64748b', textTransform: 'uppercase' }}>
          {isDe ? 'Schiff / Logbuch' : 'VESSEL / LOGBOOK'}
        </p>
        <p style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#fbbf24' }}>
          {decryptedTitle}
        </p>
      </div>

      {isLoggedIn ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', lineHeight: '145%' }}>
            {isDe
              ? `Angemeldet als ${username}. Beitritt wird vorbereitet...`
              : `Signed in as ${username}. Preparing to join...`}
          </p>
          <button className="btn primary" onClick={handleAccept} disabled={accepting} style={{ width: '100%' }}>
            {accepting ? (isDe ? 'Beitritt...' : 'Joining...') : (isDe ? 'Erneut beitreten' : 'Join again')}
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div style={{ width: '100%' }}>
          {loginMode === 'options' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '13.5px', color: '#94a3b8', textAlign: 'center', lineHeight: '145%' }}>
                {isDe
                  ? 'Melden Sie sich an oder registrieren Sie ein Konto, um dem Logbuch beizutreten.'
                  : 'Sign in or register an account to join this logbook.'}
              </p>

              <button className="btn primary" onClick={handleLogin} disabled={loading} style={{ width: '100%', padding: '14px' }}>
                <LogIn size={16} />
                {isDe ? 'Mit Passkey anmelden' : 'Log In with Passkey'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                <span style={{ padding: '0 10px', fontSize: '12px', color: '#64748b' }}>
                  {isDe ? 'ODER NEU REGISTRIEREN' : 'OR SIGN UP'}
                </span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
              </div>

              <button className="btn secondary" onClick={() => setLoginMode('register')} style={{ width: '100%' }}>
                <UserPlus size={16} />
                {isDe ? 'Neues Crew-Konto erstellen' : 'Register New Crew Account'}
              </button>
            </div>
          )}

          {loginMode === 'register' && (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group">
                <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
                  {isDe ? 'Benutzername' : 'Username'}
                </label>
                <input
                  type="text"
                  className="input-text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  required
                />
              </div>
              <div className="auth-actions">
                <button type="button" className="btn secondary" onClick={() => setLoginMode('options')}>
                  {isDe ? 'Zurück' : 'Back'}
                </button>
                <button type="submit" className="btn primary" disabled={!regUsername.trim() || loading}>
                  {isDe ? 'Passkey erstellen' : 'Create Passkey'}
                </button>
              </div>
            </form>
          )}

          {authError && <div className="auth-error mt-4" style={{ fontSize: '13px' }}>{authError}</div>}
        </div>
      )}

      <div className="auth-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginTop: '24px' }}>
        <button className="btn-icon-text" onClick={toggleLanguage}>
          <Languages size={18} />
          {isDe ? 'English' : 'Deutsch'}
        </button>
      </div>
    </div>
  )
}
