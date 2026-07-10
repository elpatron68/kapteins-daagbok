import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { patchEntryEvents } from '../services/quickEventLog.js'
import { deleteEntryVoiceMemo } from '../services/voiceAttachments.js'
import { parseLiveVoiceRemark } from '../utils/liveEventCodes.js'
import { normalizeLogEvent, type LogEventPayload } from '../utils/logEntryPayload.js'
import { useDialog } from '../components/ModalDialog.tsx'

interface UseEventEditorOptions {
  logbookId: string
  entryId: string | null
  events: LogEventPayload[]
  onEventsChange: (events: LogEventPayload[]) => void
  hasSkipperSignature?: boolean
}

export function useEventEditor({
  logbookId,
  entryId,
  events,
  onEventsChange,
  hasSkipperSignature = false
}: UseEventEditorOptions) {
  const { t } = useTranslation()
  const { showAlert, showConfirm } = useDialog()

  const persistEvents = useCallback(async (nextEvents: LogEventPayload[]) => {
    if (!entryId) throw new Error('No entry selected')
    const { hadSignature } = await patchEntryEvents(logbookId, entryId, nextEvents)
    onEventsChange(nextEvents)
    if (hadSignature || hasSkipperSignature) {
      void showAlert(
        t('logs.sign_cleared_skipper_re_sign'),
        t('logs.sign_cleared_skipper_re_sign_title')
      )
    }
  }, [entryId, hasSkipperSignature, logbookId, onEventsChange, showAlert, t])

  const updateEvent = useCallback(async (index: number, patch: Partial<LogEventPayload>) => {
    if (!entryId) return
    const current = events[index]
    if (!current) return
    const updated = normalizeLogEvent({ ...current, ...patch })
    const nextEvents = events.map((ev, idx) => (idx === index ? updated : ev))
    await persistEvents(nextEvents)
  }, [entryId, events, persistEvents])

  const deleteEvent = useCallback(async (index: number) => {
    if (!entryId) return
    const confirmed = await showConfirm(
      t('logs.delete_event_confirm'),
      t('logs.delete_event'),
      t('logs.confirm_yes'),
      t('logs.confirm_no')
    )
    if (!confirmed) return

    const voiceId = parseLiveVoiceRemark(events[index]?.remarks?.trim() ?? '')
    const nextEvents = events.filter((_, idx) => idx !== index)
    if (voiceId) {
      await deleteEntryVoiceMemo(logbookId, voiceId)
    }
    await persistEvents(nextEvents)
  }, [entryId, events, logbookId, persistEvents, showConfirm, t])

  return { updateEvent, deleteEvent }
}
