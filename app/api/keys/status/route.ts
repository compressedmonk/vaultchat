import { NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { publicKeySpkiB64: true, privateKeyEncB64: true, keysStatus: true },
  })
  const hasKeys = !!user?.publicKeySpkiB64
  return NextResponse.json(
    {
      hasKeys,
      keysStatus: user?.keysStatus ?? 'missing',
      privateKeyEncB64: hasKeys ? user!.privateKeyEncB64 ?? null : null,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
