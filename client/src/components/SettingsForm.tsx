import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings as SettingsIcon, Save, Check, Users, Trash2, Copy, Link as LinkIcon, Compass } from 'lucide-react'
import { ensureLogbookKey } from '../services/logbookKeys.js'
import LogbookBackupPanel from './LogbookBackupPanel.tsx'
import AccountDangerZone from './AccountDangerZone.tsx'
import PwaInstallPrompt from './PwaInstallPrompt.tsx'
import PushNotificationSettings from './PushNotificationSettings.tsx'
import { useDialog } from './ModalDialog.tsx'
import { notifyAppearanceChanged } from '../services/appearance.js'
import ThemedSelect from './ThemedSelect.tsx'
import { useAppTour } from '../context/AppTourContext.tsx'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import { apiFetch } from '../services/api.js'

interface SettingsFormProps {
  logbookId?: string | null
  onLogbookRestored?: (logbookId: string, title: string) => void
}

interface Collaborator {
  id: string
  userId: string
  username: string
  role: string
  createdAt: string
}

// Convert ArrayBuffer to Hex String for URL fragment
const bufferToHex = (buffer: ArrayBuffer): string => {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export default function SettingsForm({ logbookId, onLogbookRestored }: SettingsFormProps) {
  const { t } = useTranslation()
  const { showConfirm, showAlert } = useDialog()
  const { restartTour } = useAppTour()
  const [apiKey, setApiKey] = useState(localStorage.getItem('owm_api_key') || '')
  const [theme, setTheme] = useState(localStorage.getItem('active_theme') || 'auto')
  const [colorScheme, setColorScheme] = useState(localStorage.getItem('active_color_scheme') || 'auto')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  // Collaboration States
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [isOwner, setIsOwner] = useState(true)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [collabError, setCollabError] = useState<string | null>(null)
  const [loadingCollabs, setLoadingCollabs] = useState(false)

  // Public Share Link States
  const [shareEnabled, setShareEnabled] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [shareCopied, setShareCopied] = useState(false)
  const [loadingShareLink, setLoadingShareLink] = useState(false)

  useEffect(() => {
    if (logbookId) {
      loadCollaborators()
      loadShareLink()
    }
  }, [logbookId])

  const loadShareLink = async () => {
    if (!logbookId) return
    setLoadingShareLink(true)
    if (!localStorage.getItem('active_userid')) return

    try {
      const res = await apiFetch(`/api/collaboration/share-link?logbookId=${logbookId}`)

      if (res.ok) {
        const data = await res.json()
        if (data.token) {
          setShareEnabled(true)
          const logbookKey = await ensureLogbookKey(logbookId)
          const hexKey = bufferToHex(logbookKey)
          setShareLink(`${window.location.origin}/share?token=${data.token}#key=${hexKey}`)
        } else {
          setShareEnabled(false)
          setShareLink('')
        }
      }
    } catch (err) {
      console.error('Failed to load share link:', err)
    } finally {
      setLoadingShareLink(false)
    }
  }

  const handleToggleShare = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!logbookId) return
    const checked = e.target.checked
    if (!localStorage.getItem('active_userid')) return

    setLoadingShareLink(true)
    try {
      const res = await apiFetch('/api/collaboration/share-link', {
        method: 'POST',
        body: JSON.stringify({ logbookId, enabled: checked })
      })

      if (res.ok) {
        const data = await res.json()
        if (checked && data.token) {
          setShareEnabled(true)
          const logbookKey = await ensureLogbookKey(logbookId)
          const hexKey = bufferToHex(logbookKey)
          setShareLink(`${window.location.origin}/share?token=${data.token}#key=${hexKey}`)
          trackPlausibleEvent(PlausibleEvents.LOGBOOK_SHARED)
          showAlert('Public share link enabled!')
        } else {
          setShareEnabled(false)
          setShareLink('')
          showAlert('Public share link disabled.')
        }
      } else {
        throw new Error('Failed to toggle public share link.')
      }
    } catch (err: any) {
      console.error('Toggle share link failed:', err)
      showAlert(err.message || 'Failed to update public share link.')
    } finally {
      setLoadingShareLink(false)
    }
  }

  const handleCopyShareLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    }
  }


  const loadCollaborators = async () => {
    setLoadingCollabs(true)
    setCollabError(null)
    if (!localStorage.getItem('active_userid')) return

    try {
      const res = await apiFetch(`/api/collaboration/collaborators?logbookId=${logbookId}`)

      if (res.status === 403) {
        setIsOwner(false)
        return
      }

      if (res.ok) {
        setIsOwner(true)
        const data = await res.json()
        setCollaborators(data)
      } else {
        setIsOwner(true)
      }
    } catch (err) {
      console.error('Failed to load collaborators:', err)
      setIsOwner(true)
      setCollabError('Failed to load collaborator list.')
    } finally {
      setLoadingCollabs(false)
    }
  }

  const handleGenerateInvite = async () => {
    if (!logbookId) return
    setGeneratingInvite(true)
    setInviteLink('')
    if (!localStorage.getItem('active_userid')) return

    try {
      // 1. Ensure logbook has an E2E key (upgrades legacy logbooks if needed)
      const logbookKey = await ensureLogbookKey(logbookId)

      // 2. Create invite token on server
      const res = await apiFetch('/api/collaboration/invite', {
        method: 'POST',
        body: JSON.stringify({ logbookId, role: 'WRITE' })
      })

      if (!res.ok) {
        throw new Error('Failed to create invitation on the server.')
      }

      const invite = await res.json()
      
      // 3. Format link containing token (URL params) and key (URL hash anchor)
      const hexKey = bufferToHex(logbookKey)
      const link = `${window.location.origin}/invite?token=${invite.token}#key=${hexKey}`
      
      setInviteLink(link)
      trackPlausibleEvent(PlausibleEvents.INVITE_GENERATED)
    } catch (err: any) {
      console.error('Failed to generate invite:', err)
      showAlert(err.message || 'Failed to generate invite link.')
    } finally {
      setGeneratingInvite(false)
    }
  }

  const handleCopyInvite = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    }
  }

  const handleRevoke = async (collabId: string, collName: string) => {
    if (!localStorage.getItem('active_userid')) return

    if (await showConfirm(t('logs.revoke_confirm'), collName, t('logs.confirm_yes'), t('logs.confirm_no'))) {
      try {
        const res = await apiFetch(`/api/collaboration/collaborators/${collabId}`, {
          method: 'DELETE'
        })

        if (res.ok) {
          setCollaborators(prev => prev.filter(c => c.id !== collabId))
          showAlert('Crew member access revoked successfully.')
        } else {
          throw new Error('Failed to revoke collaborator access.')
        }
      } catch (err: any) {
        console.error('Revocation failed:', err)
        showAlert(err.message || 'Failed to revoke access.')
      }
    }
  }

  const persistAppearance = (nextTheme: string, nextColorScheme: string) => {
    localStorage.setItem('active_theme', nextTheme)
    localStorage.setItem('active_color_scheme', nextColorScheme)
    notifyAppearanceChanged()
  }

  const handleThemeChange = (nextTheme: string) => {
    setTheme(nextTheme)
    persistAppearance(nextTheme, colorScheme)
  }

  const handleColorSchemeChange = (nextColorScheme: string) => {
    setColorScheme(nextColorScheme)
    persistAppearance(theme, nextColorScheme)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccess(false)
    
    localStorage.setItem('owm_api_key', apiKey.trim())
    persistAppearance(theme, colorScheme)
    
    setSaving(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="form-card">
      <div className="form-header">
        <SettingsIcon size={24} className="form-icon" />
        <div>
          <h2>{t('settings.title')}</h2>
          <p className="form-subtitle" style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            {t('settings.subtitle')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="vessel-form mt-6">
        <PwaInstallPrompt variant="inline" />
        <PushNotificationSettings />

        {/* Weather Integration card */}
        <div className="member-editor-card glass">
          <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#fbbf24', fontSize: '16px' }}>
            {t('settings.owm_title')}
          </h3>
          <p style={{ fontSize: '13.5px', color: '#94a3b8', lineHeight: '145%', margin: '0 0 16px 0' }}>
            {t('settings.key_help')}
          </p>

          <div className="input-group">
            <label htmlFor="owm-api-key" style={{ display: 'block', fontSize: '13.5px', color: '#94a3b8', marginBottom: '6px', fontWeight: 500 }}>
              {t('settings.owm_key')}
            </label>
            <input
              id="owm-api-key"
              name="owm-api-key"
              type="password"
              className="input-text"
              placeholder="e.g. 8b6a7f...d8"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={saving}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Theme customization card */}
        <div className="member-editor-card glass mt-4">
          <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#fbbf24', fontSize: '16px' }}>
            {t('settings.theme_title')}
          </h3>
          <p style={{ fontSize: '13.5px', color: '#94a3b8', lineHeight: '145%', margin: '0 0 16px 0' }}>
            {t('settings.theme_label')}
          </p>

          <div className="input-group">
            <ThemedSelect
              id="app-theme"
              value={theme}
              disabled={saving}
              onChange={handleThemeChange}
              options={[
                { value: 'auto', label: t('settings.theme_auto') },
                { value: 'ocean', label: t('settings.theme_ocean') },
                { value: 'material', label: t('settings.theme_material') },
                { value: 'cupertino', label: t('settings.theme_cupertino') }
              ]}
            />
          </div>
        </div>

        <div className="member-editor-card glass mt-4">
          <h3 style={{ marginTop: 0, marginBottom: '12px', color: 'var(--app-accent-light)', fontSize: '16px' }}>
            {t('settings.color_scheme_title')}
          </h3>
          <p className="text-muted" style={{ fontSize: '13.5px', lineHeight: '145%', margin: '0 0 16px 0' }}>
            {t('settings.color_scheme_label')}
          </p>

          <div className="input-group">
            <ThemedSelect
              id="app-color-scheme"
              value={colorScheme}
              disabled={saving}
              onChange={handleColorSchemeChange}
              options={[
                { value: 'auto', label: t('settings.color_scheme_auto') },
                { value: 'light', label: t('settings.color_scheme_light') },
                { value: 'dark', label: t('settings.color_scheme_dark') }
              ]}
            />
          </div>
        </div>

        <div className="member-editor-card glass mt-4">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Compass size={20} style={{ color: 'var(--app-accent-light)' }} />
            <h3 style={{ margin: 0, color: 'var(--app-accent-light)', fontSize: '16px' }}>
              {t('settings.tour_title')}
            </h3>
          </div>
          <p className="text-muted" style={{ fontSize: '13.5px', lineHeight: '145%', margin: '0 0 16px 0' }}>
            {t('settings.tour_desc')}
          </p>
          <button
            type="button"
            className="btn secondary"
            onClick={() => restartTour()}
          >
            {t('settings.tour_restart')}
          </button>
        </div>

        <div className="form-actions mt-4 mb-6">
          {success && (
            <div className="success-toast">
              <Check size={16} />
              <span>{t('settings.saved')}</span>
            </div>
          )}
          
          <button type="submit" className="btn primary" disabled={saving}>
            <Save size={18} />
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </form>

      {/* Public Share Link Card (Only visible to Logbook Owner) */}
      {logbookId && isOwner && (
        <div className="member-editor-card glass mt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <LinkIcon size={20} style={{ color: '#fbbf24' }} />
            <h3 style={{ margin: 0, color: '#fbbf24', fontSize: '16px' }}>
              {t('settings.share_title')}
            </h3>
          </div>

          <p style={{ fontSize: '13.5px', color: '#94a3b8', lineHeight: '145%', margin: '0 0 16px 0' }}>
            {t('settings.share_desc')}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <label className="switch-label" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px', color: '#f1f5f9' }}>
              <input
                type="checkbox"
                checked={shareEnabled}
                onChange={handleToggleShare}
                disabled={loadingShareLink}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span>{t('settings.share_enable')}</span>
            </label>
            {loadingShareLink && <span style={{ fontSize: '12px', color: '#64748b' }}>Updating...</span>}
          </div>

          {shareEnabled && shareLink && (
            <div className="input-group mb-4 copy-link-row">
              <input
                type="text"
                readOnly
                value={shareLink}
                className="input-text font-mono text-xs"
                style={{ flex: 1, padding: '10px' }}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                className="btn secondary"
                onClick={handleCopyShareLink}
                style={{ width: 'auto', padding: '10px' }}
              >
                {shareCopied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Backup & Restore (owner only) */}
      {logbookId && isOwner && (
        <LogbookBackupPanel logbookId={logbookId} onRestored={onLogbookRestored} />
      )}

      {/* Crew Collaboration Card (Only visible to Logbook Owner) */}
      {logbookId && isOwner && (
        <div className="member-editor-card glass mt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Users size={20} style={{ color: '#fbbf24' }} />
            <h3 style={{ margin: 0, color: '#fbbf24', fontSize: '16px' }}>
              {t('logs.invite_crew')}
            </h3>
          </div>

          <p style={{ fontSize: '13.5px', color: '#94a3b8', lineHeight: '145%', margin: '0 0 16px 0' }}>
            {t('logs.invite_link_desc')}
          </p>

          <div className="form-actions form-actions--start" style={{ gap: '12px', marginBottom: '20px' }}>
            <button
              type="button"
              className="btn primary"
              onClick={handleGenerateInvite}
              disabled={generatingInvite}
            >
              <LinkIcon size={16} />
              {generatingInvite ? 'Generating...' : t('logs.invite_crew')}
            </button>
            <span style={{ fontSize: '12px', color: '#64748b' }}>{t('logs.invite_expires')}</span>
          </div>

          {inviteLink && (
            <div className="input-group mb-6 copy-link-row">
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="input-text font-mono text-xs"
                style={{ flex: 1, padding: '10px' }}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                className="btn secondary"
                onClick={handleCopyInvite}
                style={{ width: 'auto', padding: '10px' }}
              >
                {inviteCopied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          )}

          {/* Collaborator List */}
          <h4 style={{ color: '#fbbf24', fontSize: '14px', marginBottom: '12px' }}>
            {t('logs.collaborators_list')}
          </h4>

          {loadingCollabs ? (
            <div style={{ fontSize: '13px', color: '#64748b' }}>Loading crew members...</div>
          ) : collabError ? (
            <div className="auth-error">{collabError}</div>
          ) : collaborators.length === 0 ? (
            <div style={{ fontSize: '13.5px', color: '#64748b', fontStyle: 'italic' }}>No active crew members.</div>
          ) : (
            <div className="table-responsive">
              <table className="event-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>{t('logs.invite_role')}</th>
                    <th>Joined</th>
                    <th style={{ width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {collaborators.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.username}</td>
                      <td>{c.role}</td>
                      <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-icon logout"
                          onClick={() => handleRevoke(c.id, c.username)}
                          title="Revoke access"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* Danger Zone / Account Deletion */}
      <AccountDangerZone className="mt-6" />
    </div>
  )
}
