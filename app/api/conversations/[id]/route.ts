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
    select: { id: true, titleEnc: true, sealedKeyB64: true, model: true },
  })
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(conversation)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const existing = await prisma.conversation.findFirst({
    where: { id, userId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if (typeof body.titleEnc === 'string') data.titleEnc = body.titleEnc
  if (typeof body.sealedKeyB64 === 'string') data.sealedKeyB64 = body.sealedKeyB64
  if (typeof body.model === 'string') data.model = body.model

  const updated = await prisma.conversation.update({
    where: { id },
    data,
  })
  return NextResponse.json({ id: updated.id })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const existing = await prisma.conversation.findFirst({
    where: { id, userId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.conversation.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
