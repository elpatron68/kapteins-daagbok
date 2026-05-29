import { useEffect, useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  getTourStepCopy,
  getTourTargetSelector,
  isCenteredTourStep,
  useAppTour
} from '../context/AppTourContext.tsx'

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

export default function AppTourOverlay() {
  const { t } = useTranslation()
  const {
    isActive,
    currentStepId,
    currentStepIndex,
    totalSteps,
    nextStep,
    prevStep,
    skipTour
  } = useAppTour()

  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null)

  useLayoutEffect(() => {
    if (!isActive || !currentStepId || isCenteredTourStep(currentStepId)) {
      setSpotlight(null)
      return
    }

    const updateSpotlight = () => {
      const selector = getTourTargetSelector(currentStepId)
      if (!selector) {
        setSpotlight(null)
        return
      }
      const el = document.querySelector(selector)
      if (!el) {
        setSpotlight(null)
        return
      }
      const rect = el.getBoundingClientRect()
      const padding = 8
      setSpotlight({
        top: Math.max(8, rect.top - padding),
        left: Math.max(8, rect.left - padding),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2
      })
    }

    updateSpotlight()
    window.addEventListener('resize', updateSpotlight)
    window.addEventListener('scroll', updateSpotlight, true)
    const timer = window.setTimeout(updateSpotlight, 120)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', updateSpotlight)
      window.removeEventListener('scroll', updateSpotlight, true)
    }
  }, [currentStepId, isActive])

  useEffect(() => {
    if (!isActive) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skipTour()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isActive, skipTour])

  if (!isActive || !currentStepId) return null

  const { title, body } = getTourStepCopy(currentStepId, t)
  const centered = isCenteredTourStep(currentStepId)

  const tooltipStyle = centered
    ? undefined
    : spotlight
      ? {
          top: Math.min(window.innerHeight - 220, spotlight.top + spotlight.height + 12),
          left: Math.min(window.innerWidth - 340, Math.max(16, spotlight.left)),
          maxWidth: '420px'
        }
      : { top: '20%', left: '50%', transform: 'translateX(-50%)', maxWidth: '420px' }

  return (
    <div className="app-tour-root" role="dialog" aria-modal="true" aria-label={title}>
      <div className="app-tour-backdrop" onClick={skipTour} />

      {!centered && spotlight && (
        <div
          className="app-tour-spotlight"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height
          }}
        />
      )}

      <div className={`app-tour-tooltip${centered ? ' centered' : ''}`} style={tooltipStyle}>
        <button type="button" className="app-tour-close" onClick={skipTour} aria-label={t('tour.skip')}>
          <X size={18} />
        </button>

        <p className="app-tour-progress">
          {t('tour.progress', { current: currentStepIndex + 1, total: totalSteps })}
        </p>
        <h3 className="app-tour-title">{title}</h3>
        <p className="app-tour-body">{body}</p>

        <div className="app-tour-actions">
          <button
            type="button"
            className="app-tour-link"
            onClick={skipTour}
          >
            {t('tour.skip')}
          </button>

          <div className="app-tour-nav">
            <button
              type="button"
              className="btn secondary app-tour-nav-btn"
              onClick={prevStep}
              disabled={currentStepIndex === 0}
            >
              <ChevronLeft size={16} />
              {t('tour.back')}
            </button>
            <button type="button" className="btn primary app-tour-nav-btn" onClick={nextStep}>
              {currentStepIndex === totalSteps - 1 ? t('tour.finish') : t('tour.next')}
              {currentStepIndex < totalSteps - 1 && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
