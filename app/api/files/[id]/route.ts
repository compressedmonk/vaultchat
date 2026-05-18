import { NextRequest, NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { deleteUploadedFileRecord } from '@/lib/file-retention'

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

  await deleteUploadedFileRecord(file)
  return NextResponse.json({ ok: true })
}
