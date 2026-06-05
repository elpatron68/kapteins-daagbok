const ADMIN_ENV_KEY = 'ADMIN_USER_IDS'

export function getAdminUserIds(): Set<string> {
  const raw = process.env[ADMIN_ENV_KEY]
  if (!raw) {
    return new Set()
  }

  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)

  if (ids.length === 0) {
    return new Set()
  }

  return new Set(ids)
}

export function isAdminUserId(userId: string): boolean {
  const adminIds = getAdminUserIds()
  return adminIds.has(userId)
}

