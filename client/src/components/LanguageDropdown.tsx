import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages, Globe, ChevronDown } from 'lucide-react'
import {
  SUPPORTED_LANGUAGES,
  changeAppLanguage,
  normalizeAppLanguage,
  type AppLanguage
} from '../utils/i18nLanguages.js'

function FlagIcon({ lang, className, style }: { lang: string; className?: string; style?: React.CSSProperties }) {
  const baseStyle = {
    display: 'inline-block',
    verticalAlign: 'middle',
    borderRadius: '2px',
    overflow: 'hidden',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    boxSizing: 'border-box' as const,
    ...style
  }

  switch (lang) {
    case 'de':
      return (
        <svg viewBox="0 0 5 3" className={className} style={baseStyle}>
          <rect width="5" height="3" fill="#FFCE00"/>
          <rect width="5" height="2" fill="#DD0000"/>
          <rect width="5" height="1" fill="#000000"/>
        </svg>
      )
    case 'en':
      return (
        <svg viewBox="0 0 60 30" className={className} style={baseStyle}>
          <clipPath id="union-jack-clip">
            <path d="M0,0 L60,30 M60,0 L0,30"/>
          </clipPath>
          <rect width="60" height="30" fill="#012169"/>
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/>
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" clipPath="url(#union-jack-clip)"/>
          <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10"/>
          <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6"/>
        </svg>
      )
    case 'da':
      return (
        <svg viewBox="0 0 37 28" className={className} style={baseStyle}>
          <rect width="37" height="28" fill="#C8102E"/>
          <path d="M12,0 h4 v28 h-4 z M0,12 h37 v4 h-37 z" fill="#FFFFFF"/>
        </svg>
      )
    case 'sv':
      return (
        <svg viewBox="0 0 16 10" className={className} style={baseStyle}>
          <rect width="16" height="10" fill="#006AA7"/>
          <path d="M5,0 h2 v10 h-2 z M0,4 h16 v2 h-16 z" fill="#FECC00"/>
        </svg>
      )
    case 'nb':
      return (
        <svg viewBox="0 0 22 16" className={className} style={baseStyle}>
          <rect width="22" height="16" fill="#BA0C2F"/>
          <path d="M6,0 h4 v16 h-4 z M0,6 h22 v4 h-22 z" fill="#FFFFFF"/>
          <path d="M7,0 h2 v16 h-2 z M0,7 h22 v2 h-22 z" fill="#00205B"/>
        </svg>
      )
    default:
      return null
  }
}

interface LanguageDropdownProps {
  variant?: 'icon' | 'text' | 'secondary-button'
  align?: 'left' | 'right'
}

export default function LanguageDropdown({
  variant = 'icon',
  align = 'right'
}: LanguageDropdownProps) {
  const { t, i18n } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const activeLang = normalizeAppLanguage(i18n.language)

  useEffect(() => {
    if (!isOpen) return

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isOpen])

  const selectLanguage = (lang: AppLanguage) => {
    changeAppLanguage(i18n, lang)
    setIsOpen(false)
  }

  // Trigger button content based on variant
  const renderTriggerContent = () => {
    const name = t(`languages.${activeLang}`)

    if (variant === 'icon') {
      return (
        <span className="lang-dropdown-trigger-flag" aria-hidden="true">
          <FlagIcon lang={activeLang} className="lang-flag-svg trigger-icon-only" />
        </span>
      )
    }

    if (variant === 'secondary-button') {
      return (
        <>
          <Globe size={14} style={{ marginRight: '4px' }} />
          <FlagIcon lang={activeLang} className="lang-flag-svg" style={{ marginRight: '4px' }} />
          <span className="lang-trigger-name">{name}</span>
          <ChevronDown size={12} className="lang-dropdown-chevron" />
        </>
      )
    }

    // Default or "text" variant (used in footer)
    return (
      <>
        <Languages size={18} />
        <FlagIcon lang={activeLang} className="lang-flag-svg" style={{ margin: '0 4px' }} />
        <span>{name}</span>
        <ChevronDown size={14} className="lang-dropdown-chevron" />
      </>
    )
  }

  const triggerClass =
    variant === 'icon'
      ? 'btn-icon'
      : variant === 'secondary-button'
      ? 'btn secondary compact'
      : 'btn-icon-text'

  return (
    <div
      className={`lang-dropdown ${isOpen ? 'is-open' : ''} align-${align}`}
      ref={rootRef}
    >
      <button
        type="button"
        className={triggerClass}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title="Switch Language"
        style={variant === 'secondary-button' ? { width: 'auto', padding: '6px 12px', fontSize: '13px' } : undefined}
      >
        {renderTriggerContent()}
      </button>

      {isOpen && (
        <ul className="lang-dropdown-menu" role="listbox">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = lang === activeLang
            return (
              <li
                key={lang}
                role="option"
                aria-selected={isSelected}
                className={`lang-dropdown-option ${isSelected ? 'is-selected' : ''}`}
                onClick={() => selectLanguage(lang)}
              >
                <FlagIcon lang={lang} className="lang-flag-svg" />
                <span className="lang-option-name">{t(`languages.${lang}`)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
