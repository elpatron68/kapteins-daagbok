import { useTranslation } from 'react-i18next'
import type { TideLocationOption } from '../utils/tideLocation.js'

type TideLocationPickerModalProps = {
  title: string
  hint: string
  cancelLabel: string
  options: TideLocationOption[]
  onSelect: (option: TideLocationOption) => void
  onCancel: () => void
}

export function TideLocationPickerModal({
  title,
  hint,
  cancelLabel,
  options,
  onSelect,
  onCancel
}: TideLocationPickerModalProps) {
  const { t } = useTranslation()

  return (
    <div
      className="live-log-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="live-log-modal tide-station-picker" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="live-log-modal-hint" role="note">
          {hint}
        </p>
        <ul className="tide-station-picker__list">
          {options.map((option) => (
            <li key={option.role}>
              <button
                type="button"
                className="tide-station-picker__option"
                onClick={() => onSelect(option)}
              >
                <span className="tide-station-picker__name">{option.displayLabel}</span>
                <span className="tide-station-picker__meta">
                  {t(option.labelKey)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="live-log-modal-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
