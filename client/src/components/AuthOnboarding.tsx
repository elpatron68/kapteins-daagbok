import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { 
  registerUser, 
  loginUser, 
  completeLoginWithRecovery, 
  setLocalPin, 
  hasLocalPin, 
  decryptWithLocalPin, 
  getActiveMasterKey,
  getKnownUsernames,
  forgetUsername
} from '../services/auth.js'
import { KeyRound, ShieldAlert, Languages, HelpCircle, UserRound, X } from 'lucide-react'
import RegistrationDisclaimer from './RegistrationDisclaimer.tsx'

interface AuthOnboardingProps {
  onAuthenticated: () => void
  onOpenDemo?: () => void
}

export default function AuthOnboarding({ onAuthenticated, onOpenDemo }: AuthOnboardingProps) {
  const { t, i18n } = useTranslation()
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Accounts that have already authenticated on this device. Used to offer a
  // one-click login without re-typing the username.
  const [knownUsers, setKnownUsers] = useState<string[]>(() => getKnownUsernames())
  
  // Registration recovery phrase flow
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Login recovery phrase fallback flow
  const [showRecoveryFallback, setShowRecoveryFallback] = useState(false)
  const [recoveryInput, setRecoveryInput] = useState('')
  const [encryptedPayloads, setEncryptedPayloads] = useState<any>(null)

  // PIN setup flow state
  const [showPinSetup, setShowPinSetup] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinSetupUsername, setPinSetupUsername] = useState('')

  // PIN login fallback flow state
  const [showPinLogin, setShowPinLogin] = useState(false)
  const [pinLoginInput, setPinLoginInput] = useState('')

  const [isNewRegistration, setIsNewRegistration] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)

  const finishAuth = () => {
    if (isNewRegistration) {
      setShowDisclaimer(true)
      return
    }
    onAuthenticated()
  }

  const handleDisclaimerAccept = () => {
    setIsNewRegistration(false)
    setShowDisclaimer(false)
    onAuthenticated()
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return

    setLoading(true)
    setError(null)
    try {
      const result = await registerUser(username.trim())
      if (result.verified) {
        setIsNewRegistration(true)
        setRecoveryPhrase(result.recoveryPhrase)
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (explicitUsername?: string) => {
    setLoading(true)
    setError(null)
    try {
      // Pass the username when available so the server returns a concrete
      // allowCredentials list. A usernameless (discoverable) assertion fails on
      // some platform authenticators (e.g. Windows Hello); giving the explicit
      // credential id makes those work. Priority: an explicitly clicked account
      // > a typed name > the single remembered account > usernameless discovery.
      const remembered = getKnownUsernames()
      const target =
        explicitUsername ||
        username.trim() ||
        (remembered.length === 1 ? remembered[0] : undefined)
      const result = await loginUser(target)
      if (result.verified) {
        if (result.prfSuccess) {
          // Biometric E2E decryption succeeded
          onAuthenticated()
        } else {
          // Biometrics succeeded but PRF key wasn't supported/available, fall back to PIN or recovery phrase
          setEncryptedPayloads(result.encryptedPayloads)
          const resolvedUser = result.username || result.encryptedPayloads?.username || ''
          if (resolvedUser) {
            setUsername(resolvedUser)
          }
          if (resolvedUser && hasLocalPin(resolvedUser)) {
            setShowPinLogin(true)
          } else {
            setShowRecoveryFallback(true)
          }
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
        // Offer PIN setup to prevent future recovery phrase entries on this device
        setPinSetupUsername(resolvedUser)
        setShowRecoveryFallback(false)
        setShowPinSetup(true)
      } else {
        setError(t('auth.error_incorrect_recovery'))
      }
    } catch (err: any) {
      setError(t('auth.error_decryption_failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmRecovery = () => {
    setPinSetupUsername(username.trim() || encryptedPayloads?.username || '')
    // Clear the recovery phrase so the PIN-setup screen can render: the
    // `recoveryPhrase` branch is evaluated before `showPinSetup`, so leaving it
    // set would keep the user stuck on the recovery-phrase screen.
    setRecoveryPhrase(null)
    setShowPinSetup(true)
  }

  const handlePinSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pinInput.trim() || pinInput.length < 4) {
      setError(t('auth.pin_length_error', 'PIN must be at least 4 digits'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const activeKey = getActiveMasterKey()
      if (activeKey) {
        await setLocalPin(pinInput.trim(), pinSetupUsername, activeKey)
        finishAuth()
      } else {
        setError('No active master key found')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save PIN')
    } finally {
      setLoading(false)
    }
  }

  const handlePinLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pinLoginInput.trim()) return

    setLoading(true)
    setError(null)
    try {
      const resolvedUser = username.trim() || encryptedPayloads?.username
      const key = await decryptWithLocalPin(pinLoginInput.trim(), resolvedUser)
      if (key) {
        onAuthenticated()
      } else {
        setError(t('auth.error_incorrect_pin'))
      }
    } catch (err: any) {
      setError(t('auth.error_incorrect_pin'))
    } finally {
      setLoading(false)
    }
  }

  const handleForgetUser = (name: string) => {
    forgetUsername(name)
    setKnownUsers(getKnownUsernames())
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

  // Render 0: Registration disclaimer (new accounts only, before app onboarding)
  if (showDisclaimer) {
    return <RegistrationDisclaimer variant="accept" onDismiss={handleDisclaimerAccept} />
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
          <button className="btn primary" onClick={handleConfirmRecovery}>
            {t('auth.confirm_recovery')}
          </button>
        </div>
      </div>
    )
  }

  // Render 4: PIN setup screen
  if (showPinSetup) {
    return (
      <div className="auth-card glass">
        <div className="auth-header">
          <KeyRound className="auth-icon accent" size={48} />
          <h2>{t('auth.setup_pin_title')}</h2>
        </div>
        <p className="recovery-warning">
          {t('auth.setup_pin_warning')}
        </p>

        <form onSubmit={handlePinSetupSubmit} className="auth-form">
          <div className="input-group">
            <label className="input-label" style={{ display: 'block', marginBottom: '8px', color: '#94a3b8' }}>
              {t('auth.pin_label')}
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              className="input-text"
              placeholder={t('auth.pin_placeholder')}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              disabled={loading}
              required
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box' }}
            />
          </div>

          {error && <div className="auth-error" style={{ color: '#ef4444', fontSize: '14px', marginTop: '8px' }}>{error}</div>}

          <div className="auth-actions" style={{ marginTop: '20px' }}>
            <button
              type="button"
              className="btn secondary"
              onClick={finishAuth}
              disabled={loading}
            >
              {t('auth.skip_pin')}
            </button>
            <button type="submit" className="btn primary" disabled={loading || pinInput.length < 4}>
              {loading ? t('auth.processing') : t('auth.save_pin')}
            </button>
          </div>
        </form>
      </div>
    )
  }

  // Render 5: PIN login screen
  if (showPinLogin) {
    return (
      <div className="auth-card glass">
        <div className="auth-header">
          <KeyRound className="auth-icon accent" size={48} />
          <h2>{t('auth.enter_pin_title')}</h2>
        </div>
        <p className="recovery-warning">
          {t('auth.enter_pin_warning')}
        </p>

        <form onSubmit={handlePinLoginSubmit} className="auth-form">
          <div className="input-group">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              className="input-text"
              placeholder={t('auth.enter_pin_placeholder')}
              value={pinLoginInput}
              onChange={(e) => setPinLoginInput(e.target.value.replace(/\D/g, ''))}
              disabled={loading}
              required
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box' }}
            />
          </div>

          {error && <div className="auth-error" style={{ color: '#ef4444', fontSize: '14px', marginTop: '8px' }}>{error}</div>}

          <div className="auth-actions" style={{ flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
            <button type="submit" className="btn primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? t('auth.decrypting') : t('auth.decrypt_with_pin')}
            </button>
            
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setShowPinLogin(false)
                setShowRecoveryFallback(true)
                setError(null)
              }}
              disabled={loading}
              style={{ width: '100%' }}
            >
              {t('auth.use_recovery_instead')}
            </button>
          </div>
        </form>
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
        <img src="/logo.png" alt="Kapteins Daagbok" className="auth-logo-img" />
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
          {loading
            ? t('auth.processing')
            : knownUsers.length === 1
              ? t('auth.login_as', { name: knownUsers[0] })
              : t('auth.login')}
        </button>

        {/* Single remembered account: the main button already logs in as them,
            so just offer a way to forget it (e.g. on a shared device). */}
        {knownUsers.length === 1 && (
          <button
            type="button"
            onClick={() => handleForgetUser(knownUsers[0])}
            disabled={loading}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '13px',
              textDecoration: 'underline',
              alignSelf: 'center',
              padding: 0
            }}
          >
            {t('auth.not_user', { name: knownUsers[0] })}
          </button>
        )}

        {/* Quick-login chips for accounts remembered on this device. Each one
            logs in with its concrete credential, so no username typing needed. */}
        {knownUsers.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>
              {t('auth.quick_login')}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', width: '100%' }}>
              {knownUsers.map((name) => (
                <div
                  key={name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '999px',
                    padding: '4px 4px 4px 12px'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleLogin(name)}
                    disabled={loading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'transparent',
                      border: 'none',
                      color: '#e2e8f0',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: 0
                    }}
                  >
                    <UserRound size={16} />
                    {name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleForgetUser(name)}
                    disabled={loading}
                    title={t('auth.forget_account')}
                    aria-label={t('auth.forget_account')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '22px',
                      height: '22px',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      borderRadius: '50%'
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Separator */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '10px 0', width: '100%' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
          <span style={{ padding: '0 10px', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>{t('auth.or_register')}</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
        </div>

        <button
          type="button"
          className="btn secondary"
          onClick={() => onOpenDemo?.()}
          disabled={loading}
          style={{ width: '100%' }}
        >
          {t('auth.explore_demo')}
        </button>

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
