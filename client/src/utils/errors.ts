/** Map unknown errors to a user-facing message (i18n key or fallback). */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message
  }
  if (typeof err === 'string' && err.trim()) {
    return err
  }
  return fallback
}
