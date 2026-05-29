import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollText } from 'lucide-react'
import DisclaimerModal from './DisclaimerModal.tsx'

export default function DisclaimerHeaderButton() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="btn-icon"
        onClick={() => setOpen(true)}
        title={t('disclaimer.button_title')}
        aria-label={t('disclaimer.button_title')}
      >
        <ScrollText size={18} />
      </button>
      <DisclaimerModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
