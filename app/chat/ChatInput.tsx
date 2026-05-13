'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { StealthConfig } from './page'

interface Props {
  onSend: (message: string) => void
  onStop: () => void
  disabled: boolean
  streaming: boolean
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

export function ChatInput({ onSend, onStop, disabled, streaming, stealthConfig, onStealthUnlock }: Props) {
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

  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">
        <div
          className="flex items-end gap-2 rounded-[28px] px-4 py-3 shadow-lg"
          style={{ background: 'var(--composer-surface)' }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything"
            rows={1}
            className="flex-1 resize-none bg-transparent text-[15px] outline-none leading-relaxed"
            style={{
              color: 'var(--text-primary)',
              maxHeight: '200px',
            }}
            disabled={disabled}
          />

          {streaming ? (
            <button
              onClick={onStop}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all"
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
              disabled={!input.trim() || disabled}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-20"
              style={{ background: input.trim() ? '#ffffff' : '#676767' }}
              title="Send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? '#000000' : '#212121'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
          Messages are encrypted before storage. AI processes prompts during inference.
        </p>
      </div>
    </div>
  )
}
