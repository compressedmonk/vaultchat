export interface ChatModel {
  id: string
  label: string
  supportsWebSearch: boolean
  supportsVision: boolean
}

export const CHAT_MODELS: ChatModel[] = [
  { id: 'gpt-4o', label: 'GPT-4o', supportsWebSearch: true, supportsVision: true },
  { id: 'gpt-4.1', label: 'GPT-4.1', supportsWebSearch: true, supportsVision: true },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', supportsWebSearch: true, supportsVision: true },
  { id: 'o4-mini', label: 'o4-mini', supportsWebSearch: true, supportsVision: true },
  { id: 'o3', label: 'o3', supportsWebSearch: true, supportsVision: true },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', supportsWebSearch: true, supportsVision: true },
]

export const DEFAULT_MODEL = 'gpt-4o'

const LEGACY_MODEL_MAP: Record<string, string> = {
  'gpt-5.5': 'gpt-4o',
  'gpt-5.5-pro': 'gpt-4.1',
  'gpt-5.4': 'gpt-4.1',
  'gpt-5': 'gpt-4o',
}

export function mapModel(modelId: string): string {
  const known = CHAT_MODELS.find((m) => m.id === modelId)
  if (known) return known.id
  return LEGACY_MODEL_MAP[modelId] ?? DEFAULT_MODEL
}

export function getModel(modelId: string): ChatModel {
  const mapped = mapModel(modelId)
  return CHAT_MODELS.find((m) => m.id === mapped) ?? CHAT_MODELS[0]
}

export function resolveModelForWebSearch(modelId: string, webSearch: boolean): string {
  const mapped = mapModel(modelId)
  if (!webSearch) return mapped
  const model = getModel(mapped)
  if (model.supportsWebSearch) return mapped
  return DEFAULT_MODEL
}
