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

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface Props {
  conversationId: string | null
  onConversationCreated: (id: string) => void
  onRefreshConversations: () => void
  onToggleSidebar: () => void
  sidebarOpen: boolean
}

async function decryptMessage(
  msg: { id: string; role: string; contentEnc: string; sealedKeyB64: string },
  privateKey: CryptoKey
): Promise<Message> {
  try {
    const aesKey = await decryptSealedAesKey(msg.sealedKeyB64, privateKey)
    const content = await decryptAesGcmWithRawKey(msg.contentEnc, aesKey)
    return { id: msg.id, role: msg.role as Message['role'], content }
  } catch {
    return { id: msg.id, role: msg.role as Message['role'], content: '[decryption failed]' }
  }
}

export function ChatView({
  conversationId,
  onConversationCreated,
  onRefreshConversations,
  onToggleSidebar,
  sidebarOpen,
}: Props) {
  const { privateKey } = useVaultUnlock()
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)
  const [modelOpen, setModelOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!conversationId || !privateKey) {
      setMessages([])
      return
    }
    let cancelled = false

    async function load() {
      const res = await fetch(`/api/conversations/${conversationId}/messages`)
      if (!res.ok || cancelled) return
      const data = await res.json()

      const decrypted = await Promise.all(
        data.messages.map((m: { id: string; role: string; contentEnc: string; sealedKeyB64: string }) =>
          decryptMessage(m, privateKey!)
        )
      )
      if (!cancelled) setMessages(decrypted)
    }

    load()
    return () => { cancelled = true }
  }, [conversationId, privateKey])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streamContent])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSend = useCallback(
    async (content: string) => {
      if (streaming) return

      const userMsg: Message = { id: `tmp-${Date.now()}`, role: 'user', content }
      setMessages((prev) => [...prev, userMsg])
      setStreaming(true)
      setStreamContent('')

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }))

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
          setMessages((prev) => [
            ...prev,
            { id: `asst-${Date.now()}`, role: 'assistant', content: fullContent },
          ])
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

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const currentModelLabel = AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.label ?? selectedModel

  return (
    <>
      <header
        className="flex items-center gap-3 px-4 h-12 shrink-0 border-b"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        {!sidebarOpen && (
          <button onClick={onToggleSidebar} className="vault-btn-ghost p-1.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
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
                  onClick={() => { setSelectedModel(m.id); setModelOpen(false) }}
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 && !streaming && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md px-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-subtle)' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                  <path d="M12 2a10 10 0 0110 10 10 10 0 01-10 10A10 10 0 012 12 10 10 0 0112 2z" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              </div>
              <h3 className="text-lg font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                How can I help?
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Your conversations are end-to-end encrypted. Only you can read them.
              </p>
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {messages.map((m) => (
            <ChatMessage key={m.id} role={m.role} content={m.content} />
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
        </div>
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
