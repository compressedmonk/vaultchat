'use client'

import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'

interface Props {
  role: 'user' | 'assistant' | 'system'
  content: string
  streaming?: boolean
}

export function ChatMessage({ role, content, streaming }: Props) {
  const [copied, setCopied] = useState(false)
  const isUser = role === 'user'

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

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

      <div className={`relative max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm ${
            isUser
              ? 'rounded-br-md'
              : 'rounded-bl-md'
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

        {!isUser && !streaming && (
          <button
            onClick={handleCopy}
            className="absolute -bottom-6 left-0 opacity-0 group-hover:opacity-100 transition-opacity text-xs flex items-center gap-1 px-2 py-1 rounded"
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
    </div>
  )
}
