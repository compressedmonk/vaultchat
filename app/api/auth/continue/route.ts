import { NextResponse } from 'next/server'
import { refreshAuthIntent } from '@/lib/session'

export async function POST() {
  const ok = await refreshAuthIntent()
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ success: true })
}
