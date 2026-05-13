'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'

interface Props {
  role: 'user' | 'assistant' | 'system'
  content: string
  streaming?: boolean
  onEdit?: (newContent: string) => void
}

export function ChatMessage({ role, content, streaming, onEdit }: Props) {
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

  return (
    <div className={`group flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div
          className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-semibold mt-0.5"
          style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
        >
          AI
        </div>
      )}

      <div className={`relative max-w-[85%]`}>
        {editing ? (
          <div className="rounded-2xl rounded-br-md overflow-hidden" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--accent)' }}>
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
                className="text-xs px-2 py-1 rounded"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                className="text-xs px-3 py-1 rounded"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Save & Send
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm ${
              isUser ? 'rounded-br-md' : 'rounded-bl-md'
            }`}
            style={{
              background: isUser ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: isUser ? '#fff' : 'var(--text-primary)',
            }}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{content}</p>
            ) : (
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
                  <span className="inline-block w-1.5 h-4 ml-0.5 animate-pulse" style={{ background: 'var(--accent)' }} />
                )}
              </div>
            )}
          </div>
        )}

        {!editing && !streaming && (
          <div className="absolute -bottom-6 left-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
            {isUser && onEdit && (
              <button
                onClick={() => { setEditValue(content); setEditing(true) }}
                className="text-xs flex items-center gap-1 px-2 py-1 rounded"
                style={{ color: 'var(--text-muted)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit
              </button>
            )}
            {!isUser && (
              <button
                onClick={handleCopy}
                className="text-xs flex items-center gap-1 px-2 py-1 rounded"
                style={{ color: 'var(--text-muted)' }}
              >
                {copied ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                    Copy
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {isUser && !editing && (
        <div
          className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-semibold mt-0.5"
          style={{ background: 'var(--bg-active)', color: 'var(--text-secondary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
      )}
    </div>
  )
}
