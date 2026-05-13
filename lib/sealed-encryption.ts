/**
 * Server-side sealed encryption (MVP2 zero-access).
 * Encrypt message bodies with per-message AES key; wrap key with user's RSA public key.
 * Server never has private key or KEK; cannot decrypt.
 */

import { createCipheriv, randomBytes, publicEncrypt, createPublicKey, constants } from 'crypto'

const AES_ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16
const AES_KEY_LEN = 32

/** Wrap 32-byte AES key with RSA-OAEP (SHA-256) using public key SPKI base64. Returns base64. */
export function wrapAesKeyWithPublicKey(publicKeySpkiB64: string, aesKeyRaw: Buffer): string {
  if (aesKeyRaw.length !== AES_KEY_LEN) throw new Error('AES key must be 32 bytes')
  const spki = Buffer.from(publicKeySpkiB64, 'base64')
  const keyObject = createPublicKey({ key: spki, format: 'der', type: 'spki' })
  const sealed = publicEncrypt(
    {
      key: keyObject,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    aesKeyRaw
  )
  return sealed.toString('base64')
}

/** Encrypt plaintext with AES-256-GCM. Format: base64(iv(12) || tag(16) || ciphertext). */
export function aesGcmEncrypt(aesKeyRaw: Buffer, plaintext: string): string {
  if (aesKeyRaw.length !== AES_KEY_LEN) throw new Error('AES key must be 32 bytes')
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(AES_ALGO, aesKeyRaw, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

/** Encrypt bytes with AES-256-GCM. Format: base64(iv(12) || tag(16) || ciphertext). */
export function aesGcmEncryptBytes(aesKeyRaw: Buffer, data: Buffer): string {
  if (aesKeyRaw.length !== AES_KEY_LEN) throw new Error('AES key must be 32 bytes')
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(AES_ALGO, aesKeyRaw, iv)
  const enc = Buffer.concat([cipher.update(data), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export interface AttachmentToSeal {
  filename: string
  contentType: string
  size: number
  content: Buffer
}

export interface SealedAttachment {
  filename: string
  contentType: string
  size: number
  contentEncB64: string
}

/** Encrypt message bodies, raw, and optional attachments with one per-message AES key. */
export function sealMessage(
  publicKeySpkiB64: string,
  raw: string,
  bodyText: string,
  bodyHtml: string,
  attachments: AttachmentToSeal[] = []
): {
  sealedKeyB64: string
  rawEncB64: string | null
  bodyTextEncB64: string | null
  bodyHtmlEncB64: string | null
  attachmentsEnc: SealedAttachment[] | null
} {
  const aesKeyRaw = randomBytes(AES_KEY_LEN)
  const sealedKeyB64 = wrapAesKeyWithPublicKey(publicKeySpkiB64, aesKeyRaw)
  const rawEncB64 = aesGcmEncrypt(aesKeyRaw, raw)
  const bodyTextEncB64 = bodyText ? aesGcmEncrypt(aesKeyRaw, bodyText) : null
  const bodyHtmlEncB64 = bodyHtml ? aesGcmEncrypt(aesKeyRaw, bodyHtml) : null
  const attachmentsEnc =
    attachments.length > 0
      ? attachments.map((a) => ({
          filename: a.filename,
          contentType: a.contentType || 'application/octet-stream',
          size: a.size,
          contentEncB64: aesGcmEncryptBytes(aesKeyRaw, a.content),
        }))
      : null
  return { sealedKeyB64, rawEncB64, bodyTextEncB64, bodyHtmlEncB64, attachmentsEnc }
}
