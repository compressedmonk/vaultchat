import { cookies } from 'next/headers'
import { randomBytes, createHash } from 'crypto'
import { prisma } from './prisma'

const SESSION_COOKIE = 'session'
const SESSION_MAX_AGE = 30 * 24 * 60 * 60

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000)
  await prisma.session.create({
    data: { userId, tokenHash, expiresAt },
  })
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })
  return token
}

export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  const tokenHash = hashToken(token)
  const session = await prisma.session.findFirst({
    where: {
      tokenHash,
      expiresAt: { gt: new Date() },
    },
  })
  if (!session) return null
  return session.userId
}

export async function getSessionUser(): Promise<{
  id: string
  email: string
  keysStatus: string
} | null> {
  const userId = await getSessionUserId()
  if (!userId) return null
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, keysStatus: true, publicKeySpkiB64: true },
  })
  if (!user) return null
  const keysStatus =
    user.keysStatus === 'ready' || user.publicKeySpkiB64 ? 'ready' : 'missing'
  return { id: user.id, email: user.email, keysStatus }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) {
    const tokenHash = hashToken(token)
    await prisma.session.deleteMany({ where: { tokenHash } })
  }
  cookieStore.delete(SESSION_COOKIE)
}
