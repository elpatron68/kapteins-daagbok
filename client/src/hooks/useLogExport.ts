import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey, hasUnlockedLocalCrypto } from '../services/auth.js'
import { getLogbookKey } from '../services/logbookKeys.js'
import { decryptJson } from '../services/crypto.js'
import { downloadCsv, shareCsv } from '../services/csvExport.js'
import { downloadLogbookPagePdf } from '../services/pdfExport.js'
import { buildZipArchive } from '../services/logbookBackup/zipArchive.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import { getErrorMessage } from '../utils/errors.js'

export interface LogExportEntryItem {
  id: string
  date: string
  dayOfTravel: string
  departure: string
  destination: string
}

interface UseLogExportOptions {
  logbookId: string
  entries: LogExportEntryItem[]
  readOnly?: boolean
  preloadedYacht?: { name?: string } | null
  preloadedEntries?: any[]
}

function dataUrlToUint8Array(dataUrl: string): { data: Uint8Array; ext: string } {
  const parts = dataUrl.split(',')
  if (parts.length < 2) throw new Error('Invalid data URL')
  const meta = parts[0]
  const base64Data = parts[1]
  let ext = 'jpg'
  const mimeMatch = meta.match(/data:([^;]+)/)
  if (mimeMatch) {
    const mime = mimeMatch[1]
    if (mime === 'image/png') ext = 'png'
    else if (mime === 'image/gif') ext = 'gif'
    else if (mime === 'image/webp') ext = 'webp'
    else if (mime === 'image/heic') ext = 'heic'
    else if (mime === 'image/heif') ext = 'heif'
  }
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return { data: bytes, ext }
}

function sanitizeFilename(str: string): string {
  return str.replace(/[^\w\s-]/gi, '').trim().replace(/\s+/g, '_').slice(0, 30)
}

export function useLogExport({
  logbookId,
  entries,
  readOnly = false,
  preloadedYacht,
  preloadedEntries
}: UseLogExportOptions) {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const logbookTitle =
    preloadedYacht?.name || localStorage.getItem('active_logbook_title') || 'Logbook'

  const handleDownloadCsv = useCallback(async () => {
    setExporting(true)
    setError(null)
    try {
      if (readOnly && preloadedEntries && preloadedYacht) {
        await downloadCsv(logbookId, logbookTitle, { yacht: preloadedYacht, entries: preloadedEntries })
      } else {
        await downloadCsv(logbookId, logbookTitle)
      }
      trackPlausibleEvent(PlausibleEvents.CSV_EXPORTED)
    } catch (err: unknown) {
      console.error('Failed to download CSV:', err)
      setError(getErrorMessage(err, t('errors.export_failed')))
    } finally {
      setExporting(false)
    }
  }, [logbookId, logbookTitle, preloadedEntries, preloadedYacht, readOnly, t])

  const handleShareCsv = useCallback(async () => {
    setExporting(true)
    setError(null)
    try {
      if (readOnly && preloadedEntries && preloadedYacht) {
        await shareCsv(logbookId, logbookTitle, { yacht: preloadedYacht, entries: preloadedEntries })
      } else {
        await shareCsv(logbookId, logbookTitle)
      }
      trackPlausibleEvent(PlausibleEvents.CSV_SHARED)
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'share_unsupported') {
        if (readOnly && preloadedEntries && preloadedYacht) {
          await downloadCsv(logbookId, logbookTitle, { yacht: preloadedYacht, entries: preloadedEntries })
        } else {
          await downloadCsv(logbookId, logbookTitle)
        }
        setError(t('logs.share_unsupported'))
      } else {
        console.error('Failed to share CSV:', err)
        setError(getErrorMessage(err, t('errors.export_failed')))
      }
    } finally {
      setExporting(false)
    }
  }, [logbookId, logbookTitle, preloadedEntries, preloadedYacht, readOnly, t])

  const handleDownloadPdf = useCallback(async (entryId: string, date: string) => {
    setExporting(true)
    setError(null)
    try {
      if (readOnly && preloadedEntries && preloadedYacht) {
        const fullEntry = preloadedEntries.find((entry) => (entry.payloadId || entry.id) === entryId)
        await downloadLogbookPagePdf(logbookId, entryId, date, { yacht: preloadedYacht, entry: fullEntry })
      } else {
        await downloadLogbookPagePdf(logbookId, entryId, date)
      }
      trackPlausibleEvent(PlausibleEvents.PDF_EXPORTED, { scope: 'entry' })
    } catch (err: unknown) {
      console.error('Failed to download PDF:', err)
      setError(getErrorMessage(err, t('errors.export_failed')))
    } finally {
      setExporting(false)
    }
  }, [logbookId, preloadedEntries, preloadedYacht, readOnly, t])

  const handleDownloadPhotosZip = useCallback(async () => {
    if (!hasUnlockedLocalCrypto()) return
    setExporting(true)
    setError(null)
    try {
      const masterKey = (await getLogbookKey(logbookId)) || getActiveMasterKey()
      if (!masterKey) throw new Error('Encryption key not found. Please log in.')

      const localPhotos = await db.photos.where({ logbookId }).toArray()
      if (localPhotos.length === 0) {
        setError(t('logs.no_photos_to_download'))
        return
      }

      const entryMap = new Map(entries.map((e) => [e.id, e]))
      const files: Record<string, Uint8Array> = {}
      const usedNames = new Set<string>()

      for (const photo of localPhotos) {
        const decrypted = await decryptJson(photo.encryptedData, photo.iv, photo.tag, masterKey)
        if (!decrypted || !decrypted.image) continue

        const { data, ext } = dataUrlToUint8Array(decrypted.image)
        let fileBase = `photo_${photo.payloadId}`
        const entry = entryMap.get(photo.entryId)
        if (entry) {
          const parts = [entry.date || 'unknown-date']
          if (entry.dayOfTravel) parts.push(`day-${entry.dayOfTravel}`)
          const sanitizedCaption = decrypted.caption ? sanitizeFilename(decrypted.caption) : ''
          if (sanitizedCaption) parts.push(sanitizedCaption)
          fileBase = parts.join('_')
        } else if (decrypted.caption) {
          fileBase = `photo_${sanitizeFilename(decrypted.caption)}`
        }

        let candidate = `${fileBase}.${ext}`
        let counter = 1
        while (usedNames.has(candidate.toLowerCase())) {
          candidate = `${fileBase}_${counter}.${ext}`
          counter++
        }
        usedNames.add(candidate.toLowerCase())
        files[candidate] = data
      }

      if (Object.keys(files).length === 0) {
        setError(t('logs.no_photos_to_download'))
        return
      }

      const zipBytes = buildZipArchive(files)
      const blob = new Blob([zipBytes as BlobPart], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const safeTitle = logbookTitle.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'logbook'
      const filename = `${safeTitle}-photos-${new Date().toISOString().slice(0, 10)}.zip`
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      console.error('Failed to download photos ZIP:', err)
      setError(getErrorMessage(err, t('errors.export_failed')))
    } finally {
      setExporting(false)
    }
  }, [entries, logbookId, logbookTitle, t])

  return {
    exporting,
    error,
    setError,
    handleDownloadCsv,
    handleShareCsv,
    handleDownloadPdf,
    handleDownloadPhotosZip,
    canExportPhotosZip: hasUnlockedLocalCrypto()
  }
}
