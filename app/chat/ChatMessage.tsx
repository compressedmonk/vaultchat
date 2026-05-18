'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'

export interface MessageAttachmentMeta {
  fileId: string
  filename: string
  mimeType?: string | null
}

interface Props {
  role: 'user' | 'assistant' | 'system'
  content: string
  streaming?: boolean
  attachments?: MessageAttachmentMeta[]
  onEdit?: (newContent: string) => void
}

export function ChatMessage({ role, content, streaming, attachments, onEdit }: Props) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(content)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const isUser = role === 'user'

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus()
      editRef.current.style.height = 'auto'
      editRef.current.style.height = `${editRef.current.scrollHeight}px`
    }
  }, [editing])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  const handleEditSave = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== content && onEdit) {
      onEdit(trimmed)
    }
    setEditing(false)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEditSave()
    }
    if (e.key === 'Escape') {
      setEditValue(content)
      setEditing(false)
    }
  }

  if (isUser) {
    return (
      <div className="flex justify-end gap-2.5">
        <div className="relative max-w-[70%]">
          {editing ? (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--message-surface)', border: '1px solid var(--accent)' }}>
              <textarea
                ref={editRef}
                value={editValue}
                onChange={(e) => {
                  setEditValue(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = `${e.target.scrollHeight}px`
                }}
                onKeyDown={handleEditKeyDown}
                className="w-full bg-transparent text-sm px-4 py-2.5 outline-none resize-none"
                style={{ color: 'var(--text-primary)', minWidth: '200px' }}
              />
              <div className="flex justify-end gap-2 px-3 pb-2">
                <button
                  onClick={() => { setEditValue(content); setEditing(false) }}
                  className="text-xs px-2.5 py-1 rounded-lg"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  className="text-xs px-3 py-1 rounded-lg font-medium"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                className="rounded-3xl px-4 py-2.5 text-[15px]"
                style={{ background: 'var(--message-surface)', color: 'var(--text-primary)' }}
              >
                {attachments && attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {attachments.map((a) => (
                      <span
                        key={a.fileId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]"
                        style={{
                          background: 'var(--bg-hover)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        {a.filename}
                      </span>
                    ))}
                  </div>
                )}
                {content && content !== '(attachment)' && (
                  <p className="whitespace-pre-wrap">{content}</p>
                )}
              </div>
              {onEdit && (
                <div className="flex justify-end mt-1 opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditValue(content); setEditing(true) }}
                    className="p-1 rounded-md transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    title="Edit message"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="group">
      <div className="max-w-none">
        <div className="prose-chat">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '')
                const codeStr = String(children).replace(/\n$/, '')
                if (match) {
                  return <CodeBlock language={match[1]} code={codeStr} />
                }
                return <code className={className} {...props}>{children}</code>
              },
              pre({ children }) {
                return <>{children}</>
              },
            }}
          >
            {content}
          </ReactMarkdown>
          {streaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm" style={{ background: 'var(--accent)' }} />
          )}
        </div>

        {!streaming && (
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title={copied ? 'Copied!' : 'Copy'}
            >
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
