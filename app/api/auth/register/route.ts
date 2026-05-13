import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const registerSchema = z
  .object({
    email: z
      .string()
      .email('Please enter a valid email address.')
      .transform((s) => s.trim().toLowerCase()),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
      .regex(/[0-9]/, 'Password must contain at least one number.'),
    confirmPassword: z.string(),
    encryptionPasswordMode: z.enum(['same_as_login', 'custom']).default('same_as_login'),
    encryptionSalt: z.string().min(1, 'Encryption salt is required.'),
    publicKeySpkiB64: z.string().min(1, 'Encryption keys are required.'),
    privateKeyEncB64: z.string().min(1, 'Encryption keys are required.'),
    keyVersion: z.number().int().min(1).default(1),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers)
    if (!checkRateLimit(`register:ip:${ip}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Try again later.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.errors[0]
      return NextResponse.json({ error: first?.message ?? 'Invalid input' }, { status: 400 })
    }

    const { email, password, encryptionPasswordMode, encryptionSalt, publicKeySpkiB64, privateKeyEncB64, keyVersion } =
      parsed.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'This email is already registered.' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        encryptionSalt,
        encryptionPasswordMode,
        publicKeySpkiB64,
        privateKeyEncB64,
        keyVersion,
        keysStatus: 'ready',
        keysRegisteredAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Account created.',
      userId: user.id,
    })
  } catch (e) {
    console.error('[register]', (e as Error).message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
