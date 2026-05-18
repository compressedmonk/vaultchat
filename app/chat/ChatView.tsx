'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useVaultUnlock } from '@/app/components/security/VaultUnlockProvider'
import {
  decryptSealedAesKey,
  decryptAesGcmWithRawKey,
} from '@/lib/crypto/client-crypto'
import { ChatMessage, type MessageAttachmentMeta } from './ChatMessage'
import { ChatComposer, type SendPayload } from './ChatComposer'
import type { StealthConfig } from './page'
import { CHAT_MODELS, DEFAULT_MODEL, mapModel } from '@/lib/openai/models'
const MODEL_STORAGE_KEY = 'vaultchat_model'

const SUGGESTIONS = [
  { text: 'Explain a concept', prompt: 'Explain quantum computing in simple terms' },
  { text: 'Help me write', prompt: 'Help me write a professional email' },
  { text: 'Analyze something', prompt: 'Analyze the pros and cons of remote work' },
  { text: 'Write code', prompt: 'Write a Python function that sorts a list of dictionaries by a key' },
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
  attachments?: MessageAttachmentMeta[]
}

interface Props {
  conversationId: string | null
  onConversationCreated: (id: string) => void
  onRefreshConversations: () => void
  onToggleSidebar: () => void
  onNewChat: () => void
  sidebarOpen: boolean
  stealthUnlocked: boolean
  stealthConfig: StealthConfig | null
  onStealthUnlock: () => void
}

async function decryptMessage(
  msg: {
    id: string
    role: string
    contentEnc: string
    sealedKeyB64: string
    citationsEnc?: string | null
    citationsSealedKeyB64?: string | null
    createdAt?: string
    attachments?: MessageAttachmentMeta[]
  },
  privateKey: CryptoKey
): Promise<Message> {
  try {
    const aesKey = await decryptSealedAesKey(msg.sealedKeyB64, privateKey)
    let content = await decryptAesGcmWithRawKey(msg.contentEnc, aesKey)

    if (msg.citationsEnc && msg.citationsSealedKeyB64) {
      try {
        const citKey = await decryptSealedAesKey(msg.citationsSealedKeyB64, privateKey)
        const citJson = await decryptAesGcmWithRawKey(msg.citationsEnc, citKey)
        const citations = JSON.parse(citJson) as { url: string; title?: string }[]
        if (Array.isArray(citations) && citations.length > 0) {
          const links = citations
            .map((c) => `[${c.title || c.url}](${c.url})`)
            .join('\n')
          content = `${content}\n\n**Sources**\n${links}`
        }
      } catch {
        // ignore citation decrypt errors
      }
    }

    return {
      id: msg.id,
      role: msg.role as Message['role'],
      content,
      createdAt: msg.createdAt,
      attachments: msg.attachments,
    }
  } catch {
    return {
      id: msg.id,
      role: msg.role as Message['role'],
      content: '[decryption failed]',
      createdAt: msg.createdAt,
      attachments: msg.attachments,
    }
  }
}

export function ChatView({
  conversationId,
  onConversationCreated,
  onRefreshConversations,
  onToggleSidebar,
  onNewChat,
  sidebarOpen,
  stealthUnlocked,
  stealthConfig,
  onStealthUnlock,
}: Props) {
  const { privateKey } = useVaultUnlock()
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)
  const [modelOpen, setModelOpen] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const [temporaryChat, setTemporaryChat] = useState(false)
  const [toolStatus, setToolStatus] = useState<'searching' | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelectedModel(getStoredModel())
  }, [])

  useEffect(() => {
    setTemporaryChat(false)
  }, [conversationId])

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
        data.messages.map(
          (m: {
            id: string
            role: string
            contentEnc: string
            sealedKeyB64: string
            citationsEnc?: string | null
            citationsSealedKeyB64?: string | null
            createdAt?: string
            attachments?: MessageAttachmentMeta[]
          }) => decryptMessage(m, privateKey!)
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
    async (payload: SendPayload | string, isRegenerate = false) => {
      if (streaming) return

      const content = typeof payload === 'string' ? payload : payload.text
      const attachmentIds = typeof payload === 'string' ? [] : payload.attachmentIds
      const webSearch = typeof payload === 'string' ? false : payload.webSearch
      const attachmentMeta: MessageAttachmentMeta[] =
        typeof payload === 'string'
          ? []
          : payload.attachments.map((a) => ({
              fileId: a.fileId,
              filename: a.filename,
              mimeType: a.mimeType,
            }))

      if (!isRegenerate) {
        const userMsg: Message = {
          id: `tmp-${Date.now()}`,
          role: 'user',
          content,
          attachments: attachmentMeta.length > 0 ? attachmentMeta : undefined,
        }
        setMessages((prev) => [...prev, userMsg])
      }
      setStreaming(true)
      setStreamContent('')
      setToolStatus(null)

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
            conversationId: temporaryChat ? null : conversationId,
            message: content,
            history,
            model: selectedModel,
            isDecoy: stealthConfig?.enabled ? !stealthUnlocked : false,
            temporary: temporaryChat,
            webSearch,
            attachmentIds: isRegenerate ? [] : attachmentIds,
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

        if (!temporaryChat) {
          const newConvId = res.headers.get('x-conversation-id')
          const isNew = res.headers.get('x-is-new') === '1'
          if (newConvId && isNew) {
            onConversationCreated(newConvId)
          }
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
              if (parsed.toolStatus === 'searching') {
                setToolStatus('searching')
                continue
              }
              if (parsed.toolStatus === 'done') {
                setToolStatus(null)
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
        setToolStatus(null)

        if (!temporaryChat) {
          const isNew = res.headers.get('x-is-new') === '1'
          if (isNew) {
            setTimeout(() => onRefreshConversations(), 3000)
          }
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
        setToolStatus(null)
        abortRef.current = null
      }
    },
    [conversationId, streaming, onConversationCreated, onRefreshConversations, messages, selectedModel, stealthConfig, stealthUnlocked, temporaryChat]
  )

  const handleSend = useCallback((payload: SendPayload) => doSend(payload, false), [doSend])

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

  const currentModelLabel =
    CHAT_MODELS.find((m) => m.id === mapModel(selectedModel))?.label ?? selectedModel
  const showRegenerate = !streaming && messages.length >= 2 && messages[messages.length - 1]?.role === 'assistant'

  return (
    <>
      <header className="flex items-center gap-3 px-4 h-12 shrink-0" style={{ background: 'transparent' }}>
        {!sidebarOpen && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={onToggleSidebar}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              title="Open sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
            <button
              onClick={onNewChat}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              title="New chat"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>
        )}

        <div className="relative" ref={modelDropdownRef}>
          <button
            onClick={() => setModelOpen(!modelOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            {currentModelLabel}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {modelOpen && (
            <div
              className="absolute left-0 top-full mt-1 w-48 rounded-xl shadow-xl overflow-hidden z-50 py-1"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}
            >
              {CHAT_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleModelChange(m.id)}
                  className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2"
                  style={{
                    color: mapModel(selectedModel) === m.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    background: mapModel(selectedModel) === m.id ? 'var(--accent-subtle)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (mapModel(selectedModel) !== m.id) e.currentTarget.style.background = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (mapModel(selectedModel) !== m.id) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span className="flex items-center gap-2">
                    {m.label}
                    {m.supportsWebSearch && (
                      <span className="text-[10px] opacity-60" title="Web search supported">🌐</span>
                    )}
                  </span>
                  {mapModel(selectedModel) === m.id && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {!conversationId && (
            <button
              onClick={() => setTemporaryChat((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
              style={{
                background: temporaryChat ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
                color: temporaryChat ? '#eab308' : 'var(--text-muted)',
                border: temporaryChat ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!temporaryChat) {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!temporaryChat) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }
              }}
              title={temporaryChat ? 'Temporary chat is ON — messages won\'t be saved' : 'Enable temporary chat'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                {temporaryChat && <line x1="9" y1="8" x2="15" y2="14" />}
                {temporaryChat && <line x1="15" y1="8" x2="9" y2="14" />}
              </svg>
              {temporaryChat && 'Temporary'}
            </button>
          )}
          {temporaryChat && conversationId === null && (
            <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#eab308' }}>
              Not saved
            </span>
          )}
          {!temporaryChat && (
            <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-0.5 -mt-px">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              Encrypted
            </span>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        {loadingMessages && (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Decrypting messages...
            </div>
          </div>
        )}

        {!loadingMessages && messages.length === 0 && !streaming && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-2xl px-6">
              <h2 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                What can I help with?
              </h2>
              {temporaryChat && (
                <p className="text-xs mb-6" style={{ color: '#eab308' }}>
                  Temporary chat — this conversation won&apos;t be saved
                </p>
              )}
              {!temporaryChat && <div className="mb-8" />}

              <div className="grid grid-cols-2 gap-2.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.prompt}
                    onClick={() =>
                      handleSend({ text: s.prompt, attachmentIds: [], attachments: [], webSearch: false })
                    }
                    className="text-left px-4 py-3 rounded-xl text-sm transition-colors"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-light)',
                      color: 'var(--text-secondary)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-tertiary)'
                      e.currentTarget.style.color = 'var(--text-primary)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }}
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loadingMessages && (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((m, idx) => (
              <div key={m.id} className="group">
                <ChatMessage
                  role={m.role}
                  content={m.content}
                  attachments={m.attachments}
                  onEdit={m.role === 'user' && !streaming ? (newContent) => handleEditMessage(idx, newContent) : undefined}
                />
              </div>
            ))}

            {streaming && toolStatus === 'searching' && (
              <div
                className="flex items-center gap-2 text-sm py-2 px-1"
                style={{ color: 'var(--text-muted)' }}
              >
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Searching the web…
              </div>
            )}

            {streaming && streamContent && (
              <ChatMessage role="assistant" content={streamContent} streaming />
            )}

            {streaming && !streamContent && (
              <div className="flex items-center gap-1.5 py-3">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--text-muted)', animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--text-muted)', animationDelay: '200ms' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--text-muted)', animationDelay: '400ms' }} />
              </div>
            )}

            {showRegenerate && (
              <div className="flex justify-center">
                <button
                  onClick={handleRegenerate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border-light)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
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
              background: 'var(--message-surface)',
              color: 'var(--text-secondary)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
      </div>

      <ChatComposer
        onSend={handleSend}
        onStop={handleStop}
        disabled={false}
        streaming={streaming}
        selectedModel={selectedModel}
        stealthConfig={stealthConfig}
        onStealthUnlock={onStealthUnlock}
      />
    </>
  )
}
