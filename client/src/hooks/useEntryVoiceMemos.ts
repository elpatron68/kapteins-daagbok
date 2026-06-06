import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { getLogbookKey } from '../services/logbookKeys.js'
import { decryptJson } from '../services/crypto.js'
import type { PreloadedVoiceMemo } from '../components/VoiceMemoPlayer.tsx'

export function useEntryVoiceMemos(
  logbookId: string,
  entryId: string | null,
  preloaded?: PreloadedVoiceMemo[]
): Map<string, PreloadedVoiceMemo> {
  const localMemos = useLiveQuery(
    () => (entryId ? db.voiceMemos.where({ entryId }).toArray() : []),
    [entryId]
  )

  const [lookup, setLookup] = useState<Map<string, PreloadedVoiceMemo>>(new Map())

  useEffect(() => {
    if (preloaded && preloaded.length > 0) {
      const map = new Map<string, PreloadedVoiceMemo>()
      for (const m of preloaded) {
        map.set(m.payloadId, m)
      }
      setLookup(map)
      return
    }

    if (!entryId || !localMemos) {
      setLookup(new Map())
      return
    }

    let cancelled = false
    void (async () => {
      const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
      if (!masterKey || cancelled) return

      const map = new Map<string, PreloadedVoiceMemo>()
      for (const row of localMemos) {
        try {
          const decrypted = await decryptJson(row.encryptedData, row.iv, row.tag, masterKey)
          if (!decrypted?.audio) continue
          map.set(row.payloadId, {
            payloadId: row.payloadId,
            audio: String(decrypted.audio),
            mimeType: decrypted.mimeType ? String(decrypted.mimeType) : undefined,
            durationSec: typeof decrypted.durationSec === 'number' ? decrypted.durationSec : undefined,
            caption: decrypted.caption ? String(decrypted.caption) : '',
            transcribed: decrypted.transcribed !== false
          })
        } catch {
          // skip corrupt memo
        }
      }
      if (!cancelled) setLookup(map)
    })()

    return () => {
      cancelled = true
    }
  }, [localMemos, entryId, logbookId, preloaded])

  return lookup
}
