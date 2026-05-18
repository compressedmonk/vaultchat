import { NextRequest, NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { getOpenAI } from '@/lib/openai/client'
import { checkRateLimit } from '@/lib/rate-limit'
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES, resolveMimeType } from '@/lib/files'
import { toFile } from 'openai'

const UPLOAD_RATE_LIMIT = 10
const UPLOAD_RATE_WINDOW_MS = 60 * 1000

export async function POST(request: NextRequest) {
  console.info('[files] upload request received')
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!checkRateLimit(`upload:${userId}`, UPLOAD_RATE_LIMIT, UPLOAD_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'Rate limited. Please wait.' }, { status: 429 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const entry = formData.get('file')
  if (!entry || typeof entry === 'string' || !(entry instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const blob = entry as Blob & { name?: string }
  const filename =
    typeof blob.name === 'string' && blob.name.length > 0 ? blob.name : 'upload'

  if (blob.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` },
      { status: 400 }
    )
  }

  const mimeType = resolveMimeType(filename, blob.type)
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json({ error: `File type not allowed: ${mimeType}` }, { status: 400 })
  }

  const conversationId = formData.get('conversationId')
  const convId =
    typeof conversationId === 'string' && conversationId.length > 0 ? conversationId : null

  if (convId) {
    const conv = await prisma.conversation.findFirst({
      where: { id: convId, userId },
    })
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
  }

  const buffer = Buffer.from(await blob.arrayBuffer())
  const openai = getOpenAI()

  let openaiFileId: string
  try {
    const uploaded = await openai.files.create({
      file: await toFile(buffer, filename, { type: mimeType }),
      purpose: 'user_data',
    })
    openaiFileId = uploaded.id
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OpenAI upload failed'
    console.error('[files] OpenAI upload failed:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const record = await prisma.uploadedFile.create({
    data: {
      userId,
      conversationId: convId,
      filename,
      openaiFileId,
      mimeType,
      sizeBytes: blob.size,
    },
  })

  return NextResponse.json({
    fileId: record.id,
    filename: record.filename,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
  })
}
