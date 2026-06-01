export const PHOTO_MAX_WIDTH = 1280
export const PHOTO_MAX_HEIGHT = 720
export const PHOTO_JPEG_QUALITY = 0.7

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = dataUrl
  })
}

export function compressImageElement(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context')

  let width = img.width
  let height = img.height
  if (width > PHOTO_MAX_WIDTH || height > PHOTO_MAX_HEIGHT) {
    const ratio = Math.min(PHOTO_MAX_WIDTH / width, PHOTO_MAX_HEIGHT / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }

  canvas.width = width
  canvas.height = height
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY)
}

export async function blobToCompressedJpegDataUrl(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('image_read_failed'))
    reader.readAsDataURL(blob)
  })
  const img = await loadImageFromDataUrl(dataUrl)
  return compressImageElement(img)
}

export async function fileToCompressedJpegDataUrl(file: Blob): Promise<string> {
  return blobToCompressedJpegDataUrl(file)
}
