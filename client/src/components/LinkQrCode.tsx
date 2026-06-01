import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'

interface LinkQrCodeProps {
  value: string
  size?: number
}

export default function LinkQrCode({ value, size = 200 }: LinkQrCodeProps) {
  const { t } = useTranslation()
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!value.trim()) {
      setDataUrl(null)
      return
    }

    let cancelled = false
    void QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' }
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch((err) => {
        console.error('QR code generation failed:', err)
        if (!cancelled) setDataUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [value, size])

  if (!value.trim() || !dataUrl) return null

  return (
    <div className="link-qr-block">
      <p className="link-qr-label">{t('settings.link_qr_hint')}</p>
      <img
        src={dataUrl}
        width={size}
        height={size}
        className="link-qr-image"
        alt={t('settings.link_qr_alt')}
      />
    </div>
  )
}
