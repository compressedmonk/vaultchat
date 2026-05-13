import { NextRequest, NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const conversations = await prisma.conversation.findMany({
    where: { userId },
    select: {
      id: true,
      titleEnc: true,
      sealedKeyB64: true,
      model: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ conversations })
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const sealedKeyB64 = body.sealedKeyB64
  const model = body.model || 'gpt-5.5'

  if (!sealedKeyB64) {
    return NextResponse.json({ error: 'Missing sealedKeyB64' }, { status: 400 })
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId,
      sealedKeyB64,
      model,
    },
  })

  return NextResponse.json({ id: conversation.id })
}
