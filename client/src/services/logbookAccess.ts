export interface LogbookAccess {
  isOwner: boolean
  role: 'OWNER' | 'READ' | 'WRITE'
  writeCollaboratorCount: number
}

export async function getLogbookAccess(logbookId: string): Promise<LogbookAccess | null> {
  const userId = localStorage.getItem('active_userid')
  if (!userId || !navigator.onLine) return null

  try {
    const res = await fetch(`/api/logbooks/${logbookId}/access`, {
      headers: { 'X-User-Id': userId }
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
