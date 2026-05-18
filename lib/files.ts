export const MAX_FILE_BYTES = 20 * 1024 * 1024

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

export function validateUploadFile(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`
  }
  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return `File type not allowed: ${mime || 'unknown'}`
  }
  return null
}
