import { useEffect } from 'react'
import RegistrationDisclaimer from './RegistrationDisclaimer.tsx'

interface DisclaimerModalProps {
  open: boolean
  onClose: () => void
}

export default function DisclaimerModal({ open, onClose }: DisclaimerModalProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="disclaimer-modal-overlay" onClick={onClose}>
      <div className="disclaimer-modal-panel" onClick={(event) => event.stopPropagation()}>
        <RegistrationDisclaimer variant="view" onDismiss={onClose} />
      </div>
    </div>
  )
}
