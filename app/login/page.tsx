import { Suspense } from 'react'
import { isRegistrationDisabled } from '@/lib/registration'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        </div>
      }
    >
      <LoginForm registrationDisabled={isRegistrationDisabled()} />
    </Suspense>
  )
}
