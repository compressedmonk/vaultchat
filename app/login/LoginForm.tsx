'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PasswordInput } from '@/app/components/ui/PasswordInput'
import { useVaultUnlock } from '@/app/components/security/VaultUnlockProvider'
import { REGISTRATION_CLOSED_MESSAGE } from '@/lib/registration'

interface ActiveUser {
  email: string
  encryptionPasswordMode: string
  encryptionSalt: string
  kdf: { name: string; iterations: number; hash: string }
}

export function LoginForm({ registrationDisabled }: { registrationDisabled: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') || '/chat'
  const { unlock } = useVaultUnlock()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) {
          setActiveUser(d.user)
          setEmail(d.user.email ?? '')
        }
      })
      .finally(() => setCheckingSession(false))
  }, [])

  async function goToChatAfterAuth(keyPassword: string, me: ActiveUser) {
    if (me.encryptionPasswordMode === 'same_as_login') {
      try {
        await unlock(keyPassword, me)
      } catch {
        router.push(nextPath)
        return
      }
    }
    router.push(nextPath)
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }
      const meRes = await fetch('/api/me')
      const meData = await meRes.json()
      if (!meData.user) {
        setError('Failed to load account')
        return
      }
      await goToChatAfterAuth(password, meData.user)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    if (!activeUser) return
    setError('')
    setLoading(true)
    try {
      const cont = await fetch('/api/auth/continue', { method: 'POST' })
      if (!cont.ok) {
        setError('Session expired. Please sign in again.')
        setActiveUser(null)
        return
      }
      await goToChatAfterAuth(password, activeUser)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setActiveUser(null)
    setEmail('')
    setPassword('')
    setError('')
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    )
  }

  const errorBox = error ? (
    <div className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
      {error}
    </div>
  ) : null

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            VaultChat
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {activeUser ? 'Sign in to continue' : 'Private AI workspace'}
          </p>
        </div>

        {activeUser ? (
          <form onSubmit={handleContinue} className="vault-card space-y-4">
            {errorBox}
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Signed in as <span className="font-medium">{activeUser.email}</span>
            </p>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {activeUser.encryptionPasswordMode === 'custom' ? 'Encryption password' : 'Password'}
              </label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoFocus
              />
            </div>
            <button type="submit" disabled={loading} className="vault-btn-primary w-full">
              {loading ? 'Opening...' : 'Continue'}
            </button>
            <button type="button" onClick={handleSignOut} className="w-full text-sm" style={{ color: 'var(--text-muted)' }}>
              Sign out
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignIn} className="vault-card space-y-4">
            {errorBox}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="vault-input"
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Password</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            <button type="submit" disabled={loading} className="vault-btn-primary w-full">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        )}

        {registrationDisabled && !activeUser && (
          <p className="text-center text-sm mt-4" style={{ color: 'var(--text-muted)' }}>
            {REGISTRATION_CLOSED_MESSAGE}
          </p>
        )}
      </div>
    </div>
  )
}
