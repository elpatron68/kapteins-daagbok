import { apiJson } from './api.js'

export interface LogbookAccess {
  isOwner: boolean
  role: 'OWNER' | 'READ' | 'WRITE'
  writeCollaboratorCount: number
}

export async function getLogbookAccess(logbookId: string): Promise<LogbookAccess | null> {
  if (!localStorage.getItem('active_userid') || !navigator.onLine) return null

  try {
    return await apiJson<LogbookAccess>(`/api/logbooks/${logbookId}/access`)
  } catch {
    return null
  }
}
