import { useEffect, useState, type ReactNode } from 'react'
import {
  fetchAdminMe,
  fetchAdminSummary,
  fetchAdminTimeSeries,
  type AdminSummary,
  type AdminTimeSeriesResponse,
  type AdminTimeBucket
} from '../services/adminApi.js'
import { BarChart2, Bookmark, ChevronLeft, Image, MapPin, Mic, Users } from 'lucide-react'

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function KpiCard({
  icon,
  label,
  value
}: {
  icon: ReactNode
  label: string
  value: number
}) {
  return (
    <div className="stats-kpi-card glass">
      <div className="stats-kpi-icon">{icon}</div>
      <div className="stats-kpi-body">
        <span className="stats-kpi-label">{label}</span>
        <span className="stats-kpi-value">{formatNumber(value)}</span>
      </div>
    </div>
  )
}

function TimeSeriesChart({
  title,
  seriesKey,
  data
}: {
  title: string
  seriesKey: string
  data: AdminTimeSeriesResponse | null
}) {
  if (!data) {
    return null
  }

  const metric = data.series.find((s) => s.metric === seriesKey)
  if (!metric || metric.points.length === 0) {
    return (
      <div className="form-card glass">
        <div className="form-header">
          <BarChart2 className="form-icon" />
          <h2>{title}</h2>
        </div>
        <p className="dashboard-status-msg">Keine Daten im gewählten Zeitraum.</p>
      </div>
    )
  }

  const max = metric.points.reduce((acc, p) => (p.count > acc ? p.count : acc), 0) || 1

  return (
    <div className="form-card glass">
      <div className="form-header">
        <BarChart2 className="form-icon" />
        <h2>{title}</h2>
      </div>
      <div className="stats-bar-chart" role="img" aria-label={title}>
        {metric.points.map((point) => {
          const heightPct = Math.max(2, (point.count / max) * 100)
          return (
            <div key={point.date} className="stats-bar-column" title={`${point.date}: ${point.count}`}>
              <span className="stats-bar-value">{point.count > 0 ? String(point.count) : ''}</span>
              <div className="stats-bar-track">
                <div className="stats-bar stats-bar--distance" style={{ height: `${heightPct}%` }} />
              </div>
              <span className="stats-bar-label">{point.date.slice(5)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface AdminDashboardProps {
  onBack: () => void
}

export default function AdminDashboard({ onBack }: AdminDashboardProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [timeSeries, setTimeSeries] = useState<AdminTimeSeriesResponse | null>(null)
  const [bucket, setBucket] = useState<AdminTimeBucket>('day')
  const [windowDays, setWindowDays] = useState(90)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)

        await fetchAdminMe()
        const [summaryRes, tsRes] = await Promise.all([
          fetchAdminSummary(),
          fetchAdminTimeSeries({ bucket, windowDays })
        ])

        if (!cancelled) {
          setSummary(summaryRes)
          setTimeSeries(tsRes)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error && err.message ? err.message : 'Fehler beim Laden des Admin-Dashboards'
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [bucket, windowDays])

  if (loading && !summary) {
    return (
      <div className="admin-page">
        <p className="dashboard-status-msg">Admin-Dashboard wird geladen…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-page">
        <header className="admin-header">
          <button type="button" className="btn-back" onClick={onBack}>
            <ChevronLeft size={16} />
            Zur App
          </button>
        </header>
        <p className="dashboard-status-msg">{error}</p>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="admin-page">
        <p className="dashboard-status-msg">Keine Admin-Daten verfügbar.</p>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-left">
          <button type="button" className="btn-back" onClick={onBack}>
            <ChevronLeft size={16} />
            Zur App
          </button>
          <div>
            <h1 className="admin-title">Admin-Dashboard</h1>
            <p className="admin-subtitle">
              Übersicht über Nutzung und Wachstum von Kapteins Daagbok.
            </p>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <section className="stats-kpi-grid admin-kpi-grid">
          <KpiCard icon={<Users size={20} />} label="Registrierte Benutzer" value={summary.totalUsers} />
          <KpiCard icon={<Bookmark size={20} />} label="Logbücher" value={summary.totalLogbooks} />
          <KpiCard icon={<Image size={20} />} label="Fotos" value={summary.totalPhotos} />
          <KpiCard icon={<Mic size={20} />} label="Sprachmemos" value={summary.totalVoiceMemos} />
          <KpiCard icon={<MapPin size={20} />} label="GPS-Tracks" value={summary.totalGpsTracks} />
          <KpiCard
            icon={<BarChart2 size={20} />}
            label="Einträge mit AI-Zusammenfassung"
            value={summary.aiSummaryEntries}
          />
        </section>

        <section className="admin-controls">
          <div className="admin-control-group">
            <span className="admin-control-label">Zeitraum</span>
            <div className="admin-control-buttons">
              {[30, 90, 365].map((days) => (
                <button
                  key={days}
                  type="button"
                  className={days === windowDays ? 'btn primary' : 'btn secondary'}
                  onClick={() => setWindowDays(days)}
                >
                  {days} Tage
                </button>
              ))}
            </div>
          </div>
          <div className="admin-control-group">
            <span className="admin-control-label">Aggregation</span>
            <div className="admin-control-buttons">
              {(['day', 'week', 'month'] as AdminTimeBucket[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  className={b === bucket ? 'btn primary' : 'btn secondary'}
                  onClick={() => setBucket(b)}
                >
                  {b === 'day' ? 'Tag' : b === 'week' ? 'Woche' : 'Monat'}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="admin-charts-grid">
          <TimeSeriesChart title="Neue Benutzer" seriesKey="users_created" data={timeSeries} />
          <TimeSeriesChart title="Neue Logbücher" seriesKey="logbooks_created" data={timeSeries} />
          <TimeSeriesChart title="Foto-Aktivität" seriesKey="photos_updated" data={timeSeries} />
        </section>
      </main>
    </div>
  )
}
