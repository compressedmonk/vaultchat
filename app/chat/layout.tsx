import { redirect } from 'next/navigation'
import { getSessionUserId } from '@/lib/session'

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId()
  if (!userId) {
    redirect('/login')
  }
  return <>{children}</>
}
