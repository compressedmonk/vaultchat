import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { aesGcmEncrypt, wrapAesKeyWithPublicKey } from '@/lib/sealed-encryption'
import { randomBytes } from 'crypto'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const CHAT_RATE_LIMIT = 30
const CHAT_RATE_WINDOW_MS = 60 * 1000
const DEFAULT_MODEL = 'gpt-5.5'

const SYSTEM_PROMPT = `You are concise by default. Answer in 2-5 sentences unless the user explicitly asks for detail. No long explanations, no summaries, no extra suggestions.

- Be direct. Answer, then stop.
- Match the user's tone. Casual → casual. Technical → precise.
- Never open with "Certainly!", "Of course!", "Great question!" or similar filler.
- No disclaimers, no sign-offs, no "Let me know if you have questions".
- Don't repeat what the user said. Don't over-format simple replies.
- Use markdown and code blocks only when showing code or when structure genuinely helps.
- Confident, warm, efficient. Say what you think. If you don't know, say so.
- Only become detailed when the user asks for depth or the topic requires it.`

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('No OpenAI API key configured')
  return new OpenAI({ apiKey: key })
}

function sealMessage(publicKeySpkiB64: string, plaintext: string) {
  const aesKey = randomBytes(32)
  const sealedKeyB64 = wrapAesKeyWithPublicKey(publicKeySpkiB64, aesKey)
  const contentEnc = aesGcmEncrypt(aesKey, plaintext)
  return { sealedKeyB64, contentEnc }
}

async function generateTitle(
  openai: OpenAI,
  userMessage: string,
  assistantReply: string,
  pubKey: string,
  convId: string
) {
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4.1-nano',
      messages: [
        {
          role: 'system',
          content: 'Generate a short title (max 6 words) for this conversation. Return ONLY the title, nothing else. No quotes.',
        },
        { role: 'user', content: userMessage },
        { role: 'assistant', content: assistantReply.slice(0, 500) },
      ],
      max_tokens: 20,
      temperature: 0.5,
    })

    const title = res.choices[0]?.message?.content?.trim()
    if (!title) return

    const aesKey = randomBytes(32)
    const titleSealedKeyB64 = wrapAesKeyWithPublicKey(pubKey, aesKey)
    const titleEnc = aesGcmEncrypt(aesKey, title)

    await prisma.conversation.update({
      where: { id: convId },
      data: { titleEnc, sealedKeyB64: titleSealedKeyB64 },
    })
  } catch (e) {
    console.error('[auto-title]', (e as Error).message)
  }
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ip = getClientIp(request.headers)
  if (!checkRateLimit(`chat:${userId}`, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'Rate limited. Please wait.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const userMessage: string = body.message ?? ''
  let conversationId: string | null = body.conversationId ?? null
  const history: { role: string; content: string }[] = body.history ?? []
  const requestModel: string = body.model ?? DEFAULT_MODEL
  const isDecoy: boolean = body.isDecoy === true

  if (!userMessage.trim()) {
    return NextResponse.json({ error: 'Empty message' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { publicKeySpkiB64: true },
  })
  if (!user?.publicKeySpkiB64) {
    return NextResponse.json({ error: 'Encryption keys not set up' }, { status: 400 })
  }

  const pubKey = user.publicKeySpkiB64
  let isNew = false

  if (!conversationId) {
    const titleAesKey = randomBytes(32)
    const titleSealedKeyB64 = wrapAesKeyWithPublicKey(pubKey, titleAesKey)

    const created = await prisma.conversation.create({
      data: {
        userId,
        sealedKeyB64: titleSealedKeyB64,
        model: requestModel,
        isDecoy,
      },
    })
    conversationId = created.id
    isNew = true
  } else {
    const existing = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
  }

  const { sealedKeyB64: userSealedKey, contentEnc: userContentEnc } = sealMessage(pubKey, userMessage)
  await prisma.message.create({
    data: {
      conversationId,
      role: 'user',
      contentEnc: userContentEnc,
      sealedKeyB64: userSealedKey,
    },
  })

  const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ]

  for (const h of history) {
    if (h.role === 'user' || h.role === 'assistant') {
      apiMessages.push({ role: h.role, content: h.content })
    }
  }
  apiMessages.push({ role: 'user', content: userMessage })

  const openai = getOpenAI()
  const model = requestModel

  let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
  try {
    stream = await openai.chat.completions.create({
      model,
      messages: apiMessages,
      stream: true,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OpenAI error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const encoder = new TextEncoder()
  let fullResponse = ''
  const convId = conversationId
  const shouldGenerateTitle = isNew

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            fullResponse += content
          }
          const line = `data: ${JSON.stringify(chunk)}\n\n`
          controller.enqueue(encoder.encode(line))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()

        if (fullResponse) {
          const { sealedKeyB64: asstSealedKey, contentEnc: asstContentEnc } = sealMessage(
            pubKey,
            fullResponse
          )
          await prisma.message.create({
            data: {
              conversationId: convId,
              role: 'assistant',
              contentEnc: asstContentEnc,
              sealedKeyB64: asstSealedKey,
              model,
            },
          })
          await prisma.conversation.update({
            where: { id: convId },
            data: { updatedAt: new Date() },
          })

          if (shouldGenerateTitle) {
            generateTitle(openai, userMessage, fullResponse, pubKey, convId)
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Stream error'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`))
        controller.close()
      }
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Conversation-Id': conversationId,
      'X-Is-New': isNew ? '1' : '0',
    },
  })
}
