'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { StealthConfig } from './page'
import { getModel } from '@/lib/openai/models'
import { validateUploadFile } from '@/lib/files'

const WEB_SEARCH_STORAGE_KEY = 'vaultchat_web_search'

export interface PendingAttachment {
  fileId: string
  filename: string
  mimeType: string
}

export interface SendPayload {
  text: string
  attachmentIds: string[]
  attachments: PendingAttachment[]
  webSearch: boolean
}

interface Props {
  onSend: (payload: SendPayload) => void
  onStop: () => void
  disabled: boolean
  streaming: boolean
  selectedModel: string
  stealthConfig?: StealthConfig | null
  onStealthUnlock?: () => void
}

async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text)
  const buf = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function getStoredWebSearch(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(WEB_SEARCH_STORAGE_KEY) === '1'
}

export function ChatComposer({
  onSend,
  onStop,
  disabled,
  streaming,
  selectedModel,
  stealthConfig,
  onStealthUnlock,
}: Props) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [webSearch, setWebSearch] = useState(false)
  const [uploading, setUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const modelInfo = getModel(selectedModel)
  const searchSupported = modelInfo.supportsWebSearch

  useEffect(() => {
    setWebSearch(getStoredWebSearch())
  }, [])

  useEffect(() => {
    if (!streaming) {
      textareaRef.current?.focus()
    }
  }, [streaming])

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
    }
  }, [])

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if ((!trimmed && attachments.length === 0) || disabled || streaming || uploading) return
    onSend({
      text: trimmed,
      attachmentIds: attachments.map((a) => a.fileId),
      attachments: [...attachments],
      webSearch: webSearch && searchSupported,
    })
    setInput('')
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [
    input,
    attachments,
    disabled,
    streaming,
    uploading,
    onSend,
    webSearch,
    searchSupported,
  ])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value
      setInput(val)
      adjustHeight()

      if (stealthConfig?.enabled && onStealthUnlock && val.length === stealthConfig.codeLength) {
        sha256Hex(val).then((hash) => {
          if (hash === stealthConfig.codeHash) {
            setInput('')
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto'
            }
            onStealthUnlock()
          }
        })
      }
    },
    [adjustHeight, stealthConfig, onStealthUnlock]
  )

  const toggleWebSearch = useCallback(() => {
    if (!searchSupported) return
    setWebSearch((v) => {
      const next = !v
      localStorage.setItem(WEB_SEARCH_STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }, [searchSupported])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    e.target.value = ''

    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const err = validateUploadFile(file)
        if (err) {
          alert(err)
          continue
        }

        const form = new FormData()
        form.append('file', file)

        const res = await fetch('/api/files', { method: 'POST', body: form })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          alert(data.error ?? 'Upload failed')
          continue
        }

        const data = await res.json()
        setAttachments((prev) => [
          ...prev,
          {
            fileId: data.fileId,
            filename: data.filename,
            mimeType: data.mimeType,
          },
        ])
      }
    } finally {
      setUploading(false)
    }
  }, [])

  const removeAttachment = useCallback((fileId: string) => {
    setAttachments((prev) => prev.filter((a) => a.fileId !== fileId))
    fetch(`/api/files/${fileId}`, { method: 'DELETE' }).catch(() => {})
  }, [])

  const canSend =
    (input.trim().length > 0 || attachments.length > 0) && !disabled && !uploading

  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((a) => (
              <span
                key={a.fileId}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text-secondary)',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="max-w-[140px] truncate">{a.filename}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.fileId)}
                  className="p-0.5 rounded hover:opacity-80"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Remove attachment"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        <div
          className="rounded-[28px] px-3 py-2 shadow-lg"
          style={{ background: 'var(--composer-surface)' }}
        >
          <div className="flex items-end gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.txt,.md,.csv,.json,image/png,image/jpeg,image/webp,image/gif"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || streaming || uploading}
              className="shrink-0 p-2 rounded-lg transition-colors disabled:opacity-30"
              style={{ color: 'var(--text-secondary)' }}
              title="Attach files"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything"
              rows={1}
              className="flex-1 resize-none bg-transparent text-[15px] outline-none leading-relaxed py-2"
              style={{
                color: 'var(--text-primary)',
                maxHeight: '200px',
              }}
              disabled={disabled}
            />

            {streaming ? (
              <button
                onClick={onStop}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all mb-0.5"
                style={{ background: 'var(--text-primary)' }}
                title="Stop generating"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#212121">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSend || streaming}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-20 mb-0.5"
                style={{ background: canSend ? '#ffffff' : '#676767' }}
                title="Send"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={canSend ? '#000000' : '#212121'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 px-1 pt-1 pb-0.5">
            <button
              type="button"
              onClick={toggleWebSearch}
              disabled={!searchSupported}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all disabled:opacity-40"
              style={{
                background: webSearch && searchSupported ? 'var(--accent-subtle)' : 'transparent',
                color: webSearch && searchSupported ? 'var(--accent)' : 'var(--text-muted)',
                border:
                  webSearch && searchSupported
                    ? '1px solid rgba(16, 163, 127, 0.35)'
                    : '1px solid transparent',
              }}
              title={
                searchSupported
                  ? webSearch
                    ? 'Web search on'
                    : 'Search the web'
                  : 'Web search not available for this model'
              }
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
              </svg>
              Search
            </button>
            {uploading && (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Uploading…
              </span>
            )}
          </div>
        </div>

        <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
          Messages are encrypted before storage. Files and prompts are sent to OpenAI during inference.
        </p>
      </div>
    </div>
  )
}
