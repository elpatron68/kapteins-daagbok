import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

const TOOLTIP_EDGE_MARGIN = 16
const TOOLTIP_ESTIMATED_HEIGHT = 240

function buildCutoutClipPath(rect: SpotlightRect): string {
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  return `polygon(evenodd, 0 0, 100vw 0, 100vw 100vh, 0 100vh, 0 0, ${rect.left}px ${rect.top}px, ${right}px ${rect.top}px, ${right}px ${bottom}px, ${rect.left}px ${bottom}px, ${rect.left}px ${rect.top}px)`
}

function computeTooltipTop(spotlight: SpotlightRect): number {
  const viewportBottom = window.innerHeight - TOOLTIP_EDGE_MARGIN
  const below = spotlight.top + spotlight.height + 12
  if (below + TOOLTIP_ESTIMATED_HEIGHT <= viewportBottom) {
    return below
  }

  const above = spotlight.top - 12 - TOOLTIP_ESTIMATED_HEIGHT
  if (above >= TOOLTIP_EDGE_MARGIN) {
    return above
  }

  return Math.max(
    TOOLTIP_EDGE_MARGIN,
    Math.min(below, viewportBottom - TOOLTIP_ESTIMATED_HEIGHT)
  )
}

export default function AppTourOverlay() {
  const { t } = useTranslation()
  const {
    isActive,
    isDemoTour,
    currentStepId,
    currentStepIndex,
    totalSteps,
    nextStep,
    prevStep,
    skipTour
  } = useAppTour()

  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null)
  const skipTourRef = useRef(skipTour)
  skipTourRef.current = skipTour

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
    document.body.classList.add('app-tour-active')
    return () => document.body.classList.remove('app-tour-active')
  }, [isActive])

  useEffect(() => {
    if (!isActive || !currentStepId || isCenteredTourStep(currentStepId)) return

    const selector = getTourTargetSelector(currentStepId)
    if (!selector) return

    const el = document.querySelector(selector)
    el?.classList.add('app-tour-target-active')
    return () => el?.classList.remove('app-tour-target-active')
  }, [currentStepId, isActive])

  useEffect(() => {
    if (!isActive) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skipTourRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isActive])

  if (!isActive || !currentStepId) return null

  const { title, body } = getTourStepCopy(currentStepId, t, { demoMode: isDemoTour })
  const centered = isCenteredTourStep(currentStepId)

  const tooltipStyle = centered
    ? undefined
    : spotlight
      ? { top: computeTooltipTop(spotlight) }
      : { top: '20%' }

  const backdropStyle = spotlight && !centered
    ? { clipPath: buildCutoutClipPath(spotlight) }
    : undefined

  return (
    <div className="app-tour-root" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`app-tour-backdrop${spotlight && !centered ? ' app-tour-backdrop--cutout' : ''}`}
        style={backdropStyle}
        onClick={skipTour}
      />

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
