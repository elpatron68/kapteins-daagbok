import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  useId
} from 'react'
import { useTranslation } from 'react-i18next'

export type ConfirmLeaveChoice = 'stay' | 'save' | 'discard'

interface DialogContextType {
  showAlert: (message: string, title?: string, confirmText?: string) => Promise<void>
  showConfirm: (message: string, title?: string, confirmText?: string, cancelText?: string) => Promise<boolean>
  showConfirmLeave: (
    message: string,
    title?: string,
    stayLabel?: string,
    saveLabel?: string,
    discardLabel?: string,
    options?: { showSave?: boolean }
  ) => Promise<ConfirmLeaveChoice>
}

const DialogContext = createContext<DialogContextType | undefined>(undefined)

export function useDialog() {
  const context = useContext(DialogContext)
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider')
  }
  return context
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const titleId = useId()
  const messageId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState<'alert' | 'confirm' | 'confirm-leave'>('alert')
  const [confirmLabel, setConfirmLabel] = useState('OK')
  const [cancelLabel, setCancelLabel] = useState('Cancel')
  const [saveLabel, setSaveLabel] = useState('')
  const [discardLabel, setDiscardLabel] = useState('')
  const [showSaveOption, setShowSaveOption] = useState(false)

  const alertResolveRef = useRef<(() => void) | null>(null)
  const confirmResolveRef = useRef<((val: boolean) => void) | null>(null)
  const confirmLeaveResolveRef = useRef<((val: ConfirmLeaveChoice) => void) | null>(null)

  const showAlert = useCallback((msg: string, headerTitle?: string, btnText?: string): Promise<void> => {
    setMessage(msg)
    setTitle(headerTitle || '')
    setType('alert')
    setConfirmLabel(btnText || t('dialog.ok'))
    setIsOpen(true)

    return new Promise<void>((resolve) => {
      alertResolveRef.current = resolve
    })
  }, [t])

  const showConfirm = useCallback((
    msg: string,
    headerTitle?: string,
    btnConfirm?: string,
    btnCancel?: string
  ): Promise<boolean> => {
    setMessage(msg)
    setTitle(headerTitle || '')
    setType('confirm')
    setConfirmLabel(btnConfirm || t('dialog.yes'))
    setCancelLabel(btnCancel || t('dialog.no'))
    setIsOpen(true)

    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve
    })
  }, [t])

  const showConfirmLeave = useCallback((
    msg: string,
    headerTitle?: string,
    btnStay?: string,
    btnSave?: string,
    btnDiscard?: string,
    options?: { showSave?: boolean }
  ): Promise<ConfirmLeaveChoice> => {
    setMessage(msg)
    setTitle(headerTitle || '')
    setType('confirm-leave')
    setCancelLabel(btnStay || t('common.unsaved_changes_stay'))
    setSaveLabel(btnSave || t('common.unsaved_changes_save_leave'))
    setDiscardLabel(btnDiscard || t('common.unsaved_changes_discard'))
    setShowSaveOption(options?.showSave !== false)
    setIsOpen(true)

    return new Promise<ConfirmLeaveChoice>((resolve) => {
      confirmLeaveResolveRef.current = resolve
    })
  }, [t])

  const closeConfirmLeave = useCallback((choice: ConfirmLeaveChoice) => {
    setIsOpen(false)
    if (confirmLeaveResolveRef.current) {
      confirmLeaveResolveRef.current(choice)
      confirmLeaveResolveRef.current = null
    }
  }, [])

  const handleConfirm = useCallback(() => {
    setIsOpen(false)
    if (type === 'confirm' && confirmResolveRef.current) {
      confirmResolveRef.current(true)
      confirmResolveRef.current = null
    } else if (alertResolveRef.current) {
      alertResolveRef.current()
      alertResolveRef.current = null
    }
  }, [type])

  const handleCancel = useCallback(() => {
    if (type === 'confirm-leave') {
      closeConfirmLeave('stay')
      return
    }
    setIsOpen(false)
    if (confirmResolveRef.current) {
      confirmResolveRef.current(false)
      confirmResolveRef.current = null
    }
  }, [type, closeConfirmLeave])

  useEffect(() => {
    if (!isOpen) return
    confirmRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (type === 'confirm' || type === 'confirm-leave') handleCancel()
        else handleConfirm()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, type, handleCancel, handleConfirm])

  const contextValue = useMemo(
    () => ({ showAlert, showConfirm, showConfirmLeave }),
    [showAlert, showConfirm, showConfirmLeave]
  )

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
      {isOpen && (
        <div
          className="custom-dialog-overlay"
          onClick={type === 'confirm' || type === 'confirm-leave' ? handleCancel : handleConfirm}
        >
          <div
            className="custom-dialog-card glass scale-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={messageId}
            onClick={(e) => e.stopPropagation()}
          >
            {title && (
              <h3 id={titleId} className="custom-dialog-title">
                {title}
              </h3>
            )}
            <p id={messageId} className="custom-dialog-message">
              {message}
            </p>
            <div className="custom-dialog-actions">
              {type === 'confirm-leave' ? (
                <>
                  <button
                    ref={confirmRef}
                    type="button"
                    className="btn secondary"
                    onClick={handleCancel}
                    style={{ width: 'auto', padding: '8px 20px', margin: 0 }}
                  >
                    {cancelLabel}
                  </button>
                  {showSaveOption && (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => closeConfirmLeave('save')}
                      style={{ width: 'auto', padding: '8px 20px', margin: 0 }}
                    >
                      {saveLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => closeConfirmLeave('discard')}
                    style={{ width: 'auto', padding: '8px 20px', margin: 0 }}
                  >
                    {discardLabel}
                  </button>
                </>
              ) : (
                <>
                  {type === 'confirm' && (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={handleCancel}
                      style={{ width: 'auto', padding: '8px 20px', margin: 0 }}
                    >
                      {cancelLabel}
                    </button>
                  )}
                  <button
                    ref={confirmRef}
                    type="button"
                    className="btn primary"
                    onClick={handleConfirm}
                    style={{ width: 'auto', minWidth: '80px', padding: '8px 20px', margin: 0 }}
                  >
                    {confirmLabel}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}
