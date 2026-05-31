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
import { parseCollaborationRole } from '../services/logbook.js'
import { syncLogbook } from '../services/sync.js'
import { db } from '../services/db.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import { apiJson } from '../services/api.js'

interface InvitationAcceptanceProps {
  onAccepted: (logbookId: string, title: string) => void
  onCancel: () => void
}

type LocalizedError =
  | { source: 'i18n'; key: string }
  | { source: 'raw'; text: string }

const resolveLocalizedError = (
  error: LocalizedError | null,
  t: (key: string) => string
): string | null => {
  if (!error) return null
  return error.source === 'i18n' ? t(error.key) : error.text
}

const localizedErrorFromMessage = (
  message: string | undefined,
  fallbackKey: string
): LocalizedError => {
  return message ? { source: 'raw', text: message } : { source: 'i18n', key: fallbackKey }
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
  const [error, setError] = useState<LocalizedError | null>(null)

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
  const [authError, setAuthError] = useState<LocalizedError | null>(null)

  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null)
  const [showRecoveryFallback, setShowRecoveryFallback] = useState(false)
  const [recoveryInput, setRecoveryInput] = useState('')
  const [encryptedPayloads, setEncryptedPayloads] = useState<any>(null)

  const autoAcceptStarted = useRef(false)

  const errorText = resolveLocalizedError(error, t)
  const authErrorText = resolveLocalizedError(authError, t)

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
        setError({ source: 'i18n', key: 'invitation.error_invalid_key' })
      }
    } else {
      setError({ source: 'i18n', key: 'invitation.error_missing_key' })
    }

    const rand = Math.floor(1000 + Math.random() * 9000)
    setRegUsername(`CrewSkipper_${rand}`)
  }, [])

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
        setError({ source: 'i18n', key: 'invitation.error_expired' })
        return
      }

      if (!res.ok) {
        setError({ source: 'i18n', key: 'invitation.error_invalid_token' })
        return
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
      setError(localizedErrorFromMessage(err.message, 'invitation.error_load_failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = useCallback(async () => {
    const masterKey = getActiveMasterKey()
    const activeUserId = localStorage.getItem('active_userid')
    if (!masterKey || !activeUserId) {
      autoAcceptStarted.current = false
      setError({ source: 'i18n', key: 'invitation.error_incomplete_session' })
      setIsLoggedIn(false)
      return
    }
    if (!logbookKey || !logbookId) {
      autoAcceptStarted.current = false
      return
    }

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

      const acceptResult = await apiJson<{ role: string; logbookId: string }>('/api/collaboration/accept', {
        method: 'POST',
        body: JSON.stringify({
          token,
          encryptedLogbookKey: encrypted.ciphertext,
          iv: encrypted.iv,
          tag: encrypted.tag
        })
      })
      const collaborationRole = parseCollaborationRole(acceptResult.role, 'invitation accept')

      await saveLogbookKey(logbookId, logbookKey)

      if (rawEncryptedTitle) {
        await db.logbooks.put({
          id: logbookId,
          encryptedTitle: rawEncryptedTitle,
          updatedAt: new Date().toISOString(),
          isSynced: 1,
          isShared: 1,
          collaborationRole
        })
      }

      await syncLogbook(logbookId)
      trackPlausibleEvent(PlausibleEvents.INVITE_ACCEPTED)
      onAccepted(logbookId, decryptedTitle)
    } catch (err: any) {
      console.error('Accepting invitation failed:', err)
      setError(localizedErrorFromMessage(err.message, 'invitation.error_accept_failed'))
      autoAcceptStarted.current = false
    } finally {
      setAccepting(false)
    }
  }, [logbookId, logbookKey, token, rawEncryptedTitle, decryptedTitle, onAccepted])

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
      setAuthError(localizedErrorFromMessage(err.message, 'invitation.error_login_failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recoveryInput.trim() || !encryptedPayloads) return

    const resolvedUser = (username.trim() || encryptedPayloads.username || '').trim()
    if (!resolvedUser) {
      setAuthError({ source: 'i18n', key: 'invitation.error_username_missing' })
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
        setAuthError({ source: 'i18n', key: 'auth.error_incorrect_recovery' })
      }
    } catch (err: any) {
      setAuthError(localizedErrorFromMessage(err.message, 'auth.error_decryption_failed'))
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
      setAuthError(localizedErrorFromMessage(err.message, 'invitation.error_register_failed'))
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
        <form onSubmit={handleRecoverySubmit} autoComplete="on">
          {(username.trim() || encryptedPayloads?.username) && (
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username.trim() || encryptedPayloads?.username || ''}
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
            />
          )}
          <div className="input-group">
            <label htmlFor="invitation-recovery-key" className="input-label" style={{ display: 'block', marginBottom: '8px', color: '#94a3b8' }}>
              {t('auth.enter_recovery')}
            </label>
            <input
              id="invitation-recovery-key"
              name="recovery-key"
              type="password"
              className="input-text"
              placeholder={t('auth.recovery_placeholder')}
              value={recoveryInput}
              onChange={(e) => setRecoveryInput(e.target.value)}
              required
              autoComplete="current-password"
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box' }}
            />
          </div>
          <div className="auth-actions mt-4">
            <button type="button" className="btn secondary" onClick={() => setShowRecoveryFallback(false)}>
              {t('auth.back')}
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              {t('auth.decrypt_logbook')}
            </button>
          </div>
        </form>
        {authErrorText && <div className="auth-error mt-4">{authErrorText}</div>}
      </div>
    )
  }

  if ((loading || accepting) && !error) {
    return (
      <div className="auth-card glass">
        <div className="auth-header">
          <Ship className="auth-icon accent spin" size={48} />
          <h2>{accepting ? t('invitation.loading_joining') : t('invitation.loading_checking')}</h2>
        </div>
        <p className="recovery-warning">
          {accepting ? t('invitation.loading_unlocking') : t('invitation.loading_retrieving_key')}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="auth-card glass">
        <div className="auth-header">
          <AlertTriangle className="auth-icon warn" size={48} />
          <h2>{t('invitation.error_title')}</h2>
        </div>
        <p className="recovery-warning" style={{ color: '#ef4444' }}>{errorText}</p>
        <div className="auth-actions mt-6">
          <button className="btn primary" onClick={onCancel} style={{ width: '100%' }}>
            {t('invitation.back_to_start')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-card glass">
      <div className="auth-header">
        <ShieldCheck className="auth-icon success" size={48} style={{ color: '#10b981' }} />
        <h2>{t('invitation.title')}</h2>
      </div>

      <div style={{ textAlign: 'center', margin: '20px 0', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
        <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#64748b', textTransform: 'uppercase' }}>
          {t('invitation.invited_by')}
        </p>
        <p style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#f1f5f9' }}>
          Skipper {ownerUsername}
        </p>
        <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#64748b', textTransform: 'uppercase' }}>
          {t('invitation.vessel_logbook')}
        </p>
        <p style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#fbbf24' }}>
          {decryptedTitle}
        </p>
      </div>

      {isLoggedIn ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', lineHeight: '145%' }}>
            {t('invitation.signed_in_preparing', { username })}
          </p>
          <button className="btn primary" onClick={handleAccept} disabled={accepting} style={{ width: '100%' }}>
            {accepting ? t('invitation.loading_joining') : t('invitation.join_again')}
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div style={{ width: '100%' }}>
          {loginMode === 'options' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '13.5px', color: '#94a3b8', textAlign: 'center', lineHeight: '145%' }}>
                {t('invitation.login_or_register_hint')}
              </p>

              <button className="btn primary" onClick={handleLogin} disabled={loading} style={{ width: '100%', padding: '14px' }}>
                <LogIn size={16} />
                {t('auth.login')}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                <span style={{ padding: '0 10px', fontSize: '12px', color: '#64748b' }}>
                  {t('invitation.or_sign_up')}
                </span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
              </div>

              <button className="btn secondary" onClick={() => setLoginMode('register')} style={{ width: '100%' }}>
                <UserPlus size={16} />
                {t('invitation.register_crew_account')}
              </button>
            </div>
          )}

          {loginMode === 'register' && (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group">
                <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
                  {t('invitation.username_label')}
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
                  {t('auth.back')}
                </button>
                <button type="submit" className="btn primary" disabled={!regUsername.trim() || loading}>
                  {t('invitation.create_passkey')}
                </button>
              </div>
            </form>
          )}

          {authErrorText && <div className="auth-error mt-4" style={{ fontSize: '13px' }}>{authErrorText}</div>}
        </div>
      )}

      <div className="auth-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginTop: '24px' }}>
        <button className="btn-icon-text" onClick={toggleLanguage}>
          <Languages size={18} />
          {i18n.language.startsWith('de') ? t('invitation.switch_language_en') : t('invitation.switch_language_de')}
        </button>
      </div>
    </div>
  )
}
