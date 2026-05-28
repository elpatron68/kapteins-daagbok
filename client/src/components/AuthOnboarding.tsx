import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { registerUser, loginUser, completeLoginWithRecovery } from '../services/auth.js'
import { KeyRound, ShieldAlert, Languages, HelpCircle } from 'lucide-react'

interface AuthOnboardingProps {
  onAuthenticated: () => void
}

export default function AuthOnboarding({ onAuthenticated }: AuthOnboardingProps) {
  const { t, i18n } = useTranslation()
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Registration recovery phrase flow
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Login recovery phrase fallback flow
  const [showRecoveryFallback, setShowRecoveryFallback] = useState(false)
  const [recoveryInput, setRecoveryInput] = useState('')
  const [encryptedPayloads, setEncryptedPayloads] = useState<any>(null)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return

    setLoading(true)
    setError(null)
    try {
      const result = await registerUser(username.trim())
      if (result.verified) {
        setRecoveryPhrase(result.recoveryPhrase)
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    setLoading(true)
    setError(null)
    try {
      const result = await loginUser()
      if (result.verified) {
        if (result.prfSuccess) {
          // Biometric E2E decryption succeeded
          onAuthenticated()
        } else {
          // Biometrics succeeded but PRF key wasn't supported/available, fall back to recovery phrase
          setEncryptedPayloads(result.encryptedPayloads)
          if (result.username) {
            setUsername(result.username)
          }
          setShowRecoveryFallback(true)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recoveryInput.trim() || !encryptedPayloads) return

    setLoading(true)
    setError(null)
    try {
      const resolvedUser = username.trim() || encryptedPayloads.username
      const success = await completeLoginWithRecovery(resolvedUser, recoveryInput.trim(), encryptedPayloads)
      if (success) {
        onAuthenticated()
      } else {
        setError(t('auth.error_incorrect_recovery'))
      }
    } catch (err: any) {
      setError(t('auth.error_decryption_failed'))
    } finally {
      setLoading(false)
    }
  }

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('de') ? 'en' : 'de'
    i18n.changeLanguage(nextLang)
  }

  const copyToClipboard = () => {
    if (recoveryPhrase) {
      navigator.clipboard.writeText(recoveryPhrase)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Render 1: Display new registration recovery phrase
  if (recoveryPhrase) {
    return (
      <div className="auth-card glass">
        <div className="auth-header">
          <ShieldAlert className="auth-icon warn" size={48} />
          <h2>{t('auth.recovery_title')}</h2>
        </div>
        <p className="recovery-warning">{t('auth.recovery_warning')}</p>
        
        <div className="phrase-grid">
          {recoveryPhrase.split(" ").map((word, idx) => (
            <div key={idx} className="phrase-word">
              <span className="word-num">{idx + 1}</span> {word}
            </div>
          ))}
        </div>

        <div className="auth-actions">
          <button className="btn secondary" onClick={copyToClipboard}>
            {copied ? t('auth.copied') : t('auth.copy_phrase')}
          </button>
          <button className="btn primary" onClick={onAuthenticated}>
            {t('auth.confirm_recovery')}
          </button>
        </div>
      </div>
    )
  }

  // Render 2: Ask for recovery phrase fallback if biometric PRF fails
  if (showRecoveryFallback) {
    return (
      <div className="auth-card glass">
        <div className="auth-header">
          <KeyRound className="auth-icon accent" size={48} />
          <h2>{t('auth.enter_recovery')}</h2>
        </div>
        <p className="recovery-warning">
          {t('auth.recovery_fallback_warning')}
        </p>

        <form onSubmit={handleRecoverySubmit} className="auth-form">
          <textarea
            className="input-textarea"
            placeholder={t('auth.recovery_placeholder')}
            value={recoveryInput}
            onChange={(e) => setRecoveryInput(e.target.value)}
            disabled={loading}
            rows={3}
            required
          />

          {error && <div className="auth-error">{error}</div>}

          <div className="auth-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowRecoveryFallback(false)}
              disabled={loading}
            >
              {t('auth.back')}
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? t('auth.decrypting') : t('auth.decrypt_logbook')}
            </button>
          </div>
        </form>
      </div>
    )
  }

  // Render 3: Standard Login / Registration options form
  return (
    <div className="auth-card glass">
      <div className="auth-brand">
        <img src="/logo.png" alt="Kapteins Daagbox" className="auth-logo-img" />
        <h1>{t('app.name')}</h1>
        <p className="tagline">{t('auth.tagline')}</p>
      </div>

      <div className="auth-form" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Prominent Login button */}
        <button
          type="button"
          className="btn primary"
          onClick={() => handleLogin()}
          disabled={loading}
          style={{ width: '100%', padding: '16px' }}
        >
          {loading ? t('auth.processing') : t('auth.login')}
        </button>

        {/* Separator */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '10px 0', width: '100%' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
          <span style={{ padding: '0 10px', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>{t('auth.or_register')}</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
        </div>

        {/* Registration form */}
        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          <div className="input-group">
            <input
              type="text"
              className="input-text"
              placeholder={t('auth.username_placeholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <button
            type="submit"
            className="btn secondary"
            disabled={loading || !username.trim()}
            style={{ width: '100%' }}
          >
            {t('auth.register')}
          </button>
        </form>

        {error && <div className="auth-error">{error}</div>}
      </div>

      <div className="auth-footer">
        <button className="btn-icon-text" onClick={toggleLanguage}>
          <Languages size={18} />
          {i18n.language.startsWith('de') ? 'English' : 'Deutsch'}
        </button>
        <a href="#help" className="btn-icon-text link-sec">
          <HelpCircle size={18} />
          {t('auth.help')}
        </a>
      </div>
    </div>
  )
}
