import { NextRequest, NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { getOpenAI } from '@/lib/openai/client'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const file = await prisma.uploadedFile.findFirst({
    where: { id, userId },
  })
  if (!file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    fileId: file.id,
    filename: file.filename,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt,
  })
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
  const file = await prisma.uploadedFile.findFirst({
    where: { id, userId },
  })
  if (!file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (file.openaiFileId) {
    try {
      const openai = getOpenAI()
      await openai.files.del(file.openaiFileId)
    } catch {
      // best-effort cleanup
    }
  }

  await prisma.uploadedFile.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
