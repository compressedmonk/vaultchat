'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { ChatSidebar } from './ChatSidebar'
import { ChatView } from './ChatView'
import { VaultGate } from './VaultGate'

export interface ConversationStub {
  id: string
  titleEnc: string | null
  sealedKeyB64: string
  model: string
  isDecoy: boolean
  updatedAt: string
}

export interface StealthConfig {
  enabled: boolean
  codeHash: string
  codeLength: number
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationStub[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [stealthUnlocked, setStealthUnlocked] = useState(false)
  const [stealthConfig, setStealthConfig] = useState<StealthConfig | null>(null)

  useEffect(() => {
    fetch('/api/stealth/config')
      .then((r) => r.json())
      .then((d) => {
        if (d.enabled) {
          setStealthConfig({ enabled: true, codeHash: d.codeHash, codeLength: d.codeLength })
        }
      })
      .catch(() => {})
  }, [])

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/conversations')
    if (res.ok) {
      const data = await res.json()
      setConversations(data.conversations ?? [])
    }
  }, [])

  const seedAttempted = useRef(false)

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!stealthConfig?.enabled || seedAttempted.current) return
    if (conversations.some((c) => c.isDecoy)) {
      seedAttempted.current = true
      return
    }
    seedAttempted.current = true
    fetch('/api/stealth/seed', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (d.count > 0) loadConversations()
      })
      .catch(() => {})
  }, [stealthConfig, conversations, loadConversations])

  const handleNewChat = useCallback(async () => {
    setActiveId(null)
  }, [])

  const handleConversationCreated = useCallback(
    (id: string) => {
      setActiveId(id)
      loadConversations()
    },
    [loadConversations]
  )

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (activeId === id) setActiveId(null)
      loadConversations()
    },
    [activeId, loadConversations]
  )

  const handleStealthUnlock = useCallback(() => {
    setStealthUnlocked(true)
  }, [])

  const handleStealthHide = useCallback(() => {
    setStealthUnlocked(false)
    const activeConv = conversations.find((c) => c.id === activeId)
    if (activeConv && !activeConv.isDecoy) {
      setActiveId(null)
    }
  }, [conversations, activeId])

  const visibleConversations = stealthConfig?.enabled
    ? stealthUnlocked
      ? conversations
      : conversations.filter((c) => c.isDecoy)
    : conversations

  return (
    <VaultGate>
      <div className="flex h-screen" style={{ background: 'var(--bg-primary)' }}>
        <ChatSidebar
          conversations={visibleConversations}
          activeId={activeId}
          onSelect={setActiveId}
          onNewChat={handleNewChat}
          onDelete={handleDeleteConversation}
          onRefreshConversations={loadConversations}
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          stealthUnlocked={stealthUnlocked}
          onStealthHide={handleStealthHide}
        />

        <main className="flex-1 flex flex-col min-w-0">
          <ChatView
            conversationId={activeId}
            onConversationCreated={handleConversationCreated}
            onRefreshConversations={loadConversations}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            onNewChat={handleNewChat}
            sidebarOpen={sidebarOpen}
            stealthUnlocked={stealthUnlocked}
            stealthConfig={stealthConfig}
            onStealthUnlock={handleStealthUnlock}
          />
        </main>
      </div>
    </VaultGate>
  )
}
