import { NextRequest, NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId },
  })
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    select: {
      id: true,
      role: true,
      contentEnc: true,
      sealedKeyB64: true,
      tokenCount: true,
      model: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ messages })
}
