import React, { createContext, useContext, useState, useRef } from 'react'

interface DialogContextType {
  showAlert: (message: string, title?: string, confirmText?: string) => Promise<void>
  showConfirm: (message: string, title?: string, confirmText?: string, cancelText?: string) => Promise<boolean>
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
  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState<'alert' | 'confirm'>('alert')
  const [confirmLabel, setConfirmLabel] = useState('OK')
  const [cancelLabel, setCancelLabel] = useState('Cancel')

  const resolveRef = useRef<((val: any) => void) | null>(null)

  const showAlert = (msg: string, headerTitle?: string, btnText?: string): Promise<void> => {
    setMessage(msg)
    setTitle(headerTitle || '')
    setType('alert')
    setConfirmLabel(btnText || 'OK')
    setIsOpen(true)

    return new Promise<void>((resolve) => {
      resolveRef.current = resolve
    })
  }

  const showConfirm = (msg: string, headerTitle?: string, btnConfirm?: string, btnCancel?: string): Promise<boolean> => {
    setMessage(msg)
    setTitle(headerTitle || '')
    setType('confirm')
    setConfirmLabel(btnConfirm || 'Yes')
    setCancelLabel(btnCancel || 'No')
    setIsOpen(true)

    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }

  const handleConfirm = () => {
    setIsOpen(false)
    if (resolveRef.current) {
      resolveRef.current(type === 'confirm' ? true : undefined)
      resolveRef.current = null
    }
  }

  const handleCancel = () => {
    setIsOpen(false)
    if (resolveRef.current) {
      resolveRef.current(false)
      resolveRef.current = null
    }
  }

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {isOpen && (
        <div className="custom-dialog-overlay" onClick={type === 'alert' ? handleConfirm : undefined}>
          <div className="custom-dialog-card glass scale-in" onClick={(e) => e.stopPropagation()}>
            {title && <h3 className="custom-dialog-title">{title}</h3>}
            <p className="custom-dialog-message">{message}</p>
            <div className="custom-dialog-actions">
              {type === 'confirm' && (
                <button type="button" className="btn secondary" onClick={handleCancel} style={{ width: 'auto', padding: '8px 20px', margin: 0 }}>
                  {cancelLabel}
                </button>
              )}
              <button type="button" className="btn primary" onClick={handleConfirm} style={{ width: 'auto', minWidth: '80px', padding: '8px 20px', margin: 0 }}>
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}
