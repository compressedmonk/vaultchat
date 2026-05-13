'use client'

import { useEffect, useState, useRef, type ReactNode } from 'react'
import { useVaultUnlock, type VaultUserForUnlock } from '@/app/components/security/VaultUnlockProvider'

interface MeUser extends VaultUserForUnlock {
  encryptionPasswordMode: string
}

export function VaultGate({ children }: { children: ReactNode }) {
  const { unlocked, unlock, error, clearError } = useVaultUnlock()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [me, setMe] = useState<MeUser | null>(null)
  const [fetchError, setFetchError] = useState('')
  const autoUnlockAttempted = useRef(false)

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setMe(d.user)
        else setFetchError('Failed to load user data')
      })
      .catch(() => setFetchError('Network error'))
  }, [])

  useEffect(() => {
    if (!me || unlocked || autoUnlockAttempted.current) return
    if (me.encryptionPasswordMode !== 'same_as_login') return

    const savedPwd = sessionStorage.getItem('vault_auto_unlock_pwd')
    if (!savedPwd) return

    autoUnlockAttempted.current = true
    sessionStorage.removeItem('vault_auto_unlock_pwd')
    setLoading(true)

    unlock(savedPwd, me)
      .catch(() => {
        // auto-unlock failed, user will see the manual unlock screen
      })
      .finally(() => setLoading(false))
  }, [me, unlocked, unlock])

  if (unlocked) return <>{children}</>

  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="vault-card text-center max-w-sm">
          <p style={{ color: 'var(--danger)' }}>{fetchError}</p>
        </div>
      </div>
    )
  }

  if (!me || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          {loading ? 'Unlocking vault...' : 'Loading...'}
        </div>
      </div>
    )
  }

  const isCustom = me.encryptionPasswordMode === 'custom'

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    if (!me) return
    clearError()
    setLoading(true)
    try {
      await unlock(password, me)
    } catch {
      // error is set via context
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-subtle)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Unlock your vault
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {isCustom
              ? 'Enter your separate encryption password'
              : 'Enter your password to decrypt conversations'}
          </p>
        </div>

        <form onSubmit={handleUnlock} className="vault-card space-y-4">
          {error && (
            <div className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="vault-input"
            placeholder={isCustom ? 'Encryption password' : 'Login password'}
            required
            autoFocus
          />
          {isCustom && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              This is your separate encryption password, not your login password.
            </p>
          )}
          <button type="submit" disabled={loading} className="vault-btn-primary w-full">
            {loading ? 'Decrypting...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}
