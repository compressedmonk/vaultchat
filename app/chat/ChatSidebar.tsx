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
  stealthUnlocked: boolean
  onStealthHide: () => void
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
  stealthUnlocked,
  onStealthHide,
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
      const sealedKeyB64 = btoa(String.fromCharCode(...Array.from(new Uint8Array(sealedKey))))

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
      const titleEnc = btoa(String.fromCharCode(...Array.from(out)))

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
          z-40 flex flex-col h-full w-[260px] shrink-0
          transition-transform duration-200
        `}
        style={{ background: 'var(--bg-secondary)' }}
      >
        <div className="p-2 flex items-center gap-2">
          <button
            onClick={onToggle}
            className="p-2 rounded-lg transition-colors hidden md:flex items-center justify-center"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            title="Close sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
          <div className="flex-1" />
          <button
            onClick={onNewChat}
            className="p-2 rounded-lg transition-colors flex items-center justify-center"
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

        {stealthUnlocked && (
          <div className="px-2 pb-1">
            <button
              onClick={onStealthHide}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: '#dc2626', color: '#ffffff' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#b91c1c' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#dc2626' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              HIDE
            </button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-1.5 py-1">
          {conversations.length === 0 && (
            <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
              No conversations yet
            </p>
          )}
          {groups.map((group) => (
            <div key={group.label} className="mb-1">
              <div
                className="px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                {group.label}
              </div>
              {group.items.map((c) => (
                <div
                  key={c.id}
                  className="group flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer text-[13px] transition-colors relative"
                  style={{
                    background: activeId === c.id ? 'var(--bg-primary)' : 'transparent',
                    color: 'var(--text-primary)',
                  }}
                  onClick={() => onSelect(c.id)}
                  onMouseEnter={(e) => {
                    if (activeId !== c.id) e.currentTarget.style.background = 'var(--bg-primary)'
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
                      className="flex-1 bg-transparent outline-none text-[13px] px-0 py-0"
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
                    <div className="flex items-center gap-0.5 shrink-0">
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
                      className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all shrink-0"
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

        <div className="p-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
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
