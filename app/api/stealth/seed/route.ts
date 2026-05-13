import { NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { aesGcmEncrypt, wrapAesKeyWithPublicKey } from '@/lib/sealed-encryption'
import { randomBytes } from 'crypto'

function sealText(pubKey: string, plaintext: string) {
  const aesKey = randomBytes(32)
  const sealedKeyB64 = wrapAesKeyWithPublicKey(pubKey, aesKey)
  const contentEnc = aesGcmEncrypt(aesKey, plaintext)
  return { sealedKeyB64, contentEnc }
}

const DECOY_CONVERSATIONS = [
  {
    title: 'Weather this week',
    messages: [
      { role: 'user', content: "What's the weather forecast for this week?" },
      { role: 'assistant', content: "I don't have access to real-time weather data, but I can help you find a forecast! You can check weather.com or your phone's built-in weather app for the most accurate local forecast. Would you like tips on how to read weather maps or prepare for specific weather conditions?" },
      { role: 'user', content: 'Good idea, I just checked - looks like rain on Thursday' },
      { role: 'assistant', content: "Thanks for the update! Rain on Thursday - good to know. Here are a few quick tips:\n\n1. **Bring an umbrella** or a waterproof jacket\n2. **Plan indoor activities** if you had outdoor plans\n3. **Check for updates** closer to Thursday as forecasts can change\n\nIs there anything specific you'd like to plan around the rain?" },
    ],
  },
  {
    title: 'Champions League results',
    messages: [
      { role: 'user', content: 'Who won the Champions League this year?' },
      { role: 'assistant', content: "I don't have the most up-to-date sports results. For the latest Champions League results, I'd recommend checking:\n\n- **UEFA.com** for official results\n- **ESPN** or **BBC Sport** for detailed coverage\n- **Google** - just search \"Champions League results\"\n\nWould you like to discuss Champions League history or any particular team's performance?" },
      { role: 'user', content: 'I think Real Madrid had a great season again' },
      { role: 'assistant', content: "Real Madrid is certainly one of the most successful clubs in Champions League history! They hold the record for the most titles. Their legacy includes legendary players and iconic moments.\n\nSome fun facts:\n- **15 Champions League titles** (record holders)\n- Known for dramatic late comebacks\n- Santiago Bernabéu is one of Europe's most iconic stadiums\n\nAre you a Real Madrid fan, or do you follow another club?" },
    ],
  },
]

export async function POST() {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { publicKeySpkiB64: true },
  })

  if (!user?.publicKeySpkiB64) {
    return NextResponse.json({ error: 'Encryption keys not set up' }, { status: 400 })
  }

  const existingDecoys = await prisma.conversation.count({
    where: { userId, isDecoy: true },
  })
  if (existingDecoys > 0) {
    return NextResponse.json({ created: [], count: 0 })
  }

  const pubKey = user.publicKeySpkiB64
  const created: string[] = []

  for (const decoy of DECOY_CONVERSATIONS) {
    const titleSealed = sealText(pubKey, decoy.title)

    const conv = await prisma.conversation.create({
      data: {
        userId,
        sealedKeyB64: titleSealed.sealedKeyB64,
        titleEnc: titleSealed.contentEnc,
        isDecoy: true,
        model: 'gpt-5.5',
      },
    })

    for (const msg of decoy.messages) {
      const sealed = sealText(pubKey, msg.content)
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          role: msg.role,
          contentEnc: sealed.contentEnc,
          sealedKeyB64: sealed.sealedKeyB64,
        },
      })
    }

    created.push(conv.id)
  }

  return NextResponse.json({ created, count: created.length })
}
