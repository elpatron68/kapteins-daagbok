import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart2, Anchor, Droplets, Fuel, Sailboat, Gauge, Timer } from 'lucide-react'
import MultiTrackMap from './MultiTrackMap.tsx'
import {
  formatLiters,
  formatHours,
  formatNm,
  loadAccountStats,
  loadLogbookStats,
  type LogbookStatsSummary,
  type StatsTotals,
  type TravelDayStats
} from '../services/statsAggregation.js'
import { compareTravelDaysChronological } from '../utils/logEntryTankLevels.js'
import { formatFuelPerMotorHour } from '../utils/fuelStats.js'
import {
  loadLogbookEventSeries,
  type EventSeriesPoint,
  type EventSeriesSummary
} from '../services/eventSeriesAggregation.js'

interface StatsDashboardProps {
  logbookId: string
  logbookTitle: string
}

type StatsScope = 'logbook' | 'account'

function maxBarValue(days: TravelDayStats[], pick: (d: TravelDayStats) => number): number {
  if (days.length === 0) return 1
  return Math.max(1, ...days.map(pick))
}

function KpiCard({
  icon,
  label,
  value,
  unit
}: {
  icon: ReactNode
  label: string
  value: string
  unit?: string
}) {
  return (
    <div className="stats-kpi-card glass">
      <div className="stats-kpi-icon">{icon}</div>
      <div className="stats-kpi-body">
        <span className="stats-kpi-label">{label}</span>
        <span className="stats-kpi-value">
          {value}
          {unit ? <span className="stats-kpi-unit">{unit}</span> : null}
        </span>
      </div>
    </div>
  )
}

function TotalsGrid({ totals }: { totals: StatsTotals }) {
  const { t } = useTranslation()

  return (
    <div className="stats-kpi-grid">
      <KpiCard
        icon={<Gauge size={20} />}
        label={t('stats.total_distance')}
        value={formatNm(totals.totalDistanceNm)}
        unit={t('stats.unit_nm')}
      />
      <KpiCard
        icon={<Anchor size={20} />}
        label={t('stats.travel_days')}
        value={String(totals.travelDayCount)}
      />
      <KpiCard
        icon={<Sailboat size={20} />}
        label={t('stats.sail_distance')}
        value={formatNm(totals.sailDistanceNm)}
        unit={t('stats.unit_nm')}
      />
      <KpiCard
        icon={<Gauge size={20} />}
        label={t('stats.motor_distance')}
        value={formatNm(totals.motorDistanceNm)}
        unit={t('stats.unit_nm')}
      />
      <KpiCard
        icon={<Timer size={20} />}
        label={t('stats.motor_hours_total')}
        value={formatHours(totals.totalMotorHours)}
        unit={t('stats.unit_h')}
      />
      <KpiCard
        icon={<Fuel size={20} />}
        label={t('stats.fuel_total')}
        value={formatLiters(totals.totalFuelL)}
        unit={t('stats.unit_l')}
      />
      {totals.fuelPerMotorHourL != null && (
        <KpiCard
          icon={<Timer size={20} />}
          label={t('stats.fuel_per_motor_hour')}
          value={formatFuelPerMotorHour(totals.fuelPerMotorHourL)}
          unit={`${t('stats.unit_l')}/${t('stats.unit_h')}`}
        />
      )}
      <KpiCard
        icon={<Droplets size={20} />}
        label={t('stats.water_total')}
        value={formatLiters(totals.totalFreshwaterL)}
        unit={t('stats.unit_l')}
      />
    </div>
  )
}

function DailyBarChart({
  days,
  valueFn,
  barClass,
  formatValue
}: {
  days: TravelDayStats[]
  valueFn: (d: TravelDayStats) => number
  barClass: string
  formatValue: (v: number) => string
}) {
  const { t } = useTranslation()
  const max = maxBarValue(days, valueFn)

  return (
    <div className="stats-bar-chart" role="img" aria-label={t('stats.daily_etmal')}>
      {days.map((day) => {
        const value = valueFn(day)
        const heightPct = max > 0 ? Math.max(2, (value / max) * 100) : 0
        const label = day.date
          ? new Date(day.date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
          : t('stats.day_label', { day: day.dayOfTravel })

        return (
          <div key={day.entryId} className="stats-bar-column" title={`${label}: ${formatValue(value)}`}>
            <span className="stats-bar-value">{value > 0 ? formatValue(value) : ''}</span>
            <div className="stats-bar-track">
              <div className={`stats-bar ${barClass}`} style={{ height: `${heightPct}%` }} />
            </div>
            <span className="stats-bar-label">{label}</span>
            <span className="stats-bar-sublabel">{t('stats.day_label', { day: day.dayOfTravel })}</span>
          </div>
        )
      })}
    </div>
  )
}

function ConsumptionChart({ days }: { days: TravelDayStats[] }) {
  const { t } = useTranslation()
  const max = maxBarValue(days, (d) => Math.max(d.fuelConsumptionL, d.freshwaterConsumptionL))

  return (
    <div className="stats-bar-chart stats-consumption-chart" role="img" aria-label={t('stats.daily_consumption')}>
      {days.map((day) => {
        const fuelH = max > 0 ? Math.max(2, (day.fuelConsumptionL / max) * 100) : 0
        const waterH = max > 0 ? Math.max(2, (day.freshwaterConsumptionL / max) * 100) : 0
        const label = day.date
          ? new Date(day.date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
          : t('stats.day_label', { day: day.dayOfTravel })

        return (
          <div key={day.entryId} className="stats-bar-column stats-bar-column--grouped">
            <div className="stats-bar-group">
              <div className="stats-bar-track stats-bar-track--short">
                <div className="stats-bar stats-bar--fuel" style={{ height: `${fuelH}%` }} />
              </div>
              <div className="stats-bar-track stats-bar-track--short">
                <div className="stats-bar stats-bar--water" style={{ height: `${waterH}%` }} />
              </div>
            </div>
            <span className="stats-bar-label">{label}</span>
          </div>
        )
      })}
      <div className="stats-consumption-legend">
        <span><span className="stats-legend-swatch stats-bar--fuel" /> {t('stats.fuel_legend')}</span>
        <span><span className="stats-legend-swatch stats-bar--water" /> {t('stats.water_legend')}</span>
      </div>
    </div>
  )
}

function PropulsionBreakdown({ totals }: { totals: StatsTotals }) {
  const { t } = useTranslation()
  const total = totals.sailDistanceNm + totals.motorDistanceNm + totals.unknownPropulsionNm
  if (total <= 0) return null

  const sailPct = (totals.sailDistanceNm / total) * 100
  const motorPct = (totals.motorDistanceNm / total) * 100
  const unknownPct = (totals.unknownPropulsionNm / total) * 100

  return (
    <div className="stats-propulsion">
      <div className="stats-propulsion-bar" role="img" aria-label={t('stats.propulsion_title')}>
        {totals.sailDistanceNm > 0 && (
          <div className="stats-propulsion-segment stats-propulsion-segment--sail" style={{ width: `${sailPct}%` }} />
        )}
        {totals.motorDistanceNm > 0 && (
          <div className="stats-propulsion-segment stats-propulsion-segment--motor" style={{ width: `${motorPct}%` }} />
        )}
        {totals.unknownPropulsionNm > 0 && (
          <div className="stats-propulsion-segment stats-propulsion-segment--unknown" style={{ width: `${unknownPct}%` }} />
        )}
      </div>
      <div className="stats-propulsion-labels">
        <span>{t('stats.sail_distance')}: {formatNm(totals.sailDistanceNm)} {t('stats.unit_nm')} ({sailPct.toFixed(0)}%)</span>
        <span>{t('stats.motor_distance')}: {formatNm(totals.motorDistanceNm)} {t('stats.unit_nm')} ({motorPct.toFixed(0)}%)</span>
        {totals.unknownPropulsionNm > 0 && (
          <span>{t('stats.unknown_propulsion')}: {formatNm(totals.unknownPropulsionNm)} {t('stats.unit_nm')}</span>
        )}
      </div>
      <p className="stats-hint">{t('stats.propulsion_hint')}</p>
    </div>
  )
}

function EventSeriesList({ title, points, emptyLabel }: { title: string; points: EventSeriesPoint[]; emptyLabel: string }) {
  if (points.length === 0) {
    return (
      <div className="stats-event-series-block">
        <h4 className="stats-section-subtitle">{title}</h4>
        <p className="stats-section-sub">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div className="stats-event-series-block">
      <h4 className="stats-section-subtitle">{title}</h4>
      <ul className="stats-event-series-list">
        {points.map((point, idx) => (
          <li key={`${point.entryId}-${point.time}-${idx}`} className="stats-event-series-item">
            <span className="stats-event-series-when">
              {new Date(point.date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}
              {' · '}
              {point.time}
            </span>
            <span className="stats-event-series-value">{point.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EventSeriesPanel({ series }: { series: EventSeriesSummary }) {
  const { t } = useTranslation()
  const motorPoints = series.motor.map((point) => ({
    ...point,
    summary: point.summary === 'start'
      ? t('logs.live_motor_start')
      : t('logs.live_motor_stop')
  }))

  return (
    <div className="member-editor-card glass mt-6">
      <h3 className="stats-section-title">{t('stats.event_series_title')}</h3>
      <p className="stats-section-sub">{t('stats.event_series_hint')}</p>
      <EventSeriesList title={t('stats.event_series_pressure')} points={series.pressure} emptyLabel={t('stats.event_series_empty')} />
      <EventSeriesList title={t('stats.event_series_wind')} points={series.wind} emptyLabel={t('stats.event_series_empty')} />
      <EventSeriesList title={t('stats.event_series_motor')} points={motorPoints} emptyLabel={t('stats.event_series_empty')} />
    </div>
  )
}

function LogbookScopeView({
  summary,
  eventSeries
}: {
  summary: LogbookStatsSummary
  eventSeries: EventSeriesSummary | null
}) {
  const { t } = useTranslation()
  const { travelDays, routePorts, trackSegments, totals } = summary

  if (travelDays.length === 0) {
    return <div className="dashboard-status-msg">{t('stats.no_data')}</div>
  }

  return (
    <>
      <TotalsGrid totals={totals} />

      {routePorts.length > 0 && (
        <div className="member-editor-card glass mt-6">
          <h3 className="stats-section-title">{t('stats.route_overview')}</h3>
          <p className="stats-route-chain">
            {routePorts.map((port, idx) => (
              <span key={`${port}-${idx}`}>
                {idx > 0 && <span className="stats-route-arrow"> → </span>}
                {port}
              </span>
            ))}
          </p>
        </div>
      )}

      {trackSegments.length > 0 && (
        <div className="member-editor-card glass mt-6">
          <h3 className="stats-section-title">{t('stats.route_map_title')}</h3>
          <MultiTrackMap segments={trackSegments} />
        </div>
      )}

      <div className="member-editor-card glass mt-6">
        <h3 className="stats-section-title">{t('stats.daily_etmal')}</h3>
        <p className="stats-section-sub">
          {t('stats.avg_distance')}: {formatNm(totals.avgDistancePerDayNm)} {t('stats.unit_nm')}
        </p>
        <DailyBarChart
          days={travelDays}
          valueFn={(d) => d.distanceNm}
          barClass="stats-bar--distance"
          formatValue={formatNm}
        />
      </div>

      <div className="member-editor-card glass mt-6">
        <h3 className="stats-section-title">{t('stats.daily_motor_hours')}</h3>
        <p className="stats-section-sub">
          {t('stats.avg_motor_hours')}: {formatHours(totals.avgMotorHoursPerDay)} {t('stats.unit_h')}
          {totals.fuelPerMotorHourL != null && (
            <>
              {' · '}
              {t('stats.fuel_per_motor_hour')}: {formatFuelPerMotorHour(totals.fuelPerMotorHourL)} {t('stats.unit_l')}/{t('stats.unit_h')}
            </>
          )}
        </p>
        <DailyBarChart
          days={travelDays}
          valueFn={(d) => d.motorHours}
          barClass="stats-bar--motor-hours"
          formatValue={formatHours}
        />
        {travelDays.some((d) => d.fuelPerMotorHourL != null) && (
          <>
            <h4 className="stats-section-subtitle mt-4">{t('stats.daily_fuel_per_motor_hour')}</h4>
            <DailyBarChart
              days={travelDays}
              valueFn={(d) => d.fuelPerMotorHourL ?? 0}
              barClass="stats-bar--fuel-per-hour"
              formatValue={(v) => formatFuelPerMotorHour(v > 0 ? v : null)}
            />
          </>
        )}
      </div>

      <div className="member-editor-card glass mt-6">
        <h3 className="stats-section-title">{t('stats.daily_consumption')}</h3>
        <p className="stats-section-sub">
          {t('stats.avg_fuel')}: {formatLiters(totals.avgFuelPerDayL)} {t('stats.unit_l')}
          {' · '}
          {t('stats.avg_water')}: {formatLiters(totals.avgFreshwaterPerDayL)} {t('stats.unit_l')}
          {totals.fuelPerNmL != null && (
            <> · {t('stats.fuel_per_nm')}: {totals.fuelPerNmL} {t('stats.unit_l')}/{t('stats.unit_nm')}</>
          )}
          {totals.fuelPerMotorHourL != null && (
            <> · {t('stats.fuel_per_motor_hour')}: {formatFuelPerMotorHour(totals.fuelPerMotorHourL)} {t('stats.unit_l')}/{t('stats.unit_h')}</>
          )}
        </p>
        <ConsumptionChart days={travelDays} />
      </div>

      <div className="member-editor-card glass mt-6">
        <h3 className="stats-section-title">{t('stats.propulsion_title')}</h3>
        <PropulsionBreakdown totals={totals} />
      </div>

      {eventSeries && <EventSeriesPanel series={eventSeries} />}
    </>
  )
}

export default function StatsDashboard({ logbookId, logbookTitle }: StatsDashboardProps) {
  const { t } = useTranslation()
  const [scope, setScope] = useState<StatsScope>('logbook')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logbookStats, setLogbookStats] = useState<LogbookStatsSummary | null>(null)
  const [eventSeries, setEventSeries] = useState<EventSeriesSummary | null>(null)
  const [accountStats, setAccountStats] = useState<Awaited<ReturnType<typeof loadAccountStats>> | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [lb, acc, series] = await Promise.all([
        loadLogbookStats(logbookId, logbookTitle, true),
        loadAccountStats(false),
        loadLogbookEventSeries(logbookId)
      ])
      setLogbookStats(lb)
      setAccountStats(acc)
      setEventSeries(series)
    } catch (err: unknown) {
      console.error('Failed to load statistics:', err)
      setError(err instanceof Error ? err.message : 'Failed to load statistics.')
    } finally {
      setLoading(false)
    }
  }, [logbookId, logbookTitle])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const accountLogbooksWithDays = useMemo(
    () => accountStats?.logbooks.filter((lb) => lb.travelDays.length > 0) ?? [],
    [accountStats]
  )

  const allAccountDays = useMemo(() => {
    if (!accountStats) return []
    const days = accountStats.logbooks.flatMap((lb) => lb.travelDays)
    return [...days].sort(compareTravelDaysChronological)
  }, [accountStats])

  return (
    <div className="form-card" data-tour="stats-dashboard">
      <div className="form-header">
        <BarChart2 size={24} className="form-icon" />
        <div>
          <h2>{t('stats.title')}</h2>
          <p className="stats-subtitle">{t('stats.subtitle')}</p>
        </div>
      </div>

      <div className="stats-scope-toggle" role="tablist" aria-label={t('stats.scope_label')}>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'logbook'}
          className={`btn ${scope === 'logbook' ? 'primary' : 'secondary'}`}
          onClick={() => setScope('logbook')}
        >
          {t('stats.scope_logbook')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'account'}
          className={`btn ${scope === 'account' ? 'primary' : 'secondary'}`}
          onClick={() => setScope('account')}
        >
          {t('stats.scope_account')}
        </button>
      </div>

      {error && <div className="auth-error mt-4">{error}</div>}

      {loading ? (
        <div className="tab-placeholder mt-6">
          <BarChart2 className="header-logo spin" size={48} />
          <p>{t('stats.loading')}</p>
        </div>
      ) : scope === 'logbook' && logbookStats ? (
        <LogbookScopeView summary={logbookStats} eventSeries={eventSeries} />
      ) : scope === 'account' && accountStats ? (
        <>
          <TotalsGrid totals={accountStats.totals} />

          {accountLogbooksWithDays.length === 0 ? (
            <div className="dashboard-status-msg mt-6">{t('stats.no_data')}</div>
          ) : (
            <>
              <div className="member-editor-card glass mt-6">
                <h3 className="stats-section-title">{t('stats.account_logbooks')}</h3>
                <div className="stats-account-table-wrap">
                  <table className="stats-account-table">
                    <thead>
                      <tr>
                        <th>{t('stats.col_logbook')}</th>
                        <th>{t('stats.travel_days')}</th>
                        <th>{t('stats.total_distance')}</th>
                        <th>{t('stats.fuel_total')}</th>
                        <th>{t('stats.motor_hours_total')}</th>
                        <th>{t('stats.water_total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountLogbooksWithDays.map((lb) => (
                        <tr key={lb.logbookId}>
                          <td>{lb.title}</td>
                          <td>{lb.totals.travelDayCount}</td>
                          <td>{formatNm(lb.totals.totalDistanceNm)} {t('stats.unit_nm')}</td>
                          <td>{formatLiters(lb.totals.totalFuelL)} {t('stats.unit_l')}</td>
                          <td>{formatHours(lb.totals.totalMotorHours)} {t('stats.unit_h')}</td>
                          <td>{formatLiters(lb.totals.totalFreshwaterL)} {t('stats.unit_l')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {accountStats.totals.travelDayCount > 0 && (
                <>
                  <div className="member-editor-card glass mt-6">
                    <h3 className="stats-section-title">{t('stats.daily_etmal')}</h3>
                    <DailyBarChart
                      days={allAccountDays}
                      valueFn={(d) => d.distanceNm}
                      barClass="stats-bar--distance"
                      formatValue={formatNm}
                    />
                  </div>

                  <div className="member-editor-card glass mt-6">
                    <h3 className="stats-section-title">{t('stats.daily_motor_hours')}</h3>
                    {accountStats.totals.fuelPerMotorHourL != null && (
                      <p className="stats-section-sub">
                        {t('stats.fuel_per_motor_hour')}: {formatFuelPerMotorHour(accountStats.totals.fuelPerMotorHourL)} {t('stats.unit_l')}/{t('stats.unit_h')}
                      </p>
                    )}
                    <DailyBarChart
                      days={allAccountDays}
                      valueFn={(d) => d.motorHours}
                      barClass="stats-bar--motor-hours"
                      formatValue={formatHours}
                    />
                    {allAccountDays.some((d) => d.fuelPerMotorHourL != null) && (
                      <>
                        <h4 className="stats-section-subtitle mt-4">{t('stats.daily_fuel_per_motor_hour')}</h4>
                        <DailyBarChart
                          days={allAccountDays}
                          valueFn={(d) => d.fuelPerMotorHourL ?? 0}
                          barClass="stats-bar--fuel-per-hour"
                          formatValue={(v) => formatFuelPerMotorHour(v > 0 ? v : null)}
                        />
                      </>
                    )}
                  </div>

                  <div className="member-editor-card glass mt-6">
                    <h3 className="stats-section-title">{t('stats.daily_consumption')}</h3>
                    {accountStats.totals.fuelPerMotorHourL != null && (
                      <p className="stats-section-sub">
                        {t('stats.fuel_per_motor_hour')}: {formatFuelPerMotorHour(accountStats.totals.fuelPerMotorHourL)} {t('stats.unit_l')}/{t('stats.unit_h')}
                      </p>
                    )}
                    <ConsumptionChart days={allAccountDays} />
                  </div>

                  <div className="member-editor-card glass mt-6">
                    <h3 className="stats-section-title">{t('stats.propulsion_title')}</h3>
                    <PropulsionBreakdown totals={accountStats.totals} />
                  </div>
                </>
              )}
            </>
          )}
        </>
      ) : null}
    </div>
  )
}
