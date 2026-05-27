import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { encryptJson, decryptJson } from '../services/crypto.js'
import { syncLogbook } from '../services/sync.js'
import { Users, User, Plus, Trash2, Edit2, Save, X, Check } from 'lucide-react'

interface CrewFormProps {
  logbookId: string
}

interface CrewMemberData {
  name: string
  address: string
  birthDate: string
  phone: string
  nationality: string
  passportNumber: string
  bloodType: string
  allergies: string
  diseases: string
  role: 'skipper' | 'crew'
}

interface DecryptedCrew {
  payloadId: string
  data: CrewMemberData
}

export default function CrewForm({ logbookId }: CrewFormProps) {
  const { t } = useTranslation()

  // Skipper profile state
  const [skipName, setSkipName] = useState('')
  const [skipAddress, setSkipAddress] = useState('')
  const [skipBirthDate, setSkipBirthDate] = useState('')
  const [skipPhone, setSkipPhone] = useState('')
  const [skipNationality, setSkipNationality] = useState('')
  const [skipPassport, setSkipPassport] = useState('')
  const [skipBloodType, setSkipBloodType] = useState('')
  const [skipAllergies, setSkipAllergies] = useState('')
  const [skipDiseases, setSkipDiseases] = useState('')

  // Crew list state
  const [crewList, setCrewList] = useState<DecryptedCrew[]>([])
  
  // Inline editor modal/form state
  const [showMemberForm, setShowMemberForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null) // null = adding, string = editing
  const [memName, setMemName] = useState('')
  const [memAddress, setMemAddress] = useState('')
  const [memBirthDate, setMemBirthDate] = useState('')
  const [memPhone, setMemPhone] = useState('')
  const [memNationality, setMemNationality] = useState('')
  const [memPassport, setMemPassport] = useState('')
  const [memBloodType, setMemBloodType] = useState('')
  const [memAllergies, setMemAllergies] = useState('')
  const [memDiseases, setMemDiseases] = useState('')

  const [loading, setLoading] = useState(false)
  const [savingSkipper, setSavingSkipper] = useState(false)
  const [savingMember, setSavingMember] = useState(false)
  const [skipperSuccess, setSkipperSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadCrewData()
  }, [logbookId])

  const loadCrewData = async () => {
    setLoading(true)
    setError(null)
    try {
      const masterKey = getActiveMasterKey()
      if (!masterKey) throw new Error('Master key not found. Please log in.')

      const localCrews = await db.crews.where({ logbookId }).toArray()
      
      const decryptedCrews: DecryptedCrew[] = []
      
      for (const c of localCrews) {
        const decrypted = await decryptJson(c.encryptedData, c.iv, c.tag, masterKey)
        if (decrypted) {
          if (c.payloadId === 'skipper') {
            setSkipName(decrypted.name || '')
            setSkipAddress(decrypted.address || '')
            setSkipBirthDate(decrypted.birthDate || '')
            setSkipPhone(decrypted.phone || '')
            setSkipNationality(decrypted.nationality || '')
            setSkipPassport(decrypted.passportNumber || '')
            setSkipBloodType(decrypted.bloodType || '')
            setSkipAllergies(decrypted.allergies || '')
            setSkipDiseases(decrypted.diseases || '')
          } else {
            decryptedCrews.push({
              payloadId: c.payloadId,
              data: decrypted
            })
          }
        }
      }
      setCrewList(decryptedCrews)
    } catch (err: any) {
      console.error('Failed to load crew files:', err)
      setError(err.message || 'Decryption failed. Could not load crew profiles.')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSkipper = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingSkipper(true)
    setError(null)
    setSkipperSuccess(false)

    try {
      const masterKey = getActiveMasterKey()
      if (!masterKey) throw new Error('Master key not found. Please log in.')

      const skipperData: CrewMemberData = {
        name: skipName.trim(),
        address: skipAddress.trim(),
        birthDate: skipBirthDate,
        phone: skipPhone.trim(),
        nationality: skipNationality.trim(),
        passportNumber: skipPassport.trim(),
        bloodType: skipBloodType.trim(),
        allergies: skipAllergies.trim(),
        diseases: skipDiseases.trim(),
        role: 'skipper'
      }

      const encrypted = await encryptJson(skipperData, masterKey)
      const now = new Date().toISOString()

      await db.crews.put({
        payloadId: 'skipper',
        logbookId,
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        updatedAt: now
      })

      await db.syncQueue.put({
        action: 'update',
        type: 'crew',
        payloadId: 'skipper',
        logbookId,
        data: JSON.stringify(encrypted),
        updatedAt: now
      })

      setSkipperSuccess(true)
      setTimeout(() => setSkipperSuccess(false), 3000)

      syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
    } catch (err: any) {
      console.error('Failed to save skipper profile:', err)
      setError(err.message || 'Failed to save skipper profile.')
    } finally {
      setSavingSkipper(false)
    }
  }

  const openAddMember = () => {
    setEditingId(null)
    setMemName('')
    setMemAddress('')
    setMemBirthDate('')
    setMemPhone('')
    setMemNationality('')
    setMemPassport('')
    setMemBloodType('')
    setMemAllergies('')
    setMemDiseases('')
    setShowMemberForm(true)
  }

  const openEditMember = (member: DecryptedCrew) => {
    setEditingId(member.payloadId)
    setMemName(member.data.name)
    setMemAddress(member.data.address)
    setMemBirthDate(member.data.birthDate)
    setMemPhone(member.data.phone)
    setMemNationality(member.data.nationality)
    setMemPassport(member.data.passportNumber)
    setMemBloodType(member.data.bloodType)
    setMemAllergies(member.data.allergies)
    setMemDiseases(member.data.diseases)
    setShowMemberForm(true)
  }

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!memName.trim()) return

    setSavingMember(true)
    setError(null)

    try {
      const masterKey = getActiveMasterKey()
      if (!masterKey) throw new Error('Master key not found. Please log in.')

      const memberData: CrewMemberData = {
        name: memName.trim(),
        address: memAddress.trim(),
        birthDate: memBirthDate,
        phone: memPhone.trim(),
        nationality: memNationality.trim(),
        passportNumber: memPassport.trim(),
        bloodType: memBloodType.trim(),
        allergies: memAllergies.trim(),
        diseases: memDiseases.trim(),
        role: 'crew'
      }

      const encrypted = await encryptJson(memberData, masterKey)
      const now = new Date().toISOString()
      const memberId = editingId || window.crypto.randomUUID()
      const isNew = !editingId

      await db.crews.put({
        payloadId: memberId,
        logbookId,
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        updatedAt: now
      })

      await db.syncQueue.put({
        action: isNew ? 'create' : 'update',
        type: 'crew',
        payloadId: memberId,
        logbookId,
        data: JSON.stringify(encrypted),
        updatedAt: now
      })

      // Update state local list
      if (isNew) {
        setCrewList((prev) => [...prev, { payloadId: memberId, data: memberData }])
      } else {
        setCrewList((prev) =>
          prev.map((item) => (item.payloadId === memberId ? { payloadId: memberId, data: memberData } : item))
        )
      }

      setShowMemberForm(false)
      syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
    } catch (err: any) {
      console.error('Failed to save crew member:', err)
      setError(err.message || 'Failed to save crew member.')
    } finally {
      setSavingMember(false)
    }
  }

  const handleDeleteMember = async (memberId: string) => {
    if (window.confirm(t('crew.delete_confirm'))) {
      setError(null)
      try {
        const now = new Date().toISOString()
        
        await db.crews.delete(memberId)
        
        await db.syncQueue.put({
          action: 'delete',
          type: 'crew',
          payloadId: memberId,
          logbookId,
          data: '',
          updatedAt: now
        })

        setCrewList((prev) => prev.filter((item) => item.payloadId !== memberId))

        syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
      } catch (err: any) {
        console.error('Failed to delete crew member:', err)
        setError(err.message || 'Failed to delete crew member.')
      }
    }
  }

  if (loading) {
    return (
      <div className="tab-placeholder">
        <Users className="header-logo spin" size={48} />
        <p>{t('crew.loading')}</p>
      </div>
    )
  }

  return (
    <div className="crew-dashboard-layout">
      {/* Skipper Section */}
      <div className="form-card">
        <div className="form-header">
          <User size={24} className="form-icon" />
          <h2>{t('crew.skipper_section')}</h2>
        </div>

        {error && <div className="auth-error mb-4">{error}</div>}

        <form onSubmit={handleSaveSkipper} className="vessel-form">
          <div className="form-grid">
            <div className="input-group">
              <label>{t('crew.name')}</label>
              <input
                type="text"
                className="input-text"
                value={skipName}
                onChange={(e) => setSkipName(e.target.value)}
                disabled={savingSkipper}
                required
              />
            </div>

            <div className="input-group">
              <label>{t('crew.address')}</label>
              <input
                type="text"
                className="input-text"
                value={skipAddress}
                onChange={(e) => setSkipAddress(e.target.value)}
                disabled={savingSkipper}
              />
            </div>

            <div className="input-group">
              <label>{t('crew.birthdate')}</label>
              <input
                type="date"
                className="input-text"
                value={skipBirthDate}
                onChange={(e) => setSkipBirthDate(e.target.value)}
                disabled={savingSkipper}
              />
            </div>

            <div className="input-group">
              <label>{t('crew.phone')}</label>
              <input
                type="text"
                className="input-text"
                value={skipPhone}
                onChange={(e) => setSkipPhone(e.target.value)}
                disabled={savingSkipper}
              />
            </div>

            <div className="input-group">
              <label>{t('crew.nationality')}</label>
              <input
                type="text"
                className="input-text"
                value={skipNationality}
                onChange={(e) => setSkipNationality(e.target.value)}
                disabled={savingSkipper}
              />
            </div>

            <div className="input-group">
              <label>{t('crew.passport')}</label>
              <input
                type="text"
                className="input-text"
                value={skipPassport}
                onChange={(e) => setSkipPassport(e.target.value)}
                disabled={savingSkipper}
              />
            </div>

            <div className="input-group">
              <label>{t('crew.bloodtype')}</label>
              <input
                type="text"
                className="input-text"
                value={skipBloodType}
                onChange={(e) => setSkipBloodType(e.target.value)}
                disabled={savingSkipper}
              />
            </div>

            <div className="input-group">
              <label>{t('crew.allergies')}</label>
              <input
                type="text"
                className="input-text"
                value={skipAllergies}
                onChange={(e) => setSkipAllergies(e.target.value)}
                disabled={savingSkipper}
              />
            </div>

            <div className="input-group" style={{ gridColumn: 'span 2' }}>
              <label>{t('crew.diseases')}</label>
              <input
                type="text"
                className="input-text"
                value={skipDiseases}
                onChange={(e) => setSkipDiseases(e.target.value)}
                disabled={savingSkipper}
              />
            </div>
          </div>

          <div className="form-actions">
            {skipperSuccess && (
              <div className="success-toast">
                <Check size={16} />
                <span>{t('crew.saved')}</span>
              </div>
            )}
            
            <button type="submit" className="btn primary" disabled={savingSkipper || !skipName.trim()}>
              <Save size={18} />
              {t('crew.save')}
            </button>
          </div>
        </form>
      </div>

      {/* Crew list section */}
      <div className="form-card mt-6">
        <div className="section-title-bar mb-4">
          <div className="form-header" style={{ margin: 0 }}>
            <Users size={24} className="form-icon" />
            <h2>{t('crew.crew_section')}</h2>
          </div>
          {crewList.length < 5 && !showMemberForm && (
            <button className="btn primary" onClick={openAddMember} style={{ width: 'auto', padding: '8px 16px' }}>
              <Plus size={16} />
              {t('crew.add_crew')}
            </button>
          )}
        </div>

        {/* Add/Edit member form */}
        {showMemberForm && (
          <form onSubmit={handleSaveMember} className="member-editor-card glass mb-6">
            <div className="editor-header mb-4">
              <h3>{editingId ? t('crew.edit_crew') : t('crew.add_crew')}</h3>
              <button type="button" className="btn-icon" onClick={() => setShowMemberForm(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="form-grid">
              <div className="input-group">
                <label>{t('crew.name')} *</label>
                <input
                  type="text"
                  className="input-text"
                  value={memName}
                  onChange={(e) => setMemName(e.target.value)}
                  disabled={savingMember}
                  required
                />
              </div>

              <div className="input-group">
                <label>{t('crew.address')}</label>
                <input
                  type="text"
                  className="input-text"
                  value={memAddress}
                  onChange={(e) => setMemAddress(e.target.value)}
                  disabled={savingMember}
                />
              </div>

              <div className="input-group">
                <label>{t('crew.birthdate')}</label>
                <input
                  type="date"
                  className="input-text"
                  value={memBirthDate}
                  onChange={(e) => setMemBirthDate(e.target.value)}
                  disabled={savingMember}
                />
              </div>

              <div className="input-group">
                <label>{t('crew.phone')}</label>
                <input
                  type="text"
                  className="input-text"
                  value={memPhone}
                  onChange={(e) => setMemPhone(e.target.value)}
                  disabled={savingMember}
                />
              </div>

              <div className="input-group">
                <label>{t('crew.nationality')}</label>
                <input
                  type="text"
                  className="input-text"
                  value={memNationality}
                  onChange={(e) => setMemNationality(e.target.value)}
                  disabled={savingMember}
                />
              </div>

              <div className="input-group">
                <label>{t('crew.passport')}</label>
                <input
                  type="text"
                  className="input-text"
                  value={memPassport}
                  onChange={(e) => setMemPassport(e.target.value)}
                  disabled={savingMember}
                />
              </div>

              <div className="input-group">
                <label>{t('crew.bloodtype')}</label>
                <input
                  type="text"
                  className="input-text"
                  value={memBloodType}
                  onChange={(e) => setMemBloodType(e.target.value)}
                  disabled={savingMember}
                />
              </div>

              <div className="input-group">
                <label>{t('crew.allergies')}</label>
                <input
                  type="text"
                  className="input-text"
                  value={memAllergies}
                  onChange={(e) => setMemAllergies(e.target.value)}
                  disabled={savingMember}
                />
              </div>

              <div className="input-group" style={{ gridColumn: 'span 2' }}>
                <label>{t('crew.diseases')}</label>
                <input
                  type="text"
                  className="input-text"
                  value={memDiseases}
                  onChange={(e) => setMemDiseases(e.target.value)}
                  disabled={savingMember}
                />
              </div>
            </div>

            <div className="editor-actions mt-4">
              <button type="submit" className="btn primary" disabled={savingMember || !memName.trim()}>
                <Check size={18} />
                {t('crew.save_member')}
              </button>
            </div>
          </form>
        )}

        {crewList.length === 0 ? (
          <div className="dashboard-status-msg">{t('crew.no_crew')}</div>
        ) : (
          <div className="crew-grid">
            {crewList.map((m) => (
              <div key={m.payloadId} className="crew-member-card glass">
                <div className="crew-card-header">
                  <h4>{m.data.name}</h4>
                  <div className="card-actions">
                    <button className="btn-icon" onClick={() => openEditMember(m)} title="Edit">
                      <Edit2 size={14} />
                    </button>
                    <button className="btn-icon logout" onClick={() => handleDeleteMember(m.payloadId)} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="crew-card-body">
                  {m.data.birthDate && <p><strong>{t('crew.birthdate')}:</strong> {m.data.birthDate}</p>}
                  {m.data.phone && <p><strong>{t('crew.phone')}:</strong> {m.data.phone}</p>}
                  {m.data.nationality && <p><strong>{t('crew.nationality')}:</strong> {m.data.nationality}</p>}
                  {m.data.passportNumber && <p><strong>{t('crew.passport')}:</strong> {m.data.passportNumber}</p>}
                  {m.data.bloodType && <p><strong>{t('crew.bloodtype')}:</strong> {m.data.bloodType}</p>}
                  {m.data.allergies && <p><strong>{t('crew.allergies')}:</strong> {m.data.allergies}</p>}
                  {m.data.diseases && <p><strong>{t('crew.diseases')}:</strong> {m.data.diseases}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
