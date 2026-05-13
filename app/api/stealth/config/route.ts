import { NextResponse } from 'next/server'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET() {
  const code = process.env.STEALTH_CODE
  if (!code) {
    return NextResponse.json({ enabled: false })
  }

  const codeHash = createHash('sha256').update(code).digest('hex')

  return NextResponse.json({
    enabled: true,
    codeHash,
    codeLength: code.length,
  })
}
