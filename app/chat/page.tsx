'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChatSidebar } from './ChatSidebar'
import { ChatView } from './ChatView'
import { VaultGate } from './VaultGate'

export interface ConversationStub {
  id: string
  titleEnc: string | null
  sealedKeyB64: string
  model: string
  updatedAt: string
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationStub[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/conversations')
    if (res.ok) {
      const data = await res.json()
      setConversations(data.conversations ?? [])
    }
  }, [])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

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

  return (
    <VaultGate>
      <div className="flex h-screen" style={{ background: 'var(--bg-primary)' }}>
        <ChatSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onNewChat={handleNewChat}
          onDelete={handleDeleteConversation}
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="flex-1 flex flex-col min-w-0">
          <ChatView
            conversationId={activeId}
            onConversationCreated={handleConversationCreated}
            onRefreshConversations={loadConversations}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            sidebarOpen={sidebarOpen}
          />
        </main>
      </div>
    </VaultGate>
  )
}
