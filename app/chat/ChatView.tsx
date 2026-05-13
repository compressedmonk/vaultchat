'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useVaultUnlock } from '@/app/components/security/VaultUnlockProvider'
import {
  decryptSealedAesKey,
  decryptAesGcmWithRawKey,
} from '@/lib/crypto/client-crypto'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'

const AVAILABLE_MODELS = [
  { id: 'gpt-5.5', label: 'GPT-5.5' },
  { id: 'gpt-5.5-pro', label: 'GPT-5.5 Pro' },
  { id: 'gpt-5.4', label: 'GPT-5.4' },
  { id: 'gpt-5', label: 'GPT-5' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'o4-mini', label: 'o4-mini' },
  { id: 'o3', label: 'o3' },
]

const DEFAULT_MODEL = 'gpt-5.5'
const MODEL_STORAGE_KEY = 'vaultchat_model'

const SUGGESTIONS = [
  { icon: '💡', text: 'Explain a concept', prompt: 'Explain quantum computing in simple terms' },
  { icon: '✍️', text: 'Help me write', prompt: 'Help me write a professional email' },
  { icon: '🔍', text: 'Analyze something', prompt: 'Analyze the pros and cons of remote work' },
  { icon: '💻', text: 'Write code', prompt: 'Write a Python function that sorts a list of dictionaries by a key' },
]

function getStoredModel(): string {
  if (typeof window === 'undefined') return DEFAULT_MODEL
  return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt?: string
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface Props {
  conversationId: string | null
  onConversationCreated: (id: string) => void
  onRefreshConversations: () => void
  onToggleSidebar: () => void
  onNewChat: () => void
  sidebarOpen: boolean
}

async function decryptMessage(
  msg: { id: string; role: string; contentEnc: string; sealedKeyB64: string; createdAt?: string },
  privateKey: CryptoKey
): Promise<Message> {
  try {
    const aesKey = await decryptSealedAesKey(msg.sealedKeyB64, privateKey)
    const content = await decryptAesGcmWithRawKey(msg.contentEnc, aesKey)
    return { id: msg.id, role: msg.role as Message['role'], content, createdAt: msg.createdAt }
  } catch {
    return { id: msg.id, role: msg.role as Message['role'], content: '[decryption failed]', createdAt: msg.createdAt }
  }
}

export function ChatView({
  conversationId,
  onConversationCreated,
  onRefreshConversations,
  onToggleSidebar,
  onNewChat,
  sidebarOpen,
}: Props) {
  const { privateKey } = useVaultUnlock()
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)
  const [modelOpen, setModelOpen] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelectedModel(getStoredModel())
  }, [])

  useEffect(() => {
    if (!conversationId || !privateKey) {
      setMessages([])
      setLoadingMessages(false)
      return
    }
    let cancelled = false
    setLoadingMessages(true)

    async function load() {
      const res = await fetch(`/api/conversations/${conversationId}/messages`)
      if (!res.ok || cancelled) { setLoadingMessages(false); return }
      const data = await res.json()

      const decrypted = await Promise.all(
        data.messages.map((m: { id: string; role: string; contentEnc: string; sealedKeyB64: string }) =>
          decryptMessage(m, privateKey!)
        )
      )
      if (!cancelled) {
        setMessages(decrypted)
        setLoadingMessages(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [conversationId, privateKey])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, streamContent])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onScroll() {
      if (!el) return
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowScrollDown(distFromBottom > 200)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    function handleKeyboard(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && e.key === 'O') {
        e.preventDefault()
        onNewChat()
      }
      if (mod && e.shiftKey && e.key === 'S') {
        e.preventDefault()
        onToggleSidebar()
      }
      if (e.key === 'Escape' && streaming) {
        abortRef.current?.abort()
      }
    }
    document.addEventListener('keydown', handleKeyboard)
    return () => document.removeEventListener('keydown', handleKeyboard)
  }, [streaming, onNewChat, onToggleSidebar])

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId)
    setModelOpen(false)
    localStorage.setItem(MODEL_STORAGE_KEY, modelId)
  }, [])

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [])

  const doSend = useCallback(
    async (content: string, isRegenerate = false) => {
      if (streaming) return

      if (!isRegenerate) {
        const userMsg: Message = { id: `tmp-${Date.now()}`, role: 'user', content }
        setMessages((prev) => [...prev, userMsg])
        setLastUserMessage(content)
      }
      setStreaming(true)
      setStreamContent('')

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const currentMessages = isRegenerate
          ? messages.filter((_, i) => i < messages.length - 1)
          : messages
        const history = currentMessages.map((m) => ({ role: m.role, content: m.content }))

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            message: content,
            history,
            model: selectedModel,
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Request failed' }))
          setMessages((prev) => [
            ...prev,
            { id: `err-${Date.now()}`, role: 'assistant', content: `Error: ${err.error}` },
          ])
          setStreaming(false)
          return
        }

        const newConvId = res.headers.get('x-conversation-id')
        const isNew = res.headers.get('x-is-new') === '1'
        if (newConvId && isNew) {
          onConversationCreated(newConvId)
        }

        const reader = res.body?.getReader()
        if (!reader) return

        const decoder = new TextDecoder()
        let fullContent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })

          const lines = chunk.split('\n')
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6)
            if (payload === '[DONE]') continue
            try {
              const parsed = JSON.parse(payload)
              if (parsed.error) {
                fullContent += `\n\nError: ${parsed.error}`
                setStreamContent(fullContent)
                continue
              }
              const delta = parsed.choices?.[0]?.delta?.content
              if (delta) {
                fullContent += delta
                setStreamContent(fullContent)
              }
            } catch {
              // skip
            }
          }
        }

        if (fullContent) {
          if (isRegenerate) {
            setMessages((prev) => [
              ...prev.slice(0, -1),
              { id: `asst-${Date.now()}`, role: 'assistant', content: fullContent },
            ])
          } else {
            setMessages((prev) => [
              ...prev,
              { id: `asst-${Date.now()}`, role: 'assistant', content: fullContent },
            ])
          }
        }
        setStreamContent('')

        if (isNew) {
          setTimeout(() => onRefreshConversations(), 3000)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setMessages((prev) => [
            ...prev,
            { id: `err-${Date.now()}`, role: 'assistant', content: 'Connection error. Please try again.' },
          ])
        }
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [conversationId, streaming, onConversationCreated, onRefreshConversations, messages, selectedModel]
  )

  const handleSend = useCallback((content: string) => doSend(content, false), [doSend])

  const handleRegenerate = useCallback(() => {
    if (messages.length < 2) return
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    setMessages((prev) => prev.slice(0, -1))
    doSend(lastUser.content, true)
  }, [messages, doSend])

  const handleEditMessage = useCallback((messageIndex: number, newContent: string) => {
    setMessages((prev) => prev.slice(0, messageIndex))
    doSend(newContent, false)
  }, [doSend])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const currentModelLabel = AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.label ?? selectedModel
  const showRegenerate = !streaming && messages.length >= 2 && messages[messages.length - 1]?.role === 'assistant'

  return (
    <>
      <header
        className="flex items-center gap-3 px-4 h-12 shrink-0 border-b"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        {!sidebarOpen && (
          <div className="flex items-center gap-1">
            <button onClick={onToggleSidebar} className="vault-btn-ghost p-1.5" title="Open sidebar (Ctrl+Shift+S)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
            <button onClick={onNewChat} className="vault-btn-ghost p-1.5" title="New chat (Ctrl+Shift+O)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            VaultChat
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            encrypted
          </span>
        </div>

        <div className="ml-auto relative" ref={modelDropdownRef}>
          <button
            onClick={() => setModelOpen(!modelOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            {currentModelLabel}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {modelOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-44 rounded-lg shadow-lg border overflow-hidden z-50"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              {AVAILABLE_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleModelChange(m.id)}
                  className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between"
                  style={{
                    color: selectedModel === m.id ? 'var(--accent)' : 'var(--text-secondary)',
                    background: selectedModel === m.id ? 'var(--accent-subtle)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedModel !== m.id) e.currentTarget.style.background = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (selectedModel !== m.id) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {m.label}
                  {selectedModel === m.id && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        {loadingMessages && (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Decrypting messages...
            </div>
          </div>
        )}

        {!loadingMessages && messages.length === 0 && !streaming && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-lg px-6">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-subtle)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <h3 className="text-lg font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                How can I help?
              </h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                End-to-end encrypted. Only you can read your conversations.
              </p>

              <div className="grid grid-cols-2 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.prompt}
                    onClick={() => handleSend(s.prompt)}
                    className="text-left p-3 rounded-xl text-sm transition-colors"
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                  >
                    <span className="text-base mb-1 block">{s.icon}</span>
                    <span className="text-xs">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loadingMessages && (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((m, idx) => (
              <div key={m.id}>
                <ChatMessage
                  role={m.role}
                  content={m.content}
                  onEdit={m.role === 'user' && !streaming ? (newContent) => handleEditMessage(idx, newContent) : undefined}
                />
                {m.createdAt && (
                  <div className={`text-[10px] mt-1 ${m.role === 'user' ? 'text-right pr-10' : 'pl-10'}`} style={{ color: 'var(--text-muted)' }}>
                    {formatTime(m.createdAt)}
                  </div>
                )}
              </div>
            ))}

            {streaming && streamContent && (
              <ChatMessage role="assistant" content={streamContent} streaming />
            )}

            {streaming && !streamContent && (
              <div className="flex items-center gap-1.5 px-4 py-3">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--accent)', animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--accent)', animationDelay: '200ms' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--accent)', animationDelay: '400ms' }} />
              </div>
            )}

            {showRegenerate && (
              <div className="flex justify-center">
                <button
                  onClick={handleRegenerate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
                  </svg>
                  Regenerate
                </button>
              </div>
            )}
          </div>
        )}

        {showScrollDown && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all z-10"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
      </div>

      <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        disabled={false}
        streaming={streaming}
      />
    </>
  )
}
