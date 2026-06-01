export interface LogbookSearchFields {
  vesselName: string
  crewNames: string[]
}

/** Match full name or any whitespace-separated part (e.g. first or last name). */
export function nameMatchesQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const normalized = name.trim().toLowerCase()
  if (!normalized) return false
  if (normalized.includes(q)) return true

  return normalized.split(/\s+/).some((part) => part.includes(q))
}

export function logbookMatchesFilter(
  lb: { title: string; updatedAt: string },
  query: string,
  locale: string,
  fields?: LogbookSearchFields
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  if (lb.title.toLowerCase().includes(q)) return true

  const updated = new Date(lb.updatedAt)
  const year = updated.getFullYear().toString()
  if (year.includes(q)) return true

  const dateLabel = updated.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).toLowerCase()
  if (dateLabel.includes(q)) return true

  if (fields?.vesselName && nameMatchesQuery(fields.vesselName, q)) return true

  if (fields?.crewNames?.some((name) => nameMatchesQuery(name, q))) return true

  return false
}
