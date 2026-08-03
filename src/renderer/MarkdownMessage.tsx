import { useEffect, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'
import { codeToHtml } from 'shiki'

const highlighted = new Map<string, string>()

function languageName(className?: string): string {
  const match = /language-([\w+-]+)/.exec(className ?? '')
  return match?.[1] ?? 'text'
}

function CodeBlock({ className, children }: { className?: string; children?: unknown }) {
  const code = String(children ?? '').replace(/\n$/, '')
  const language = languageName(className)
  const cacheKey = `${language}:${code}`
  const [html, setHtml] = useState(() => highlighted.get(cacheKey) ?? '')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    const cached = highlighted.get(cacheKey)
    if (cached) {
      setHtml(cached)
      return () => { active = false }
    }
    void codeToHtml(code, { lang: language, theme: 'github-light' })
      .catch(() => codeToHtml(code, { lang: 'text', theme: 'github-light' }))
      .then((value) => {
        if (!active) return
        highlighted.set(cacheKey, value)
        setHtml(value)
      })
    return () => { active = false }
  }, [cacheKey, code, language])

  async function copyCode() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="code-block">
      <div className="code-header">
        <span>{language}</span>
        <button type="button" className="code-copy" onClick={() => void copyCode()} aria-label="复制代码">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      {html ? <div className="code-html" dangerouslySetInnerHTML={{ __html: html }} /> : <pre><code>{code}</code></pre>}
    </div>
  )
}

const components: Components = {
  code({ className, children }) {
    const code = String(children ?? '')
    const block = Boolean(className) || code.includes('\n')
    if (!block) return <code className="inline-code">{children}</code>
    return <CodeBlock className={className} children={children} />
  },
  pre({ children }) {
    return <>{children}</>
  },
  a({ href, children }) {
    return <a href={href} target="_blank" rel="noreferrer">{children}</a>
  },
}

export function MarkdownMessage({ source }: { source: string }) {
  if (!source.trim()) return null
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
