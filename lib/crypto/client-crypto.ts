/**
 * Client-only: WebCrypto for zero-access MVP2 (KEK derivation, RSA unwrap, AES-GCM decrypt).
 * Do not import in server code.
 */

const IV_LEN = 12
const TAG_LEN = 16

/** Derive KEK (key-encryption-key) from password + salt for decrypting stored private key. */
export async function deriveKek(
  password: string,
  saltB64: string,
  iterations: number
): Promise<CryptoKey> {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt', 'encrypt']
  )
}

/** Decrypt a blob encrypted with AES-GCM (iv(12)||tag(16)||ciphertext). Returns ArrayBuffer. */
export async function decryptWithKek(ciphertextB64: string, kek: CryptoKey): Promise<ArrayBuffer> {
  const raw = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0))
  if (raw.length < IV_LEN + TAG_LEN) throw new Error('Invalid ciphertext')
  const iv = raw.subarray(0, IV_LEN)
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ciphertextOnly = raw.subarray(IV_LEN + TAG_LEN)
  const ciphertextWithTag = new Uint8Array(ciphertextOnly.length + TAG_LEN)
  ciphertextWithTag.set(ciphertextOnly)
  ciphertextWithTag.set(tag, ciphertextOnly.length)
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_LEN * 8 },
    kek,
    ciphertextWithTag
  )
}

/** Encrypt plaintext with KEK (AES-GCM). Format: iv(12)||tag(16)||ciphertext, base64. */
export async function encryptWithKek(plaintext: ArrayBuffer, kek: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const enc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_LEN * 8 },
    kek,
    plaintext
  )
  const encU = new Uint8Array(enc)
  const tag = encU.subarray(encU.length - TAG_LEN)
  const ciphertextOnly = encU.subarray(0, encU.length - TAG_LEN)
  const out = new Uint8Array(IV_LEN + TAG_LEN + ciphertextOnly.length)
  out.set(iv)
  out.set(tag, IV_LEN)
  out.set(ciphertextOnly, IV_LEN + TAG_LEN)
  return btoa(String.fromCharCode(...Array.from(out)))
}

/** Unwrap sealed AES key (RSA-OAEP) with private key. Returns raw 32-byte key. */
export async function decryptSealedAesKey(
  sealedKeyB64: string,
  privateKey: CryptoKey
): Promise<Uint8Array> {
  const sealed = Uint8Array.from(atob(sealedKeyB64), (c) => c.charCodeAt(0))
  const aesKey = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    sealed
  )
  return new Uint8Array(aesKey)
}

/** Decrypt AES-GCM payload (base64 iv(12)||tag(16)||ciphertext) with raw 32-byte key. Returns UTF-8 string. */
export async function decryptAesGcmWithRawKey(encB64: string, aesKeyRaw: Uint8Array): Promise<string> {
  if (aesKeyRaw.length !== 32) throw new Error('AES key must be 32 bytes')
  const raw = Uint8Array.from(atob(encB64), (c) => c.charCodeAt(0))
  if (raw.length < IV_LEN + TAG_LEN) throw new Error('Invalid ciphertext')
  const iv = raw.subarray(0, IV_LEN)
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ciphertextOnly = raw.subarray(IV_LEN + TAG_LEN)
  const ciphertextWithTag = new Uint8Array(ciphertextOnly.length + TAG_LEN)
  ciphertextWithTag.set(ciphertextOnly)
  ciphertextWithTag.set(tag, ciphertextOnly.length)

  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(aesKeyRaw),
    'AES-GCM',
    false,
    ['decrypt']
  )
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_LEN * 8 },
    key,
    ciphertextWithTag
  )
  return new TextDecoder().decode(dec)
}

/** Decrypt AES-GCM payload (base64 iv(12)||tag(16)||ciphertext) with raw 32-byte key. Returns bytes. */
export async function decryptAesGcmBytesWithRawKey(encB64: string, aesKeyRaw: Uint8Array): Promise<Uint8Array> {
  if (aesKeyRaw.length !== 32) throw new Error('AES key must be 32 bytes')
  const raw = Uint8Array.from(atob(encB64), (c) => c.charCodeAt(0))
  if (raw.length < IV_LEN + TAG_LEN) throw new Error('Invalid ciphertext')
  const iv = raw.subarray(0, IV_LEN)
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ciphertextOnly = raw.subarray(IV_LEN + TAG_LEN)
  const ciphertextWithTag = new Uint8Array(ciphertextOnly.length + TAG_LEN)
  ciphertextWithTag.set(ciphertextOnly)
  ciphertextWithTag.set(tag, ciphertextOnly.length)

  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(aesKeyRaw),
    'AES-GCM',
    false,
    ['decrypt']
  )
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_LEN * 8 },
    key,
    ciphertextWithTag
  )
  return new Uint8Array(dec)
}

/** Import RSA private key from PKCS8 bytes. */
export async function importPrivateKeyPkcs8(pkcs8Bytes: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  )
}
