'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useVaultUnlock } from '@/app/components/security/VaultUnlockProvider'
import { decryptSealedAesKey, decryptAesGcmWithRawKey } from '@/lib/crypto/client-crypto'
import type { ConversationStub } from './page'

interface Props {
  conversations: ConversationStub[]
  activeId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  onDelete: (id: string) => void
  onRefreshConversations: () => void
  open: boolean
  onToggle: () => void
}

function DecryptedTitle({ conv, onDecrypted }: { conv: ConversationStub; onDecrypted?: (title: string) => void }) {
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
      .then((t) => {
        if (!cancelled) {
          setTitle(t)
          onDecrypted?.(t)
        }
      })
      .catch(() => { if (!cancelled) setTitle('Conversation') })
    return () => { cancelled = true }
  }, [privateKey, conv.titleEnc, conv.sealedKeyB64, onDecrypted])

  if (!conv.titleEnc) return <>New conversation</>
  return <>{title ?? '...'}</>
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  const monthAgo = new Date(today.getTime() - 30 * 86400000)

  if (date >= today) return 'Today'
  if (date >= yesterday) return 'Yesterday'
  if (date >= weekAgo) return 'Previous 7 days'
  if (date >= monthAgo) return 'Previous 30 days'
  return 'Older'
}

function groupConversations(conversations: ConversationStub[]) {
  const groups: { label: string; items: ConversationStub[] }[] = []
  const map = new Map<string, ConversationStub[]>()
  const order: string[] = []

  for (const c of conversations) {
    const label = getDateGroup(c.updatedAt)
    if (!map.has(label)) {
      map.set(label, [])
      order.push(label)
    }
    map.get(label)!.push(c)
  }

  for (const label of order) {
    groups.push({ label, items: map.get(label)! })
  }

  return groups
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  onRefreshConversations,
  open,
  onToggle,
}: Props) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const groups = useMemo(() => groupConversations(conversations), [conversations])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setDeleteConfirmId(id)
  }

  const handleDeleteConfirm = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setDeleteConfirmId(null)
    onDelete(id)
  }

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteConfirmId(null)
  }

  const handleRenameStart = (conv: ConversationStub, currentTitle: string) => {
    setRenamingId(conv.id)
    setRenameValue(currentTitle)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const handleRenameSave = async () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null)
      return
    }
    try {
      const titleText = renameValue.trim()
      const aesKeyRaw = crypto.getRandomValues(new Uint8Array(32))

      const meRes = await fetch('/api/me')
      const meData = await meRes.json()
      const pubKeyB64 = meData.user?.publicKeySpkiB64 as string | undefined

      if (!pubKeyB64) {
        setRenamingId(null)
        return
      }

      const pubKeyDer = Uint8Array.from(atob(pubKeyB64), c => c.charCodeAt(0))
      const pubKey = await crypto.subtle.importKey('spki', pubKeyDer, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
      const sealedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, aesKeyRaw)
      const sealedKeyB64 = btoa(String.fromCharCode(...new Uint8Array(sealedKey)))

      const iv = crypto.getRandomValues(new Uint8Array(12))
      const importedKey = await crypto.subtle.importKey('raw', aesKeyRaw, 'AES-GCM', false, ['encrypt'])
      const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, importedKey, new TextEncoder().encode(titleText))
      const encU = new Uint8Array(enc)
      const tag = encU.subarray(encU.length - 16)
      const cipherOnly = encU.subarray(0, encU.length - 16)
      const out = new Uint8Array(12 + 16 + cipherOnly.length)
      out.set(iv)
      out.set(tag, 12)
      out.set(cipherOnly, 28)
      const titleEnc = btoa(String.fromCharCode(...out))

      await fetch(`/api/conversations/${renamingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleEnc, sealedKeyB64 }),
      })
      onRefreshConversations()
    } catch (e) {
      console.error('Rename failed:', e)
    }
    setRenamingId(null)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSave()
    if (e.key === 'Escape') setRenamingId(null)
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
        <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onNewChat}
            className="vault-btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New chat
          </button>
          <button
            onClick={onToggle}
            className="vault-btn-ghost p-2 shrink-0 hidden md:flex items-center justify-center"
            title="Close sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-1">
          {conversations.length === 0 && (
            <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
              No conversations yet
            </p>
          )}
          {groups.map((group) => (
            <div key={group.label}>
              <div
                className="px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                {group.label}
              </div>
              {group.items.map((c) => (
                <div
                  key={c.id}
                  className="group flex items-center gap-2 px-3 py-2 mx-1.5 rounded-lg cursor-pointer text-sm transition-colors"
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
                  {renamingId === c.id ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={handleRenameKeyDown}
                      onBlur={handleRenameSave}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-transparent outline-none text-sm px-0 py-0"
                      style={{ color: 'var(--text-primary)' }}
                    />
                  ) : (
                    <span
                      className="truncate flex-1"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        const titleEl = e.currentTarget.textContent
                        handleRenameStart(c, titleEl || 'New conversation')
                      }}
                    >
                      <DecryptedTitle conv={c} />
                    </span>
                  )}

                  {deleteConfirmId === c.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => handleDeleteConfirm(e, c.id)}
                        className="p-1 rounded transition-colors"
                        style={{ color: 'var(--danger)' }}
                        title="Confirm delete"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                      <button
                        onClick={handleDeleteCancel}
                        className="p-1 rounded transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        title="Cancel"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => handleDeleteClick(e, c.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                      title="Delete"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
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
