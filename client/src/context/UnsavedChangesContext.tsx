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
  registerSaveHandler: (source: string, handler: (() => Promise<void>) | null) => void
  confirmLeave: () => Promise<boolean>
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { showConfirmLeave, showAlert } = useDialog()
  const dirtySources = useRef(new Set<string>())
  const saveHandlers = useRef(new Map<string, () => Promise<void>>())

  const setDirty = useCallback((source: string, dirty: boolean) => {
    if (dirty) dirtySources.current.add(source)
    else dirtySources.current.delete(source)
  }, [])

  const registerSaveHandler = useCallback((source: string, handler: (() => Promise<void>) | null) => {
    if (handler) saveHandlers.current.set(source, handler)
    else saveHandlers.current.delete(source)
  }, [])

  const confirmLeave = useCallback(async (): Promise<boolean> => {
    if (dirtySources.current.size === 0) return true

    const canSave = [...dirtySources.current].some((source) => saveHandlers.current.has(source))
    const choice = await showConfirmLeave(
      t('common.unsaved_changes_message'),
      t('common.unsaved_changes_title'),
      t('common.unsaved_changes_stay'),
      t('common.unsaved_changes_save_leave'),
      t('common.unsaved_changes_discard'),
      { showSave: canSave }
    )

    if (choice === 'stay') return false
    if (choice === 'discard') return true

    const handlers = [...dirtySources.current]
      .map((source) => saveHandlers.current.get(source))
      .filter((handler): handler is () => Promise<void> => handler != null)

    try {
      for (const handler of handlers) {
        await handler()
      }
      return true
    } catch (err) {
      console.error('Failed to save before leaving:', err)
      await showAlert(t('errors.save_failed'))
      return false
    }
  }, [showConfirmLeave, showAlert, t])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtySources.current.size === 0) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const value = useMemo(
    () => ({ setDirty, registerSaveHandler, confirmLeave }),
    [setDirty, registerSaveHandler, confirmLeave]
  )

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
export function useRegisterUnsavedChanges(
  source: string,
  isDirty: boolean,
  onSave?: () => Promise<void>
) {
  const { setDirty, registerSaveHandler, confirmLeave } = useUnsavedChangesContext()

  useEffect(() => {
    setDirty(source, isDirty)
    return () => setDirty(source, false)
  }, [source, isDirty, setDirty])

  useEffect(() => {
    if (!onSave) {
      registerSaveHandler(source, null)
      return
    }
    registerSaveHandler(source, onSave)
    return () => registerSaveHandler(source, null)
  }, [source, onSave, registerSaveHandler])

  return { confirmLeave }
}
