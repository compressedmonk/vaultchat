'use client'

import { useEffect, useState } from 'react'
import { useVaultUnlock } from '@/app/components/security/VaultUnlockProvider'
import { decryptSealedAesKey, decryptAesGcmWithRawKey } from '@/lib/crypto/client-crypto'
import type { ConversationStub } from './page'

interface Props {
  conversations: ConversationStub[]
  activeId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  onDelete: (id: string) => void
  open: boolean
  onToggle: () => void
}

function DecryptedTitle({ conv }: { conv: ConversationStub }) {
  const { privateKey } = useVaultUnlock()
  const [title, setTitle] = useState<string | null>(null)

  useEffect(() => {
    if (!privateKey || !conv.titleEnc || !conv.sealedKeyB64) {
      setTitle(null)
      return
    }
    let cancelled = false
    decryptSealedAesKey(conv.sealedKeyB64, privateKey)
      .then((aesKey) => decryptAesGcmWithRawKey(conv.titleEnc!, aesKey))
      .then((t) => { if (!cancelled) setTitle(t) })
      .catch(() => { if (!cancelled) setTitle('Conversation') })
    return () => { cancelled = true }
  }, [privateKey, conv.titleEnc, conv.sealedKeyB64])

  if (!conv.titleEnc) return <>New conversation</>
  return <>{title ?? '...'}</>
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  open,
  onToggle,
}: Props) {
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        className={`
          ${open ? 'translate-x-0' : '-translate-x-full'}
          fixed md:relative md:translate-x-0
          z-40 flex flex-col h-full w-64 shrink-0
          transition-transform duration-200
          border-r
        `}
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onNewChat}
            className="vault-btn-primary w-full flex items-center justify-center gap-2 text-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New chat
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 && (
            <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
              No conversations yet
            </p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`
                group flex items-center gap-2 px-3 py-2.5 mx-1.5 rounded-lg cursor-pointer text-sm
                transition-colors
              `}
              style={{
                background: activeId === c.id ? 'var(--bg-active)' : 'transparent',
                color: activeId === c.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
              onClick={() => onSelect(c.id)}
              onMouseEnter={(e) => {
                if (activeId !== c.id) e.currentTarget.style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                if (activeId !== c.id) e.currentTarget.style.background = 'transparent'
              }}
            >
              <span className="truncate flex-1">
                <DecryptedTitle conv={c} />
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(c.id)
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity"
                style={{ color: 'var(--text-muted)' }}
                title="Delete"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={handleLogout}
            className="vault-btn-ghost w-full flex items-center gap-2 text-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
