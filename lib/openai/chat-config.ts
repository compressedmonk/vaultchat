import type OpenAI from 'openai'
import { getPersonalitySuffix } from '@/lib/ai/personality'

export type ChatResponseStyle = 'concise' | 'balanced' | 'detailed'

const STYLE_PROMPTS: Record<ChatResponseStyle, string> = {
  concise: `You are concise by default. Answer in 2-5 sentences unless the user explicitly asks for detail. No long explanations, no summaries, no extra suggestions unless asked.

- Be direct. Answer, then stop.
- Match the user's language and tone. Casual → casual. Technical → precise.
- Never open with "Certainly!", "Of course!", "Great question!" or similar filler.
- No disclaimers, no sign-offs, no "Let me know if you have questions".
- Don't repeat what the user said. Don't over-format simple replies.
- Use markdown and code blocks only when showing code or when structure genuinely helps.
- If you don't know, say so plainly.
- Only become detailed when the user asks for depth or the topic requires it.
- When using web search, cite sources inline with markdown links where relevant.`,

  balanced: `Give clear, complete answers without being verbose. Usually 1-3 short paragraphs; use bullets or headings when they help.

- Be direct and substantive. Answer the question fully, then stop.
- Match the user's language and tone. Casual → casual. Technical → precise.
- Never open with filler ("Certainly!", "Great question!", etc.).
- No disclaimers, no sign-offs, no "Let me know if you have questions".
- Don't repeat what the user said. Don't pad with generic advice.
- Use markdown and code blocks when showing code or when structure genuinely helps.
- If you don't know, say so plainly.
- Go deeper only when the user asks for detail or the topic clearly needs it.
- When using web search, cite sources inline with markdown links where relevant.`,

  detailed: `Give thorough, well-structured answers. Use sections, bullets, or examples when they clarify complex topics.

- Be complete and organized; avoid unnecessary repetition or filler.
- Match the user's language and tone. Casual → casual. Technical → precise.
- Never open with filler ("Certainly!", "Great question!", etc.).
- No disclaimers, no sign-offs, no "Let me know if you have questions" unless the user wants next steps.
- Use markdown and code blocks when showing code or when structure helps.
- If you don't know, say so plainly and say what would help.
- When using web search, cite sources inline with markdown links where relevant.`,
}

const DEFAULT_STYLE: ChatResponseStyle = 'balanced'
const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_OUTPUT_TOKENS = 2048
const DEFAULT_REASONING_EFFORT = 'medium' as const

function parseFloatEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim()
  if (!raw) return fallback
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

function parseIntEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim()
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function resolveResponseStyle(raw?: string): ChatResponseStyle {
  const key = (raw ?? DEFAULT_STYLE).trim().toLowerCase()
  if (key in STYLE_PROMPTS) return key as ChatResponseStyle
  return DEFAULT_STYLE
}

function resolveReasoningEffort(raw?: string): 'low' | 'medium' | 'high' {
  const key = (raw ?? DEFAULT_REASONING_EFFORT).trim().toLowerCase()
  if (key === 'low' || key === 'medium' || key === 'high') return key
  return DEFAULT_REASONING_EFFORT
}

export interface ChatGenerationParams {
  systemPrompt: string
  temperature: number
  max_output_tokens: number
  top_p?: number
  reasoning?: OpenAI.Reasoning
}

export function getChatGenerationParams(model: string): ChatGenerationParams {
  const style = resolveResponseStyle(process.env.CHAT_RESPONSE_STYLE)
  const systemPrompt = STYLE_PROMPTS[style] + getPersonalitySuffix()

  const temperature = parseFloatEnv('CHAT_TEMPERATURE', DEFAULT_TEMPERATURE)
  const max_output_tokens = parseIntEnv('CHAT_MAX_OUTPUT_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS)

  const topPRaw = process.env.CHAT_TOP_P?.trim()
  let top_p: number | undefined
  if (topPRaw) {
    const n = Number.parseFloat(topPRaw)
    if (Number.isFinite(n) && n > 0 && n <= 1) top_p = n
  }

  const params: ChatGenerationParams = {
    systemPrompt,
    temperature,
    max_output_tokens,
  }

  if (top_p != null) params.top_p = top_p

  if (/^o\d/i.test(model)) {
    params.reasoning = {
      effort: resolveReasoningEffort(process.env.CHAT_REASONING_EFFORT),
    }
  }

  return params
}
