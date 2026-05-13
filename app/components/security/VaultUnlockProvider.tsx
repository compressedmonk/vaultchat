'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import {
  deriveKek,
  decryptWithKek,
  encryptWithKek,
  importPrivateKeyPkcs8,
} from '@/lib/crypto/client-crypto'

export interface VaultKdf {
  name: string
  iterations: number
  hash: string
}

export interface VaultUserForUnlock {
  encryptionSalt: string
  kdf: VaultKdf
}

interface VaultUnlockContextValue {
  unlocked: boolean
  privateKey: CryptoKey | null
  error: string | null
  unlock: (password: string, me: VaultUserForUnlock) => Promise<void>
  lock: () => void
  clearError: () => void
  openUnlockModalRef: MutableRefObject<(() => void) | null>
}

const VaultUnlockContext = createContext<VaultUnlockContextValue | null>(null)

export function useVaultUnlock(): VaultUnlockContextValue {
  const ctx = useContext(VaultUnlockContext)
  if (!ctx) {
    throw new Error('useVaultUnlock must be used within VaultUnlockProvider')
  }
  return ctx
}

const RSA_MODULUS_LENGTH = 2048

export function VaultUnlockProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false)
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const openUnlockModalRef = useRef<(() => void) | null>(null)

  const lock = useCallback(() => {
    setPrivateKey(null)
    setUnlocked(false)
    setError(null)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const unlock = useCallback(async (password: string, me: VaultUserForUnlock) => {
    setError(null)
    try {
      const iterations = me.kdf?.iterations ?? 200_000
      const kek = await deriveKek(password, me.encryptionSalt, iterations)

      const statusRes = await fetch('/api/keys/status')
      const status = await statusRes.json().catch(() => ({}))
      if (!statusRes.ok) throw new Error('Failed to load keys status')

      let privKey: CryptoKey

      if (!status.hasKeys) {
        const keyPair = await crypto.subtle.generateKey(
          {
            name: 'RSA-OAEP',
            modulusLength: RSA_MODULUS_LENGTH,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
          },
          true,
          ['encrypt', 'decrypt']
        )
        const publicSpki = await crypto.subtle.exportKey('spki', keyPair.publicKey)
        const publicKeySpkiB64 = btoa(String.fromCharCode(...Array.from(new Uint8Array(publicSpki))))
        const privatePkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
        const privateKeyEncB64 = await encryptWithKek(privatePkcs8, kek)
        const registerRes = await fetch('/api/keys/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicKeySpkiB64,
            privateKeyEncB64,
            keyVersion: 1,
          }),
        })
        if (!registerRes.ok) {
          const data = await registerRes.json().catch(() => ({}))
          if (registerRes.status === 409) {
            const keysRes = await fetch('/api/keys/status')
            const keysData = await keysRes.json().catch(() => ({}))
            if (keysData.privateKeyEncB64) {
              const pkcs8 = await decryptWithKek(keysData.privateKeyEncB64, kek)
              privKey = await importPrivateKeyPkcs8(pkcs8)
              setPrivateKey(privKey)
              setUnlocked(true)
              return
            }
          }
          throw new Error((data.error as string) ?? 'Failed to register keys')
        }
        privKey = keyPair.privateKey
      } else {
        const privateKeyEncB64 = status.privateKeyEncB64
        if (!privateKeyEncB64) throw new Error('Missing encrypted private key')
        const pkcs8 = await decryptWithKek(privateKeyEncB64, kek)
        privKey = await importPrivateKeyPkcs8(pkcs8)
      }

      setPrivateKey(privKey)
      setUnlocked(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unlock failed'
      setError(msg)
      setPrivateKey(null)
      setUnlocked(false)
      throw e
    }
  }, [])

  const value = useMemo<VaultUnlockContextValue>(
    () => ({ unlocked, privateKey, error, unlock, lock, clearError, openUnlockModalRef }),
    [unlocked, privateKey, error, unlock, lock, clearError]
  )

  return (
    <VaultUnlockContext.Provider value={value}>
      {children}
    </VaultUnlockContext.Provider>
  )
}
