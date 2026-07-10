import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Anchor,
  Camera,
  CloudSun,
  Compass,
  Droplets,
  Fuel,
  Gauge,
  MapPin,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Sailboat,
  Waves,
  X,
  Zap
} from 'lucide-react'

export interface LiveActionToolbarProps {
  motorRunning: boolean
  hasLoggedPosition: boolean
  lastSailsLabel?: string
  busy: boolean
  photoSaving: boolean
  voiceSaving: boolean
  tidesLoading: boolean
  weatherOwmLoading: boolean
  onMotorToggle: () => void
  onCastOff: () => void
  onMoor: () => void
  onOpenSails: () => void
  onOpenCourse: () => void
  onOpenSog: () => void
  onOpenStw: () => void
  onOpenFuel: () => void
  onOpenWater: () => void
  onOpenPosition: () => void
  onFetchTides: () => void
  onOpenComment: () => void
  onOpenPhoto: () => void
  onOpenVoice: () => void
  onFetchOwmWeather: () => void
  onOpenWind: () => void
  onOpenTemp: () => void
  onOpenPressure: () => void
  onOpenPrecip: () => void
  onOpenSeaState: () => void
  onOpenVisibility: () => void
}

export default function LiveActionToolbar({
  motorRunning,
  hasLoggedPosition,
  lastSailsLabel,
  busy,
  photoSaving,
  voiceSaving,
  tidesLoading,
  weatherOwmLoading,
  onMotorToggle,
  onCastOff,
  onMoor,
  onOpenSails,
  onOpenCourse,
  onOpenSog,
  onOpenStw,
  onOpenFuel,
  onOpenWater,
  onOpenPosition,
  onFetchTides,
  onOpenComment,
  onOpenPhoto,
  onOpenVoice,
  onFetchOwmWeather,
  onOpenWind,
  onOpenTemp,
  onOpenPressure,
  onOpenPrecip,
  onOpenSeaState,
  onOpenVisibility
}: LiveActionToolbarProps) {
  const { t } = useTranslation()
  const [weatherSheetOpen, setWeatherSheetOpen] = useState(false)
  const [moreSheetOpen, setMoreSheetOpen] = useState(false)

  const closeSheets = () => {
    setWeatherSheetOpen(false)
    setMoreSheetOpen(false)
  }

  const runWeather = (fn: () => void) => {
    fn()
    closeSheets()
  }

  const runMore = (fn: () => void) => {
    fn()
    closeSheets()
  }

  return (
    <>
      <div className="live-action-toolbar-sticky">
        <div className="live-action-toolbar" aria-label={t('logs.live_actions_label')}>
          <div className="live-action-grid live-action-grid-primary" data-tour="live-actions">
            <button
              type="button"
              className={`live-log-action-btn live-log-action-btn-compact ${motorRunning ? 'is-active' : ''}`}
              onClick={onMotorToggle}
              disabled={busy}
            >
              <Zap size={20} />
              <span>{motorRunning ? t('logs.live_motor_stop') : t('logs.live_motor_start')}</span>
            </button>
            <button type="button" className="live-log-action-btn live-log-action-btn-compact" onClick={onCastOff} disabled={busy}>
              <Anchor size={20} />
              <span>{t('logs.live_cast_off')}</span>
            </button>
            <button type="button" className="live-log-action-btn live-log-action-btn-compact" onClick={onMoor} disabled={busy}>
              <Anchor size={20} style={{ transform: 'scaleX(-1)' }} />
              <span>{t('logs.live_moor')}</span>
            </button>
            <button
              type="button"
              className={`live-log-action-btn live-log-action-btn-compact ${hasLoggedPosition ? 'has-gps' : ''}`}
              onClick={onOpenPosition}
              disabled={busy}
            >
              <MapPin size={20} />
              <span>{t('logs.live_position')}</span>
            </button>
            <button type="button" className="live-log-action-btn live-log-action-btn-compact" onClick={onOpenPhoto} disabled={busy || photoSaving}>
              <Camera size={20} />
              <span>{t('logs.live_photo_btn')}</span>
            </button>
            <button type="button" className="live-log-action-btn live-log-action-btn-compact" onClick={onOpenVoice} disabled={busy || voiceSaving}>
              <Mic size={20} />
              <span>{t('logs.live_voice_btn')}</span>
            </button>
            <button type="button" className="live-log-action-btn live-log-action-btn-compact" onClick={onOpenComment} disabled={busy}>
              <MessageSquare size={20} />
              <span>{t('logs.live_comment_btn')}</span>
            </button>
          </div>

          <div className="live-action-grid live-action-grid-secondary">
            <button
              type="button"
              className={`live-log-action-btn live-log-action-btn-compact ${lastSailsLabel ? 'has-context' : ''}`}
              onClick={onOpenSails}
              disabled={busy}
              title={lastSailsLabel}
            >
              <Sailboat size={18} />
              <span>{t('logs.live_sails_btn')}</span>
            </button>
            <button type="button" className="live-log-action-btn live-log-action-btn-compact" onClick={onOpenCourse} disabled={busy}>
              <Compass size={18} />
              <span>{t('logs.live_course_btn')}</span>
            </button>
            <button type="button" className="live-log-action-btn live-log-action-btn-compact" onClick={onOpenSog} disabled={busy}>
              <Gauge size={18} />
              <span>{t('logs.live_sog_btn')}</span>
            </button>
            <button type="button" className="live-log-action-btn live-log-action-btn-compact" onClick={onOpenStw} disabled={busy}>
              <Gauge size={18} style={{ transform: 'scaleX(-1)' }} />
              <span>{t('logs.live_stw_btn')}</span>
            </button>
            <button
              type="button"
              className="live-log-action-btn live-log-action-btn-compact"
              onClick={() => { setMoreSheetOpen(false); setWeatherSheetOpen(true) }}
              disabled={busy}
            >
              <CloudSun size={18} />
              <span>{t('logs.live_weather_btn')}</span>
            </button>
            <button
              type="button"
              className="live-log-action-btn live-log-action-btn-compact"
              onClick={() => { setWeatherSheetOpen(false); setMoreSheetOpen(true) }}
              disabled={busy}
            >
              <MoreHorizontal size={18} />
              <span>{t('logs.live_more_btn')}</span>
            </button>
          </div>
        </div>
      </div>

      {weatherSheetOpen && (
        <div
          className="live-bottom-sheet-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) closeSheets() }}
          role="presentation"
        >
          <div className="live-bottom-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="live-bottom-sheet-handle" aria-hidden />
            <div className="live-bottom-sheet-header">
              <h3>{t('logs.live_weather_btn')}</h3>
              <button type="button" className="btn-icon" onClick={closeSheets} aria-label={t('logs.live_cancel')}>
                <X size={18} />
              </button>
            </div>
            <div className="live-overflow-menu-list">
              <button
                type="button"
                className="live-overflow-menu-item live-log-subaction-btn-owm"
                onClick={() => runWeather(onFetchOwmWeather)}
                disabled={busy || weatherOwmLoading}
              >
                {weatherOwmLoading ? t('logs.live_weather_owm_loading') : t('logs.live_weather_owm_btn')}
              </button>
              <button type="button" className="live-overflow-menu-item" onClick={() => runWeather(onOpenWind)} disabled={busy}>
                {t('logs.live_wind_btn')}
              </button>
              <button type="button" className="live-overflow-menu-item" onClick={() => runWeather(onOpenTemp)} disabled={busy}>
                {t('logs.live_temp_btn')}
              </button>
              <button type="button" className="live-overflow-menu-item" onClick={() => runWeather(onOpenPressure)} disabled={busy}>
                {t('logs.live_pressure_btn')}
              </button>
              <button type="button" className="live-overflow-menu-item" onClick={() => runWeather(onOpenPrecip)} disabled={busy}>
                {t('logs.live_precip_btn')}
              </button>
              <button type="button" className="live-overflow-menu-item" onClick={() => runWeather(onOpenSeaState)} disabled={busy}>
                {t('logs.live_sea_state_btn')}
              </button>
              <button type="button" className="live-overflow-menu-item" onClick={() => runWeather(onOpenVisibility)} disabled={busy}>
                {t('logs.live_visibility_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {moreSheetOpen && (
        <div
          className="live-bottom-sheet-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) closeSheets() }}
          role="presentation"
        >
          <div className="live-bottom-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="live-bottom-sheet-handle" aria-hidden />
            <div className="live-bottom-sheet-header">
              <h3>{t('logs.live_more_btn')}</h3>
              <button type="button" className="btn-icon" onClick={closeSheets} aria-label={t('logs.live_cancel')}>
                <X size={18} />
              </button>
            </div>
            <div className="live-overflow-menu-list">
              <button type="button" className="live-overflow-menu-item" onClick={() => runMore(onOpenFuel)} disabled={busy}>
                <Fuel size={18} />
                {t('logs.live_fuel_btn')}
              </button>
              <button type="button" className="live-overflow-menu-item" onClick={() => runMore(onOpenWater)} disabled={busy}>
                <Droplets size={18} />
                {t('logs.live_water_btn')}
              </button>
              <button type="button" className="live-overflow-menu-item" onClick={() => runMore(onFetchTides)} disabled={busy || tidesLoading}>
                <Waves size={18} />
                {tidesLoading ? t('logs.tide_fetch_loading') : t('logs.tides')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
