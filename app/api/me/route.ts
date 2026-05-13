import { NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

const KDF_ITERATIONS = 200_000

export async function GET() {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, encryptionSalt: true, keysStatus: true, encryptionPasswordMode: true, publicKeySpkiB64: true },
  })
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let { encryptionSalt } = user
  if (!encryptionSalt) {
    encryptionSalt = randomBytes(16).toString('base64')
    await prisma.user.update({
      where: { id: userId },
      data: { encryptionSalt },
    })
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      keysStatus: user.keysStatus ?? 'missing',
      encryptionPasswordMode: user.encryptionPasswordMode ?? 'same_as_login',
      publicKeySpkiB64: user.publicKeySpkiB64 ?? null,
      encryptionSalt,
      kdf: {
        name: 'PBKDF2',
        iterations: KDF_ITERATIONS,
        hash: 'SHA-256',
      },
    },
  })
}
