import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings as SettingsIcon, Save, Check, Users, Trash2, Copy, Link as LinkIcon } from 'lucide-react'
import { ensureLogbookKey } from '../services/logbookKeys.js'
import { useDialog } from './ModalDialog.tsx'

interface SettingsFormProps {
  logbookId?: string | null
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

export default function SettingsForm({ logbookId }: SettingsFormProps) {
  const { t } = useTranslation()
  const { showConfirm, showAlert } = useDialog()
  const [apiKey, setApiKey] = useState(localStorage.getItem('owm_api_key') || '')
  const [theme, setTheme] = useState(localStorage.getItem('active_theme') || 'auto')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  // Collaboration States
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [collabError, setCollabError] = useState<string | null>(null)
  const [loadingCollabs, setLoadingCollabs] = useState(false)

  useEffect(() => {
    if (logbookId) {
      loadCollaborators()
    }
  }, [logbookId])

  const loadCollaborators = async () => {
    setLoadingCollabs(true)
    setCollabError(null)
    const userId = localStorage.getItem('active_userid')
    if (!userId) return

    try {
      const res = await fetch(`/api/collaboration/collaborators?logbookId=${logbookId}`, {
        headers: {
          'X-User-Id': userId
        }
      })

      if (res.status === 403) {
        setIsOwner(false)
        return
      }

      if (res.ok) {
        setIsOwner(true)
        const data = await res.json()
        setCollaborators(data)
      }
    } catch (err) {
      console.error('Failed to load collaborators:', err)
      setCollabError('Failed to load collaborator list.')
    } finally {
      setLoadingCollabs(false)
    }
  }

  const handleGenerateInvite = async () => {
    if (!logbookId) return
    setGeneratingInvite(true)
    setInviteLink('')
    const userId = localStorage.getItem('active_userid')
    if (!userId) return

    try {
      // 1. Ensure logbook has an E2E key (upgrades legacy logbooks if needed)
      const logbookKey = await ensureLogbookKey(logbookId)

      // 2. Create invite token on server
      const res = await fetch('/api/collaboration/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId
        },
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
    const userId = localStorage.getItem('active_userid')
    if (!userId) return

    if (await showConfirm(t('logs.revoke_confirm'), collName, t('logs.confirm_yes'), t('logs.confirm_no'))) {
      try {
        const res = await fetch(`/api/collaboration/collaborators/${collabId}`, {
          method: 'DELETE',
          headers: {
            'X-User-Id': userId
          }
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccess(false)
    
    // Save to localStorage
    localStorage.setItem('owm_api_key', apiKey.trim())
    localStorage.setItem('active_theme', theme)
    
    // Notify App of theme change
    window.dispatchEvent(new Event('theme-changed'))
    
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
              type="password"
              className="input-text"
              placeholder="e.g. 8b6a7f...d8"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={saving}
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
            <select
              id="app-theme"
              className="input-text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              disabled={saving}
              style={{ background: 'rgba(11, 12, 16, 0.85)', color: '#f1f5f9' }}
            >
              <option value="auto">{t('settings.theme_auto')}</option>
              <option value="ocean">{t('settings.theme_ocean')}</option>
              <option value="material">{t('settings.theme_material')}</option>
              <option value="cupertino">{t('settings.theme_cupertino')}</option>
            </select>
          </div>
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

          <div className="form-actions" style={{ justifyContent: 'flex-start', gap: '12px', marginBottom: '20px' }}>
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
            <div className="input-group mb-6" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
    </div>
  )
}
