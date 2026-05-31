import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings as SettingsIcon, Check, Users, Trash2, Copy, Link as LinkIcon } from 'lucide-react'
import { ensureLogbookKey } from '../services/logbookKeys.js'
import LogbookBackupPanel from './LogbookBackupPanel.tsx'
import { useDialog } from './ModalDialog.tsx'
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

const bufferToHex = (buffer: ArrayBuffer): string => {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export default function SettingsForm({ logbookId, onLogbookRestored }: SettingsFormProps) {
  const { t } = useTranslation()
  const { showConfirm, showAlert } = useDialog()

  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [isOwner, setIsOwner] = useState(true)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [collabError, setCollabError] = useState<string | null>(null)
  const [loadingCollabs, setLoadingCollabs] = useState(false)

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
    } catch (err: unknown) {
      console.error('Toggle share link failed:', err)
      showAlert(err instanceof Error ? err.message : 'Failed to update public share link.')
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
      const logbookKey = await ensureLogbookKey(logbookId)

      const res = await apiFetch('/api/collaboration/invite', {
        method: 'POST',
        body: JSON.stringify({ logbookId, role: 'WRITE' })
      })

      if (!res.ok) {
        throw new Error('Failed to create invitation on the server.')
      }

      const invite = await res.json()
      const hexKey = bufferToHex(logbookKey)
      const link = `${window.location.origin}/invite?token=${invite.token}#key=${hexKey}`

      setInviteLink(link)
      trackPlausibleEvent(PlausibleEvents.INVITE_GENERATED)
    } catch (err: unknown) {
      console.error('Failed to generate invite:', err)
      showAlert(err instanceof Error ? err.message : 'Failed to generate invite link.')
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
      } catch (err: unknown) {
        console.error('Revocation failed:', err)
        showAlert(err instanceof Error ? err.message : 'Failed to revoke access.')
      }
    }
  }

  if (!logbookId) {
    return (
      <div className="form-card">
        <div className="form-header">
          <SettingsIcon size={24} className="form-icon" />
          <div>
            <h2>{t('settings.title')}</h2>
            <p className="form-subtitle">{t('settings.subtitle')}</p>
          </div>
        </div>
        <p className="text-muted mt-4">{t('settings.select_logbook_hint')}</p>
      </div>
    )
  }

  return (
    <div className="form-card">
      <div className="form-header">
        <SettingsIcon size={24} className="form-icon" />
        <div>
          <h2>{t('settings.title')}</h2>
          <p className="form-subtitle">{t('settings.subtitle')}</p>
        </div>
      </div>

      {logbookId && isOwner && (
        <div className="member-editor-card glass mt-6">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <LinkIcon size={20} style={{ color: '#fbbf24' }} />
            <h3 style={{ margin: 0, color: '#fbbf24', fontSize: '16px' }}>
              {t('settings.share_title')}
            </h3>
          </div>

          <p style={{ fontSize: '13.5px', color: '#94a3b8', lineHeight: '145%', margin: '0 0 16px 0' }}>
            {t('settings.share_desc')}
          </p>

          <p className="signature-lock-notice" style={{ marginBottom: '16px' }}>
            {t('settings.share_privacy_warning')}
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

      {logbookId && isOwner && (
        <LogbookBackupPanel logbookId={logbookId} onRestored={onLogbookRestored} />
      )}

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
    </div>
  )
}
