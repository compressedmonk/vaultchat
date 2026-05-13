import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/session'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    }
    const { email, password } = parsed.data
    const emailLower = email.toLowerCase().trim()
    const ip = getClientIp(request.headers)

    if (
      !checkRateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000) ||
      !checkRateLimit(`login:email:${emailLower}`, 10, 15 * 60 * 1000)
    ) {
      return NextResponse.json(
        { error: 'Too many login attempts. Try again later.' },
        { status: 429 }
      )
    }

    const user = await prisma.user.findUnique({ where: { email: emailLower } })
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    await createSession(user.id)
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        autoUnlockWithLoginPassword: user.encryptionPasswordMode === 'same_as_login',
      },
    })
  } catch (e) {
    console.error('[login]', (e as Error).message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
