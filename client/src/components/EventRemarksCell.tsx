import { useTranslation } from 'react-i18next'
import type { LogEventPayload } from '../utils/logEntryPayload.js'
import { parseLiveVoiceRemark } from '../utils/liveEventCodes.js'
import { formatEventSummary } from '../utils/formatEventSummary.js'
import VoiceMemoPlayer, { type PreloadedVoiceMemo } from './VoiceMemoPlayer.tsx'

interface EventRemarksCellProps {
  event: LogEventPayload
  logbookId: string
  voiceMemoLookup?: Map<string, PreloadedVoiceMemo>
}

export default function EventRemarksCell({
  event,
  logbookId,
  voiceMemoLookup
}: EventRemarksCellProps) {
  const { t } = useTranslation()
  const voiceId = parseLiveVoiceRemark(event.remarks.trim())
  const preloaded = voiceId ? voiceMemoLookup?.get(voiceId) : undefined

  let summary = formatEventSummary(event, t)
  if (voiceId && preloaded?.caption) {
    summary = t('logs.live_voice_entry', { caption: preloaded.caption })
  }

  return (
    <div className={`event-remarks-cell${voiceId ? ' event-remarks-cell--voice' : ''}`}>
      <span>{summary}</span>
      {voiceId && (
        <VoiceMemoPlayer
          audioId={voiceId}
          logbookId={logbookId}
          preloaded={preloaded}
          compact
        />
      )}
    </div>
  )
}
