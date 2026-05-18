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

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

/** Browsers often leave `type` empty; infer from extension before rejecting. */
export function resolveMimeType(filename: string, declaredType?: string): string {
  const declared = (declaredType ?? '').trim().toLowerCase()
  if (declared && declared !== 'application/octet-stream' && ALLOWED_MIME_TYPES.has(declared)) {
    return declared
  }
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''
  return EXTENSION_TO_MIME[ext] ?? (declared || 'application/octet-stream')
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

export function validateUploadFile(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`
  }
  const mime = resolveMimeType(file.name, file.type)
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return `File type not allowed. Use PDF, images, or text files (.pdf, .png, .txt, …).`
  }
  return null
}
