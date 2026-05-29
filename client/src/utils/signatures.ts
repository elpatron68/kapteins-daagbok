export function isSignatureImage(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith('data:image/')
}

export function formatSignatureForExport(value: string | undefined | null): string {
  if (!value) return ''
  if (isSignatureImage(value)) return '[Unterschrift]'
  return value
}
