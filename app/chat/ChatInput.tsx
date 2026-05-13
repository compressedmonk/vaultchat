'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface Props {
  onSend: (message: string) => void
  onStop: () => void
  disabled: boolean
  streaming: boolean
}

export function ChatInput({ onSend, onStop, disabled, streaming }: Props) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    if (!trimmed || disabled || streaming) return
    onSend(trimmed)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, disabled, streaming, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div
      className="shrink-0 border-t px-4 py-3"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
    >
      <div className="max-w-3xl mx-auto">
        <div
          className="flex items-end gap-2 rounded-xl px-4 py-3"
          style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              adjustHeight()
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message VaultChat..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none"
            style={{
              color: 'var(--text-primary)',
              maxHeight: '200px',
            }}
            disabled={disabled}
          />

          {streaming ? (
            <button
              onClick={onStop}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: 'var(--danger)' }}
              title="Stop generating"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || disabled}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: input.trim() ? 'var(--accent)' : 'var(--bg-hover)' }}
              title="Send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
          Messages are encrypted before storage. OpenAI processes prompts during inference.
        </p>
      </div>
    </div>
  )
}
