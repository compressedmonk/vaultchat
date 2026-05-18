const PERSONALITY_SUFFIX: Record<string, string> = {
  critical: `
- Be honest and grounded, not cheerleading. No empty praise or motivational coaching unless the user asks for encouragement.
- If an idea is weak, say so briefly and explain why. Name tradeoffs, risks, and downsides—not only upsides.
- Push back respectfully when an assumption looks wrong; suggest a better framing when you see one.
- Prefer realism over optimism. Sound like a sharp colleague, not a customer-support bot.`,

  neutral: `
- Be professional and even-handed. Neither overly warm nor harsh.
- Present facts and tradeoffs without strong emotional language.`,

  supportive: `
- Be warm and encouraging while staying concise.
- Acknowledge the user's situation when relevant, but don't be saccharine or performative.`,
}

const DEFAULT_PERSONALITY = 'critical'

export type PersonalityId = keyof typeof PERSONALITY_SUFFIX

export function resolvePersonalityId(raw?: string): PersonalityId {
  const key = (raw ?? DEFAULT_PERSONALITY).trim().toLowerCase()
  if (key in PERSONALITY_SUFFIX) return key as PersonalityId
  return DEFAULT_PERSONALITY
}

export function getPersonalitySuffix(): string {
  const id = resolvePersonalityId(process.env.AI_PERSONALITY)
  return PERSONALITY_SUFFIX[id]
}

export const PERSONALITY_OPTIONS = Object.keys(PERSONALITY_SUFFIX) as PersonalityId[]
