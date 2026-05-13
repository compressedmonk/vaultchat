'use client'

import { useState, useCallback } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface Props {
  language: string
  code: string
}

export function CodeBlock({ language, code }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div className="relative my-3 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div
        className="flex items-center justify-between px-3 py-1.5 text-xs"
        style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}
      >
        <span>{language}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 hover:text-white transition-colors">
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
              Copied
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
              Copy
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          background: '#0d0d0d',
          fontSize: '0.8125rem',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
