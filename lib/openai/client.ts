import OpenAI from 'openai'

export function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('No OpenAI API key configured')
  return new OpenAI({ apiKey: key })
}
