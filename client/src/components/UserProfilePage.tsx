import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncIndicator } from '../hooks/useSyncIndicator.js'
import {
  User,
  ChevronLeft,
  LogOut,
  KeyRound,
  Copy,
  Check,
  Plus,
  Trash2,
  BookOpen,
  Anchor,
  Gauge,
  Sailboat,
  Timer,
  Share2,
  Calendar,
  Lock,
  BarChart2,
  Shield,
  Smartphone,
  RefreshCw,
  Wifi,
  WifiOff,
  CircleCheck,
  CircleAlert
} from 'lucide-react'
import AccountDangerZone from './AccountDangerZone.tsx'
import UserProfilePreferences from './UserProfilePreferences.tsx'
import BetaBadge from './BetaBadge.tsx'
import { useDialog } from './ModalDialog.tsx'
import {
  addPasskey,
  fetchUserProfile,
  forgetUsername,
  getActiveMasterKey,
  getKnownUsernames,
  hasLocalPin,
  removeLocalPin,
  removePasskey,
  renamePasskey,
  rotateRecoveryPhrase,
  setLocalPin,
  type UserProfile
} from '../services/auth.js'
import {
  formatHours,
  formatNm,
  loadAccountStats,
  type AccountStatsSummary
} from '../services/statsAggregation.js'
import { db } from '../services/db.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'

interface UserProfilePageProps {
  onBack: () => void
  onLogout: () => void
}

function formatAccountAge(createdAt: string, locale: string): string {
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return createdAt
  return created.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function KpiCard({
  icon,
  label,
  value,
  unit
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit?: string
}) {
  return (
    <div className="stats-kpi-card glass">
      <div className="stats-kpi-icon">{icon}</div>
      <div className="stats-kpi-body">
        <span className="stats-kpi-label">{label}</span>
        <span className="stats-kpi-value">
          {value}
          {unit ? <span className="stats-kpi-unit">{unit}</span> : null}
        </span>
      </div>
    </div>
  )
}

function SecurityCheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`profile-security-item ${ok ? 'profile-security-item--ok' : 'profile-security-item--warn'}`}>
      {ok ? <CircleCheck size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
      <span>{label}</span>
    </li>
  )
}

export default function UserProfilePage({ onBack, onLogout }: UserProfilePageProps) {
  const { t, i18n } = useTranslation()
  const { showConfirm, showAlert } = useDialog()
  const username = localStorage.getItem('active_username') || 'Skipper'

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [accountStats, setAccountStats] = useState<AccountStatsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedUserId, setCopiedUserId] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [pinBusy, setPinBusy] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinActive, setPinActive] = useState(() => hasLocalPin(username))
  const [newPasskeyLabel, setNewPasskeyLabel] = useState('')
  const [passkeyLabels, setPasskeyLabels] = useState<Record<string, string>>({})
  const [online, setOnline] = useState(navigator.onLine)
  const [isKnownDevice, setIsKnownDevice] = useState(() =>
    getKnownUsernames().some((u) => u.toLowerCase() === username.toLowerCase())
  )
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [pendingRecoveryPhrase, setPendingRecoveryPhrase] = useState<string | null>(null)
  const [recoveryCopied, setRecoveryCopied] = useState(false)

  const {
    pendingCount: pendingSyncCount,
    showSpinner,
    showPendingWarning,
    connStatusClassName
  } = useSyncIndicator()

  const sharedLogbookCount = useLiveQuery(
    () => db.logbooks.filter((lb) => lb.isShared === 1).count(),
    []
  ) ?? 0

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const profileData = await fetchUserProfile()
      setProfile(profileData)

      try {
        const stats = await loadAccountStats(false)
        setAccountStats(stats)
      } catch (statsErr) {
        console.error('Failed to load account stats for profile:', statsErr)
        setAccountStats(null)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('profile.load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    trackPlausibleEvent(PlausibleEvents.PROFILE_OPENED)
  }, [])

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!profile) return
    const labels: Record<string, string> = {}
    for (const cred of profile.credentials) {
      labels[cred.id] = cred.label ?? ''
    }
    setPasskeyLabels(labels)
  }, [profile])

  const statsTotals = accountStats?.totals
  const logbookCount =
    accountStats?.logbooks.length ?? profile?.serverMeta.ownedLogbookCount ?? 0

  const accountAgeLabel = useMemo(() => {
    if (!profile?.createdAt) return '—'
    return formatAccountAge(profile.createdAt, i18n.language)
  }, [profile?.createdAt, i18n.language])

  const handleCopyUserId = async () => {
    if (!profile?.userId) return
    try {
      await navigator.clipboard.writeText(profile.userId)
      setCopiedUserId(true)
      window.setTimeout(() => setCopiedUserId(false), 2000)
    } catch {
      showAlert(t('profile.copy_failed'))
    }
  }

  const handleAddPasskey = async () => {
    setPasskeyBusy(true)
    setError(null)
    try {
      const hadLabel = Boolean(newPasskeyLabel.trim())
      await addPasskey(newPasskeyLabel)
      setNewPasskeyLabel('')
      await loadData()
      trackPlausibleEvent(PlausibleEvents.PASSKEY_ADDED, { labeled: hadLabel })
      showAlert(t('profile.add_passkey_success'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('profile.add_passkey_failed'))
    } finally {
      setPasskeyBusy(false)
    }
  }

  const handleRenamePasskey = async (credentialId: string) => {
    setPasskeyBusy(true)
    setError(null)
    try {
      await renamePasskey(credentialId, passkeyLabels[credentialId] ?? '')
      await loadData()
      trackPlausibleEvent(PlausibleEvents.PASSKEY_RENAMED)
      showAlert(t('profile.passkey_rename_success'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('profile.passkey_rename_failed'))
    } finally {
      setPasskeyBusy(false)
    }
  }

  const handleForgetDevice = async () => {
    const confirmed = await showConfirm(
      t('profile.device_forget_confirm_desc'),
      t('profile.device_forget_confirm_title'),
      t('profile.device_forget_confirm_yes'),
      t('profile.device_forget_confirm_no')
    )
    if (!confirmed) return

    forgetUsername(username)
    setIsKnownDevice(false)
    trackPlausibleEvent(PlausibleEvents.DEVICE_FORGOTTEN)
  }

  const handleRemovePasskey = async (credentialId: string) => {
    if (profile && profile.credentials.length <= 1) {
      trackPlausibleEvent(PlausibleEvents.LAST_PASSKEY_REMOVE_HINTED)
      await showAlert(
        t('profile.remove_passkey_last_desc'),
        t('profile.remove_passkey_last_title')
      )
      return
    }

    const confirmed = await showConfirm(
      t('profile.remove_passkey_confirm_desc'),
      t('profile.remove_passkey_confirm_title'),
      t('profile.remove_passkey_confirm_yes'),
      t('profile.remove_passkey_confirm_no')
    )
    if (!confirmed) return

    setPasskeyBusy(true)
    setError(null)
    try {
      await removePasskey(credentialId)
      await loadData()
      trackPlausibleEvent(PlausibleEvents.PASSKEY_REMOVED)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('profile.remove_passkey_failed'))
    } finally {
      setPasskeyBusy(false)
    }
  }

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pinInput.length < 4) {
      setError(t('profile.pin_length_error'))
      return
    }
    if (pinInput !== pinConfirm) {
      setError(t('profile.pin_mismatch'))
      return
    }

    const masterKey = getActiveMasterKey()
    if (!masterKey) {
      setError(t('profile.pin_no_session'))
      return
    }

    const pinAction = pinActive ? 'change' : 'set'

    setPinBusy(true)
    setError(null)
    try {
      await setLocalPin(pinInput.trim(), username, masterKey)
      setPinActive(true)
      setPinInput('')
      setPinConfirm('')
      trackPlausibleEvent(PlausibleEvents.LOCAL_PIN_SET, { action: pinAction })
      showAlert(t('profile.pin_saved'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('profile.pin_save_failed'))
    } finally {
      setPinBusy(false)
    }
  }

  const handleRemovePin = async () => {
    const confirmed = await showConfirm(
      t('profile.remove_pin_confirm_desc'),
      t('profile.remove_pin_confirm_title'),
      t('profile.remove_pin_confirm_yes'),
      t('profile.remove_pin_confirm_no')
    )
    if (!confirmed) return

    removeLocalPin(username)
    setPinActive(false)
    setPinInput('')
    setPinConfirm('')
    trackPlausibleEvent(PlausibleEvents.LOCAL_PIN_REMOVED)
  }

  const handleRotateRecovery = async () => {
    const confirmed = await showConfirm(
      t('profile.recovery_rotate_confirm_desc'),
      t('profile.recovery_rotate_confirm_title'),
      t('profile.recovery_rotate_confirm_yes'),
      t('profile.recovery_rotate_confirm_no')
    )
    if (!confirmed) return

    if (!getActiveMasterKey()) {
      setError(t('profile.recovery_rotate_no_session'))
      return
    }

    setRecoveryBusy(true)
    setError(null)
    try {
      const phrase = await rotateRecoveryPhrase()
      setPendingRecoveryPhrase(phrase)
      trackPlausibleEvent(PlausibleEvents.RECOVERY_ROTATED)
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'NO_ACTIVE_MASTER_KEY') {
        setError(t('profile.recovery_rotate_no_session'))
      } else {
        setError(err instanceof Error ? err.message : t('profile.recovery_rotate_failed'))
      }
    } finally {
      setRecoveryBusy(false)
    }
  }

  const handleCopyRecoveryPhrase = async () => {
    if (!pendingRecoveryPhrase) return
    try {
      await navigator.clipboard.writeText(pendingRecoveryPhrase)
      setRecoveryCopied(true)
      window.setTimeout(() => setRecoveryCopied(false), 2000)
    } catch {
      showAlert(t('profile.copy_failed'))
    }
  }

  const handleConfirmRecoverySaved = () => {
    setPendingRecoveryPhrase(null)
    setRecoveryCopied(false)
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header dashboard-header--profile">
        <div className="header-brand profile-header-brand">
          <button className="btn-back profile-back-btn" onClick={onBack} title={t('profile.back')}>
            <ChevronLeft size={16} />
            <span>{t('profile.back')}</span>
          </button>
          <div>
            <div className="header-brand-title-row">
              <h1>{t('profile.title')}</h1>
              <BetaBadge />
            </div>
            <p className="subtitle">{t('profile.subtitle', { name: username })}</p>
          </div>
        </div>

        <div className="header-actions">
          <button className="btn-icon logout" onClick={onLogout} title={t('dashboard.logout')}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="profile-main">
        {error && <div className="auth-error mb-4">{error}</div>}

        {loading ? (
          <div className="tab-placeholder">
            <User className="header-logo spin" size={48} />
            <p>{t('profile.loading')}</p>
          </div>
        ) : pendingRecoveryPhrase ? (
          <section className="form-card profile-recovery-card">
            <div className="form-header">
              <KeyRound size={24} className="form-icon" />
              <h2>{t('auth.recovery_title')}</h2>
            </div>
            <p className="profile-recovery-warning">{t('profile.recovery_rotate_new_warning')}</p>
            <div className="phrase-grid">
              {pendingRecoveryPhrase.split(' ').map((word, idx) => (
                <div key={idx} className="phrase-word">
                  <span className="word-num">{idx + 1}</span>
                  {word}
                </div>
              ))}
            </div>
            <div className="form-actions profile-recovery-actions">
              <button type="button" className="btn secondary" onClick={() => void handleCopyRecoveryPhrase()}>
                {recoveryCopied ? t('auth.copied') : t('auth.copy_phrase')}
              </button>
              <button type="button" className="btn primary" onClick={handleConfirmRecoverySaved}>
                {t('auth.confirm_recovery')}
              </button>
            </div>
          </section>
        ) : profile ? (
          <>
            <section className="form-card">
              <div className="form-header">
                <User size={24} className="form-icon" />
                <h2>{t('profile.identity_title')}</h2>
              </div>

              <dl className="profile-dl">
                <div className="profile-dl-row">
                  <dt>{t('profile.username')}</dt>
                  <dd>{profile.username}</dd>
                </div>
                <div className="profile-dl-row">
                  <dt>{t('profile.user_id')}</dt>
                  <dd className="profile-user-id">
                    <code>{profile.userId}</code>
                    <button
                      type="button"
                      className="btn-icon profile-copy-btn"
                      onClick={() => void handleCopyUserId()}
                      title={t('profile.copy_user_id')}
                    >
                      {copiedUserId ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </dd>
                </div>
                <div className="profile-dl-row">
                  <dt>{t('profile.account_since')}</dt>
                  <dd>{accountAgeLabel}</dd>
                </div>
                <div className="profile-dl-row">
                  <dt>{t('profile.prf_status')}</dt>
                  <dd>
                    {profile.hasPrfEncryption
                      ? t('profile.prf_active')
                      : t('profile.prf_inactive')}
                  </dd>
                </div>
              </dl>
            </section>

            <UserProfilePreferences userId={profile.userId} />

            <section className="member-editor-card glass">
              <div className="profile-section-header">
                <Shield size={20} />
                <h3>{t('profile.security_title')}</h3>
              </div>
              <p className="profile-section-desc">{t('profile.security_desc')}</p>
              <ul className="profile-security-list">
                <SecurityCheckItem
                  ok={profile.credentials.length > 0}
                  label={
                    profile.credentials.length > 0
                      ? t('profile.security_passkeys_ok')
                      : t('profile.security_passkeys_missing')
                  }
                />
                <SecurityCheckItem
                  ok={profile.hasPrfEncryption}
                  label={
                    profile.hasPrfEncryption
                      ? t('profile.security_prf_ok')
                      : t('profile.security_prf_missing')
                  }
                />
                <SecurityCheckItem
                  ok={pinActive}
                  label={pinActive ? t('profile.security_pin_ok') : t('profile.security_pin_missing')}
                />
                <SecurityCheckItem ok label={t('profile.security_recovery_ok')} />
              </ul>
              <p className="profile-section-desc profile-recovery-hint">{t('profile.security_recovery_hint')}</p>
              <div className="form-actions profile-recovery-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => void handleRotateRecovery()}
                  disabled={recoveryBusy || passkeyBusy || pinBusy}
                >
                  {recoveryBusy ? t('profile.processing') : t('profile.recovery_rotate_btn')}
                </button>
              </div>
            </section>

            <section className="member-editor-card glass">
              <div className="profile-section-header">
                <Smartphone size={20} />
                <h3>{t('profile.device_title')}</h3>
              </div>
              <p className="profile-section-desc">{t('profile.device_desc')}</p>
              <div className={`profile-device-status ${connStatusClassName(online)}`}>
                {online ? (
                  showSpinner ? (
                    <>
                      <RefreshCw size={16} className="spin" aria-hidden="true" />
                      <span>{t('sync.status_syncing')}</span>
                    </>
                  ) : showPendingWarning ? (
                    <>
                      <RefreshCw size={16} aria-hidden="true" />
                      <span>{t('profile.device_sync_pending', { count: pendingSyncCount })}</span>
                    </>
                  ) : (
                    <>
                      <Wifi size={16} aria-hidden="true" />
                      <span>{t('profile.device_sync_ok')}</span>
                    </>
                  )
                ) : (
                  <>
                    <WifiOff size={16} aria-hidden="true" />
                    <span>{t('sync.status_offline')}</span>
                  </>
                )}
              </div>
              <p className="profile-pin-status">
                {isKnownDevice ? t('profile.device_remembered') : t('profile.device_not_remembered')}
              </p>
              {isKnownDevice && (
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => void handleForgetDevice()}
                  >
                    {t('profile.device_forget_btn')}
                  </button>
                </div>
              )}
            </section>

            <section className="member-editor-card glass">
              <div className="profile-section-header">
                <Lock size={20} />
                <h3>{t('profile.pin_title')}</h3>
              </div>
              <p className="profile-section-desc">{t('auth.setup_pin_warning')}</p>
              <p className="profile-pin-status">
                {t('profile.pin_status')}:{' '}
                <strong>{pinActive ? t('profile.pin_active') : t('profile.pin_inactive')}</strong>
              </p>

              <form onSubmit={(e) => void handleSavePin(e)} className="profile-pin-form">
                <div className="input-group">
                  <label htmlFor="profile-pin">{t('auth.pin_label')}</label>
                  <input
                    id="profile-pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    className="input-text"
                    placeholder={t('auth.pin_placeholder')}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    disabled={pinBusy}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="profile-pin-confirm">{t('profile.pin_confirm_label')}</label>
                  <input
                    id="profile-pin-confirm"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    className="input-text"
                    placeholder={t('profile.pin_confirm_placeholder')}
                    value={pinConfirm}
                    onChange={(e) => setPinConfirm(e.target.value)}
                    disabled={pinBusy}
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={pinBusy || pinInput.length < 4 || pinConfirm.length < 4}
                  >
                    {pinActive ? t('profile.pin_change_btn') : t('profile.pin_set_btn')}
                  </button>
                  {pinActive && (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => void handleRemovePin()}
                      disabled={pinBusy}
                    >
                      {t('profile.pin_remove_btn')}
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="member-editor-card glass">
              <div className="profile-section-header">
                <KeyRound size={20} />
                <h3>{t('profile.passkeys_title')}</h3>
              </div>
              <p className="profile-section-desc">{t('profile.passkeys_desc')}</p>

              {profile.credentials.length === 0 ? (
                <p className="profile-empty">{t('profile.passkeys_empty')}</p>
              ) : (
                <ul className="profile-passkey-list">
                  {profile.credentials.map((cred) => (
                    <li key={cred.id} className="profile-passkey-item">
                      <div className="profile-passkey-main">
                        <span className="profile-passkey-label">
                          {cred.label || t('profile.passkey_unnamed')}
                        </span>
                        <span className="profile-passkey-id">{cred.credentialIdPreview}</span>
                        {cred.transports.length > 0 && (
                          <span className="profile-passkey-transports">
                            {cred.transports.join(', ')}
                          </span>
                        )}
                        <div className="profile-passkey-rename">
                          <input
                            type="text"
                            className="input-text"
                            value={passkeyLabels[cred.id] ?? ''}
                            onChange={(e) =>
                              setPasskeyLabels((prev) => ({ ...prev, [cred.id]: e.target.value }))
                            }
                            placeholder={t('profile.passkey_label_placeholder')}
                            disabled={passkeyBusy}
                            maxLength={64}
                          />
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => void handleRenamePasskey(cred.id)}
                            disabled={passkeyBusy}
                          >
                            {t('profile.passkey_rename_btn')}
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-icon danger"
                        onClick={() => void handleRemovePasskey(cred.id)}
                        disabled={passkeyBusy}
                        title={t('profile.remove_passkey_btn')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="profile-add-passkey">
                <div className="input-group">
                  <label htmlFor="profile-new-passkey-label">{t('profile.passkey_label')}</label>
                  <input
                    id="profile-new-passkey-label"
                    type="text"
                    className="input-text"
                    value={newPasskeyLabel}
                    onChange={(e) => setNewPasskeyLabel(e.target.value)}
                    placeholder={t('profile.passkey_label_placeholder')}
                    disabled={passkeyBusy}
                    maxLength={64}
                  />
                </div>
              </div>

              <div className="form-actions mt-4">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void handleAddPasskey()}
                  disabled={passkeyBusy}
                >
                  <Plus size={16} />
                  {passkeyBusy ? t('profile.processing') : t('profile.add_passkey_btn')}
                </button>
              </div>
            </section>

            <section className="form-card">
              <div className="form-header">
                <BarChart2 size={24} className="form-icon" />
                <div>
                  <h2>{t('profile.stats_title')}</h2>
                  <p className="stats-subtitle">{t('profile.stats_subtitle')}</p>
                </div>
              </div>

              {(statsTotals || profile) && (
                <div className="stats-kpi-grid">
                  <KpiCard
                    icon={<BookOpen size={20} />}
                    label={t('profile.stats_logbooks')}
                    value={String(logbookCount)}
                  />
                  {statsTotals && (
                    <>
                      <KpiCard
                        icon={<Anchor size={20} />}
                        label={t('stats.travel_days')}
                        value={String(statsTotals.travelDayCount)}
                      />
                      <KpiCard
                        icon={<Gauge size={20} />}
                        label={t('stats.total_distance')}
                        value={formatNm(statsTotals.totalDistanceNm)}
                        unit={t('stats.unit_nm')}
                      />
                      <KpiCard
                        icon={<Sailboat size={20} />}
                        label={t('stats.sail_distance')}
                        value={formatNm(statsTotals.sailDistanceNm)}
                        unit={t('stats.unit_nm')}
                      />
                      <KpiCard
                        icon={<Gauge size={20} />}
                        label={t('stats.motor_distance')}
                        value={formatNm(statsTotals.motorDistanceNm)}
                        unit={t('stats.unit_nm')}
                      />
                      <KpiCard
                        icon={<Timer size={20} />}
                        label={t('stats.motor_hours_total')}
                        value={formatHours(statsTotals.totalMotorHours)}
                        unit={t('stats.unit_h')}
                      />
                      <KpiCard
                        icon={<Share2 size={20} />}
                        label={t('profile.stats_shared_logbooks')}
                        value={String(sharedLogbookCount)}
                      />
                    </>
                  )}
                  <KpiCard
                    icon={<Calendar size={20} />}
                    label={t('profile.stats_account_since')}
                    value={accountAgeLabel}
                  />
                </div>
              )}
            </section>

            <AccountDangerZone className="mt-6" />
          </>
        ) : null}
      </main>
    </div>
  )
}
