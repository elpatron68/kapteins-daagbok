import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { getLogbookKey } from '../services/logbookKeys.js'
import { encryptJson, decryptJson } from '../services/crypto.js'
import { syncLogbook } from '../services/sync.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDialog } from './ModalDialog.tsx'
import { Camera, Trash2 } from 'lucide-react'

interface PhotoCaptureProps {
  entryId: string
  logbookId: string
  readOnly?: boolean
  preloadedPhotos?: any[]
}

interface DecryptedPhoto {
  payloadId: string
  image: string
  caption: string
  updatedAt: string
}

export default function PhotoCapture({ entryId, logbookId, readOnly = false, preloadedPhotos }: PhotoCaptureProps) {
  const { t } = useTranslation()
  const { showConfirm } = useDialog()
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [decryptedPhotos, setDecryptedPhotos] = useState<DecryptedPhoto[]>([])
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reactively query local photos database
  const localPhotos = useLiveQuery(
    () => db.photos.where({ entryId }).toArray(),
    [entryId]
  )

  // Decrypt photos on query updates
  useEffect(() => {
    async function decryptPhotosList() {
      if (readOnly && preloadedPhotos) {
        const filtered = preloadedPhotos
          .filter((p: any) => p.entryId === entryId)
          .map((p: any) => ({
            payloadId: p.payloadId || p.id,
            image: p.image,
            caption: p.caption || '',
            updatedAt: p.updatedAt || new Date().toISOString()
          }))
        setDecryptedPhotos(filtered)
        return
      }

      if (!localPhotos) return
      
      const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
      if (!masterKey) return

      const list: DecryptedPhoto[] = []
      for (const p of localPhotos) {
        try {
          const decrypted = await decryptJson(p.encryptedData, p.iv, p.tag, masterKey)
          if (decrypted) {
            list.push({
              payloadId: p.payloadId,
              image: decrypted.image,
              caption: decrypted.caption || '',
              updatedAt: p.updatedAt
            })
          }
        } catch (e) {
          console.error('Failed to decrypt photo attachment:', e)
        }
      }
      setDecryptedPhotos(list)
    }

    decryptPhotosList()
  }, [localPhotos, readOnly, preloadedPhotos, entryId])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Could not get canvas context')

          let width = img.width
          let height = img.height
          const MAX_WIDTH = 1280
          const MAX_HEIGHT = 720

          // Calculate resizing conserving aspect ratio
          if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height)
            width = Math.round(width * ratio)
            height = Math.round(height * ratio)
          }

          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)

          // Compress to JPEG, 70% quality
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7)

          // Encrypt
          const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
          if (!masterKey) throw new Error('Encryption key not found. Please log in.')

          const photoId = window.crypto.randomUUID()
          const photoPayload = {
            image: compressedBase64,
            caption: caption.trim()
          }

          const encrypted = await encryptJson(photoPayload, masterKey)
          const now = new Date().toISOString()

          // Store locally
          await db.photos.put({
            payloadId: photoId,
            entryId,
            logbookId,
            encryptedData: encrypted.ciphertext,
            iv: encrypted.iv,
            tag: encrypted.tag,
            caption: '', // stored encrypted inside payload
            updatedAt: now
          })

          // Queue for background sync
          await db.syncQueue.put({
            action: 'create',
            type: 'photo',
            payloadId: photoId,
            logbookId,
            data: JSON.stringify({
              encryptedData: encrypted.ciphertext,
              iv: encrypted.iv,
              tag: encrypted.tag,
              entryId
            }),
            updatedAt: now
          })

          setCaption('')
          if (fileInputRef.current) fileInputRef.current.value = ''
          trackPlausibleEvent(PlausibleEvents.PHOTO_UPLOADED, { context: 'logbook' })

          syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
        } catch (err: any) {
          console.error('Failed to process image:', err)
          setError(err.message || 'Failed to process image')
        } finally {
          setUploading(false)
        }
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleDelete = async (photoId: string) => {
    if (await showConfirm(t('logs.photo_delete_confirm'), t('logs.photos_title'), t('logs.confirm_yes'), t('logs.confirm_no'))) {
      try {
        const now = new Date().toISOString()
        
        await db.photos.delete(photoId)
        
        await db.syncQueue.put({
          action: 'delete',
          type: 'photo',
          payloadId: photoId,
          logbookId,
          data: '',
          updatedAt: now
        })

        syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
      } catch (err: any) {
        console.error('Failed to delete photo:', err)
      }
    }
  }

  const triggerSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  return (
    <div className="form-card mt-6">
      <div className="form-header mb-4">
        <Camera size={20} className="form-icon" />
        <h3>{t('logs.photos_title')}</h3>
      </div>

      {error && <div className="auth-error mb-4">{error}</div>}

      {/* Upload area */}
      {/* Upload Form */}
      {!readOnly && (
        <div className="member-editor-card glass mb-6" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="input-group" style={{ flex: '1', minWidth: '200px', margin: 0 }}>
              <label>{t('logs.photo_caption_label')}</label>
              <input
                type="text"
                placeholder={t('logs.photo_caption_placeholder')}
                className="input-text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                disabled={uploading}
              />
            </div>

            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            <button
              type="button"
              className="btn primary"
              onClick={triggerSelect}
              disabled={uploading}
              style={{ width: 'auto', padding: '12px 24px', display: 'flex', gap: '8px', alignItems: 'center' }}
            >
              {uploading ? (
                <span className="spin">⏳</span>
              ) : (
                <Camera size={16} />
              )}
              {uploading ? t('logs.photo_processing') : t('logs.photo_btn')}
            </button>
          </div>
        </div>
      )}

      {/* Photo Grid */}
      {decryptedPhotos.length === 0 ? (
        <div className="dashboard-status-msg">{t('logs.no_photos')}</div>
      ) : (
        <div className="photo-attachments-grid">
          {decryptedPhotos.map((photo) => (
            <div key={photo.payloadId} className="photo-card glass">
              <div className="photo-container">
                <img src={photo.image} alt={photo.caption || 'Attachment'} loading="lazy" />
                {!readOnly && (
                  <button
                    type="button"
                    className="photo-btn-delete"
                    onClick={() => handleDelete(photo.payloadId)}
                    title="Remove photo"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {photo.caption && (
                <div className="photo-caption-bar">
                  <span>{photo.caption}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
