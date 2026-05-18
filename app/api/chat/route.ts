import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { aesGcmEncrypt, wrapAesKeyWithPublicKey } from '@/lib/sealed-encryption'
import { randomBytes } from 'crypto'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { getOpenAI } from '@/lib/openai/client'
import {
  buildResponsesInput,
  extractCitationsFromResponse,
  normalizeResponsesStreamEvent,
  streamEventToSseLine,
  type ChatAttachment,
  type Citation,
} from '@/lib/openai/responses'
import { DEFAULT_MODEL, mapModel, resolveModelForWebSearch } from '@/lib/openai/models'

const CHAT_RATE_LIMIT = 30
const CHAT_RATE_WINDOW_MS = 60 * 1000

const SYSTEM_PROMPT = `You are concise by default. Answer in 2-5 sentences unless the user explicitly asks for detail. No long explanations, no summaries, no extra suggestions.

- Be direct. Answer, then stop.
- Match the user's tone. Casual → casual. Technical → precise.
- Never open with "Certainly!", "Of course!", "Great question!" or similar filler.
- No disclaimers, no sign-offs, no "Let me know if you have questions".
- Don't repeat what the user said. Don't over-format simple replies.
- Use markdown and code blocks only when showing code or when structure genuinely helps.
- Confident, warm, efficient. Say what you think. If you don't know, say so.
- Only become detailed when the user asks for depth or the topic requires it.
- When using web search, cite sources inline with markdown links where relevant.`

function sealMessage(publicKeySpkiB64: string, plaintext: string) {
  const aesKey = randomBytes(32)
  const sealedKeyB64 = wrapAesKeyWithPublicKey(publicKeySpkiB64, aesKey)
  const contentEnc = aesGcmEncrypt(aesKey, plaintext)
  return { sealedKeyB64, contentEnc }
}

function sealOptionalJson(publicKeySpkiB64: string, data: unknown) {
  if (!data || (Array.isArray(data) && data.length === 0)) return null
  const json = JSON.stringify(data)
  const aesKey = randomBytes(32)
  const sealedKeyB64 = wrapAesKeyWithPublicKey(publicKeySpkiB64, aesKey)
  const contentEnc = aesGcmEncrypt(aesKey, json)
  return { sealedKeyB64, contentEnc }
}

async function loadAttachments(
  userId: string,
  attachmentIds: string[]
): Promise<ChatAttachment[]> {
  if (!attachmentIds.length) return []

  const files = await prisma.uploadedFile.findMany({
    where: {
      id: { in: attachmentIds },
      userId,
    },
  })

  const byId = new Map(files.map((f) => [f.id, f]))
  const result: ChatAttachment[] = []

  for (const id of attachmentIds) {
    const f = byId.get(id)
    if (!f?.openaiFileId || !f.filename || !f.mimeType) continue
    result.push({
      openaiFileId: f.openaiFileId,
      filename: f.filename,
      mimeType: f.mimeType,
    })
  }

  return result
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

async function streamResponsesToClient(
  stream: AsyncIterable<unknown>,
  onComplete: (fullText: string, citations: Citation[]) => Promise<void>
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder()
  let fullResponse = ''
  let finalResponse: OpenAI.Responses.Response | null = null

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event &&
            typeof event === 'object' &&
            'type' in event &&
            (event as { type: string }).type === 'response.completed' &&
            'response' in event
          ) {
            finalResponse = (event as { response: OpenAI.Responses.Response }).response
          }

          for (const normalized of normalizeResponsesStreamEvent(event)) {
            if (normalized.type === 'content') {
              fullResponse += normalized.delta
            }
            const line = streamEventToSseLine(normalized)
            if (line) controller.enqueue(encoder.encode(line))
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()

        const citations = finalResponse
          ? extractCitationsFromResponse(finalResponse)
          : []

        if (fullResponse) {
          await onComplete(fullResponse, citations)
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Stream error'
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`)
        )
        controller.close()
      }
    },
  })
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
  const isTemporary: boolean = body.temporary === true
  const webSearch: boolean = body.webSearch === true
  const attachmentIds: string[] = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.filter((id: unknown) => typeof id === 'string')
    : []

  if (!userMessage.trim() && attachmentIds.length === 0) {
    return NextResponse.json({ error: 'Empty message' }, { status: 400 })
  }

  const attachments = await loadAttachments(userId, attachmentIds)
  if (attachmentIds.length > 0 && attachments.length !== attachmentIds.length) {
    return NextResponse.json({ error: 'Invalid attachment' }, { status: 400 })
  }

  const model = resolveModelForWebSearch(requestModel, webSearch)
  const tools = webSearch
    ? [{ type: 'web_search_preview' as const }]
    : undefined

  const openai = getOpenAI()
  const input = buildResponsesInput({
    systemPrompt: SYSTEM_PROMPT,
    history,
    userMessage,
    attachments,
  })

  if (!isTemporary) {
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
      const titleSealedKeyB64 = wrapAesKeyWithPublicKey(pubKey, randomBytes(32))

      const created = await prisma.conversation.create({
        data: {
          userId,
          sealedKeyB64: titleSealedKeyB64,
          model: mapModel(requestModel),
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

    const { sealedKeyB64: userSealedKey, contentEnc: userContentEnc } = sealMessage(
      pubKey,
      userMessage || '(attachment)'
    )
    const userMsg = await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        contentEnc: userContentEnc,
        sealedKeyB64: userSealedKey,
      },
    })

    if (attachmentIds.length > 0) {
      for (const fileId of attachmentIds) {
        await prisma.messageAttachment.create({
          data: { messageId: userMsg.id, fileId },
        }).catch(() => {})
      }
    }

    const convId = conversationId
    const shouldGenerateTitle = isNew

    let stream: AsyncIterable<unknown>
    try {
      stream = await openai.responses.create({
        model,
        input,
        tools,
        stream: true,
        store: false,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OpenAI error'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const readableStream = await streamResponsesToClient(
      stream,
      async (fullResponse, citations) => {
        const { sealedKeyB64: asstSealedKey, contentEnc: asstContentEnc } = sealMessage(
          pubKey,
          fullResponse
        )
        const citationsSeal = sealOptionalJson(pubKey, citations)

        await prisma.message.create({
          data: {
            conversationId: convId,
            role: 'assistant',
            contentEnc: asstContentEnc,
            sealedKeyB64: asstSealedKey,
            citationsEnc: citationsSeal?.contentEnc ?? null,
            citationsSealedKeyB64: citationsSeal?.sealedKeyB64 ?? null,
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
    )

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

  // Temporary chat: no DB writes
  let stream: AsyncIterable<unknown>
  try {
    stream = await openai.responses.create({
      model,
      input,
      tools,
      stream: true,
      store: false,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OpenAI error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const readableStream = await streamResponsesToClient(stream, async () => {})

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
