import { NextRequest, NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const body = await request.json().catch(() => ({}))
    const publicKeySpkiB64 = typeof body.publicKeySpkiB64 === 'string' ? body.publicKeySpkiB64.trim() : ''
    const privateKeyEncB64 = typeof body.privateKeyEncB64 === 'string' ? body.privateKeyEncB64.trim() : ''
    const keyVersion = typeof body.keyVersion === 'number' ? body.keyVersion : 1

    if (!publicKeySpkiB64 || !privateKeyEncB64) {
      return NextResponse.json(
        { error: 'Missing publicKeySpkiB64 or privateKeyEncB64' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { publicKeySpkiB64: true },
    })
    if (existing?.publicKeySpkiB64) {
      return NextResponse.json(
        { error: 'Keys already registered' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        publicKeySpkiB64,
        privateKeyEncB64,
        keyVersion,
        keysStatus: 'ready',
        keysRegisteredAt: new Date(),
      },
    })
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[keys/register]', (e as Error).message)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
