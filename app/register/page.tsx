'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { deriveKek, encryptWithKek } from '@/lib/crypto/client-crypto'
import { PasswordInput } from '@/app/components/ui/PasswordInput'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [encMode, setEncMode] = useState<'same_as_login' | 'custom'>('same_as_login')
  const [encPassword, setEncPassword] = useState('')
  const [confirmEncPassword, setConfirmEncPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (encMode === 'custom') {
      if (encPassword.length < 12) {
        setError('Encryption password must be at least 12 characters.')
        return
      }
      if (encPassword === password) {
        setError('Encryption password should be different from your login password.')
        return
      }
      if (encPassword !== confirmEncPassword) {
        setError('Encryption passwords do not match.')
        return
      }
    }

    const keyPassword = encMode === 'custom' ? encPassword : password

    setLoading(true)
    try {
      const saltBytes = crypto.getRandomValues(new Uint8Array(16))
      const encryptionSalt = btoa(String.fromCharCode(...Array.from(saltBytes)))

      const kek = await deriveKek(keyPassword, encryptionSalt, 200_000)

      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
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

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          confirmPassword,
          encryptionPasswordMode: encMode,
          encryptionSalt,
          publicKeySpkiB64,
          privateKeyEncB64,
          keyVersion: 1,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Registration failed')
        return
      }

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (loginRes.ok) {
        sessionStorage.setItem('vault_auto_unlock_pwd', keyPassword)
        router.push('/chat')
      } else {
        router.push('/login')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Create account
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Your keys are generated in the browser
          </p>
        </div>

        <form onSubmit={handleSubmit} className="vault-card space-y-4">
          {error && (
            <div className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Email
            </label>
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
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Login password
            </label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
            />
            {password.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {[
                  { ok: password.length >= 8, label: '8+ characters' },
                  { ok: /[A-Z]/.test(password), label: 'Uppercase letter' },
                  { ok: /[a-z]/.test(password), label: 'Lowercase letter' },
                  { ok: /[0-9]/.test(password), label: 'Number' },
                ].map((r) => (
                  <div key={r.label} className="flex items-center gap-1.5 text-xs" style={{ color: r.ok ? 'var(--success)' : 'var(--text-muted)' }}>
                    {r.ok ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>
                    )}
                    {r.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Confirm login password
            </label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              required
            />
          </div>

          <div
            className="rounded-lg p-3"
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}
          >
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Encryption password
            </p>

            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="radio"
                name="encMode"
                checked={encMode === 'same_as_login'}
                onChange={() => setEncMode('same_as_login')}
                className="accent-[var(--accent)]"
              />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                Same as login password
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="encMode"
                checked={encMode === 'custom'}
                onChange={() => setEncMode('custom')}
                className="accent-[var(--accent)]"
              />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                Separate encryption password
              </span>
            </label>

            {encMode === 'custom' && (
              <div className="mt-3 space-y-3">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Even if someone gets your login password, they cannot decrypt your data without this separate key.
                </p>
                <PasswordInput
                  value={encPassword}
                  onChange={(e) => setEncPassword(e.target.value)}
                  placeholder="Min. 12 characters"
                  required
                />
                <PasswordInput
                  value={confirmEncPassword}
                  onChange={(e) => setConfirmEncPassword(e.target.value)}
                  placeholder="Confirm encryption password"
                  required
                />
              </div>
            )}
          </div>

          <button type="submit" disabled={loading} className="vault-btn-primary w-full">
            {loading ? 'Generating keys...' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm mt-4" style={{ color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link href="/login" className="font-medium" style={{ color: 'var(--accent)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
