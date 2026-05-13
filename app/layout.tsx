import type { Metadata } from 'next'
import './globals.css'
import { VaultUnlockProvider } from './components/security/VaultUnlockProvider'

export const metadata: Metadata = {
  title: {
    default: 'VaultChat',
    template: '%s | VaultChat',
  },
  description: 'Private AI workspace with zero-knowledge encryption.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" translate="no" className="dark" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <VaultUnlockProvider>
          {children}
        </VaultUnlockProvider>
      </body>
    </html>
  )
}
