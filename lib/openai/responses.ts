import type OpenAI from 'openai'

export interface ChatAttachment {
  openaiFileId: string
  filename: string
  mimeType: string
}

export interface Citation {
  url: string
  title?: string
}

type InputContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; file_id: string; detail?: 'auto' | 'low' | 'high' }
  | { type: 'input_file'; file_id: string }

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

export function buildResponsesInput(params: {
  systemPrompt: string
  history: { role: string; content: string }[]
  userMessage: string
  attachments?: ChatAttachment[]
}): OpenAI.Responses.ResponseInput {
  const input: OpenAI.Responses.ResponseInput = [
    {
      role: 'developer',
      content: params.systemPrompt,
    },
  ]

  for (const h of params.history) {
    if (h.role === 'user' || h.role === 'assistant') {
      input.push({
        role: h.role,
        content: h.content,
      })
    }
  }

  const userContent: InputContent[] = []
  if (params.userMessage.trim()) {
    userContent.push({ type: 'input_text', text: params.userMessage })
  }
  for (const att of params.attachments ?? []) {
    if (isImageMime(att.mimeType)) {
      userContent.push({ type: 'input_image', file_id: att.openaiFileId, detail: 'auto' })
    } else {
      userContent.push({ type: 'input_file', file_id: att.openaiFileId })
    }
  }

  if (userContent.length === 0) {
    userContent.push({ type: 'input_text', text: params.userMessage || ' ' })
  }

  input.push({
    role: 'user',
    content: userContent as OpenAI.Responses.ResponseInputMessageContentList,
  })

  return input
}

export function extractCitationsFromResponse(
  response: OpenAI.Responses.Response
): Citation[] {
  const citations: Citation[] = []
  const seen = new Set<string>()

  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue
    for (const part of item.content ?? []) {
      if (part.type !== 'output_text') continue
      for (const ann of part.annotations ?? []) {
        if (ann.type === 'url_citation' && ann.url && !seen.has(ann.url)) {
          seen.add(ann.url)
          citations.push({ url: ann.url, title: ann.title })
        }
      }
    }
  }

  return citations
}

export type StreamEvent =
  | { type: 'content'; delta: string }
  | { type: 'tool_status'; status: 'searching' | 'done' }
  | { type: 'error'; message: string }

/** Normalize Responses API stream events for the existing ChatView SSE parser. */
export function normalizeResponsesStreamEvent(event: unknown): StreamEvent[] {
  if (!event || typeof event !== 'object') return []
  const e = event as Record<string, unknown>
  const out: StreamEvent[] = []

  if (e.type === 'response.output_text.delta' && typeof e.delta === 'string') {
    out.push({ type: 'content', delta: e.delta })
    return out
  }

  if (
    e.type === 'response.web_search_call.searching' ||
    e.type === 'response.web_search_call.in_progress'
  ) {
    out.push({ type: 'tool_status', status: 'searching' })
    return out
  }

  if (e.type === 'response.web_search_call.completed') {
    out.push({ type: 'tool_status', status: 'done' })
    return out
  }

  if (e.type === 'response.output_item.added') {
    const item = e.item as Record<string, unknown> | undefined
    if (item?.type === 'web_search_call') {
      out.push({ type: 'tool_status', status: 'searching' })
    }
    return out
  }

  if (e.type === 'response.output_item.done') {
    const item = e.item as Record<string, unknown> | undefined
    if (item?.type === 'web_search_call') {
      out.push({ type: 'tool_status', status: 'done' })
    }
    return out
  }

  if (e.type === 'error') {
    const err = e.error as { message?: string } | undefined
    out.push({ type: 'error', message: err?.message ?? 'Stream error' })
  }

  return out
}

export function streamEventToSseLine(event: StreamEvent): string {
  if (event.type === 'content') {
    return `data: ${JSON.stringify({
      choices: [{ delta: { content: event.delta } }],
    })}\n\n`
  }
  if (event.type === 'tool_status') {
    return `data: ${JSON.stringify({ toolStatus: event.status })}\n\n`
  }
  if (event.type === 'error') {
    return `data: ${JSON.stringify({ error: event.message })}\n\n`
  }
  return ''
}
