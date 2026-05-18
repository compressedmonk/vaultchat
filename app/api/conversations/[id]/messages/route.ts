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
      citationsEnc: true,
      citationsSealedKeyB64: true,
      tokenCount: true,
      model: true,
      createdAt: true,
      attachments: {
        select: {
          file: {
            select: {
              id: true,
              filename: true,
              mimeType: true,
              sizeBytes: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const formatted = messages.map((m) => ({
    id: m.id,
    role: m.role,
    contentEnc: m.contentEnc,
    sealedKeyB64: m.sealedKeyB64,
    citationsEnc: m.citationsEnc,
    citationsSealedKeyB64: m.citationsSealedKeyB64,
    tokenCount: m.tokenCount,
    model: m.model,
    createdAt: m.createdAt,
    attachments: m.attachments
      .map((a) => a.file)
      .filter((f) => f.filename)
      .map((f) => ({
        fileId: f.id,
        filename: f.filename!,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
      })),
  }))

  return NextResponse.json({ messages: formatted })
}
