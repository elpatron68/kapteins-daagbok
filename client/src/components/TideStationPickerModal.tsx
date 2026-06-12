import type { TideStation } from '../services/tides.js'

type TideStationPickerModalProps = {
  title: string
  hint: string
  cancelLabel: string
  stations: TideStation[]
  onSelect: (station: TideStation) => void
  onCancel: () => void
}

export function TideStationPickerModal({
  title,
  hint,
  cancelLabel,
  stations,
  onSelect,
  onCancel
}: TideStationPickerModalProps) {
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
          {stations.map((station) => (
            <li key={station.id}>
              <button
                type="button"
                className="tide-station-picker__option"
                onClick={() => onSelect(station)}
              >
                <span className="tide-station-picker__name">{station.name}</span>
                <span className="tide-station-picker__meta">
                  {station.distanceKm} km
                  {station.area ? ` · ${station.area}` : ''}
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
