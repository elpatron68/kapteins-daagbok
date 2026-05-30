import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type ReactNode
} from 'react'
import { useTranslation } from 'react-i18next'
import { useDialog } from '../components/ModalDialog.tsx'

interface UnsavedChangesContextValue {
  setDirty: (source: string, dirty: boolean) => void
  confirmLeave: () => Promise<boolean>
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { showConfirm } = useDialog()
  const dirtySources = useRef(new Set<string>())

  const setDirty = useCallback((source: string, dirty: boolean) => {
    if (dirty) dirtySources.current.add(source)
    else dirtySources.current.delete(source)
  }, [])

  const confirmLeave = useCallback(async (): Promise<boolean> => {
    if (dirtySources.current.size === 0) return true
    return showConfirm(
      t('common.unsaved_changes_message'),
      t('common.unsaved_changes_title'),
      t('common.unsaved_changes_leave'),
      t('common.unsaved_changes_stay')
    )
  }, [showConfirm, t])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtySources.current.size === 0) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const value = useMemo(() => ({ setDirty, confirmLeave }), [setDirty, confirmLeave])

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  )
}

export function useUnsavedChangesContext(): UnsavedChangesContextValue {
  const ctx = useContext(UnsavedChangesContext)
  if (!ctx) {
    throw new Error('useUnsavedChangesContext must be used within UnsavedChangesProvider')
  }
  return ctx
}

/** Register a form/view as having unsaved changes (cleared automatically on unmount). */
export function useRegisterUnsavedChanges(source: string, isDirty: boolean) {
  const { setDirty, confirmLeave } = useUnsavedChangesContext()

  useEffect(() => {
    setDirty(source, isDirty)
    return () => setDirty(source, false)
  }, [source, isDirty, setDirty])

  return { confirmLeave }
}
