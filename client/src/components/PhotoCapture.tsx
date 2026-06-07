import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { getLogbookKey } from '../services/logbookKeys.js'
import { decryptJson } from '../services/crypto.js'
import { saveEntryPhoto, deleteEntryPhoto } from '../services/photoAttachments.js'
import { fileToCompressedJpegDataUrl } from '../utils/imageCompress.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDialog } from './ModalDialog.tsx'
import { Camera, Image, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react'
import { probeCameraAvailability } from '../utils/cameraAvailability.js'

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
  const [collapsed, setCollapsed] = useState(true)
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [decryptedPhotos, setDecryptedPhotos] = useState<DecryptedPhoto[]>([])
  const [hasCamera, setHasCamera] = useState(false)
  const [maximizedPhoto, setMaximizedPhoto] = useState<DecryptedPhoto | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!maximizedPhoto) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMaximizedPhoto(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [maximizedPhoto])

  useEffect(() => {
    let cancelled = false
    probeCameraAvailability().then((avail) => {
      if (!cancelled) {
        setHasCamera(avail === 'available')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

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

    try {
      const compressedBase64 = await fileToCompressedJpegDataUrl(file)
      await saveEntryPhoto({
        logbookId,
        entryId,
        imageDataUrl: compressedBase64,
        caption: caption.trim(),
        analyticsContext: 'logbook'
      })
      setCaption('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: unknown) {
      console.error('Failed to process image:', err)
      setError(err instanceof Error ? err.message : 'Failed to process image')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (photoId: string) => {
    if (await showConfirm(t('logs.photo_delete_confirm'), t('logs.photos_title'), t('logs.confirm_yes'), t('logs.confirm_no'))) {
      try {
        await deleteEntryPhoto(logbookId, photoId)
      } catch (err: unknown) {
        console.error('Failed to delete photo:', err)
      }
    }
  }

  const triggerGallerySelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const triggerCameraSelect = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click()
    }
  }

  return (
    <div className="form-card mt-6">
      <div
        className="form-header accordion-header"
        onClick={() => setCollapsed(!collapsed)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setCollapsed(!collapsed)
          }
        }}
        role="button"
        aria-expanded={!collapsed}
        tabIndex={0}
      >
        <div className="accordion-header-title">
          <Camera size={20} className="form-icon" />
          <h3>{t('logs.photos_title')}</h3>
        </div>
        {collapsed ? (
          <ChevronDown size={20} className="accordion-chevron" />
        ) : (
          <ChevronUp size={20} className="accordion-chevron" />
        )}
      </div>

      {!collapsed && (
        <div style={{ marginTop: '16px' }}>
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
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={cameraInputRef}
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />

                {hasCamera ? (
                  <>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={triggerCameraSelect}
                      disabled={uploading}
                      style={{ width: 'auto', padding: '12px 20px', display: 'flex', gap: '8px', alignItems: 'center' }}
                    >
                      {uploading ? (
                        <span className="spin">⏳</span>
                      ) : (
                        <Camera size={16} />
                      )}
                      {uploading ? t('logs.photo_processing') : t('logs.photo_camera_btn')}
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={triggerGallerySelect}
                      disabled={uploading}
                      style={{ width: 'auto', padding: '12px 20px', display: 'flex', gap: '8px', alignItems: 'center' }}
                    >
                      {uploading ? (
                        <span className="spin">⏳</span>
                      ) : (
                        <Image size={16} />
                      )}
                      {uploading ? t('logs.photo_processing') : t('logs.photo_gallery_btn')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={triggerGallerySelect}
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
                )}
              </div>
            </div>
          )}

          {/* Photo Grid */}
          {decryptedPhotos.length === 0 ? (
            <div className="dashboard-status-msg">{t('logs.no_photos')}</div>
          ) : (
            <div className="photo-attachments-grid">
              {decryptedPhotos.map((photo) => (
                <div
                  key={photo.payloadId}
                  className="photo-card glass"
                  onClick={() => setMaximizedPhoto(photo)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="photo-container">
                    <img src={photo.image} alt={photo.caption || 'Attachment'} loading="lazy" />
                    {!readOnly && (
                      <button
                        type="button"
                        className="photo-btn-delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(photo.payloadId)
                        }}
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
      )}

      {maximizedPhoto && createPortal(
        <div
          className="photo-maximized-overlay"
          onClick={() => setMaximizedPhoto(null)}
        >
          <div className="photo-maximized-container" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="photo-maximized-close"
              onClick={() => setMaximizedPhoto(null)}
              aria-label={t('common.close') || 'Close'}
            >
              <X size={24} />
            </button>
            <img
              src={maximizedPhoto.image}
              alt={maximizedPhoto.caption || 'Maximized Attachment'}
              className="photo-maximized-img"
            />
            {maximizedPhoto.caption && (
              <div className="photo-maximized-caption">
                {maximizedPhoto.caption}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
