import { apiJson } from './api.js'

const ADMIN_BASE = '/api/admin'

export interface AdminMe {
  isAdmin: boolean
  userId: string
}

export interface AdminSummary {
  totalUsers: number
  totalLogbooks: number
  totalPhotos: number
  totalVoiceMemos: number
  totalGpsTracks: number
  totalCollaborations: number
  totalInvitations: number
  aiSummaryEntries: number
}

export type AdminTimeBucket = 'day' | 'week' | 'month'

export interface AdminTimeSeriesPoint {
  date: string
  count: number
}

export interface AdminTimeSeriesMetric {
  metric: string
  points: AdminTimeSeriesPoint[]
}

export interface AdminTimeSeriesResponse {
  bucket: AdminTimeBucket
  windowDays: number
  series: AdminTimeSeriesMetric[]
}

export async function fetchAdminMe(): Promise<AdminMe> {
  return await apiJson<AdminMe>(`${ADMIN_BASE}/me`)
}

export async function fetchAdminSummary(): Promise<AdminSummary> {
  return await apiJson<AdminSummary>(`${ADMIN_BASE}/summary`)
}

export async function fetchAdminTimeSeries(
  params: { bucket?: AdminTimeBucket; windowDays?: number } = {}
): Promise<AdminTimeSeriesResponse> {
  const search = new URLSearchParams()
  if (params.bucket) {
    search.set('bucket', params.bucket)
  }
  if (params.windowDays && Number.isFinite(params.windowDays)) {
    search.set('window', String(params.windowDays))
  }
  const query = search.toString()
  const url = query ? `${ADMIN_BASE}/timeseries?${query}` : `${ADMIN_BASE}/timeseries`
  return await apiJson<AdminTimeSeriesResponse>(url)
}

