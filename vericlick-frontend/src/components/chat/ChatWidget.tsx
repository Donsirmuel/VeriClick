import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChatBotIcon, Cancel01Icon, ArrowUpIcon, SparklesIcon, UserIcon } from '@hugeicons/core-free-icons'
import { answerQuestion, initialBotMessage, type ChatMessage } from '@/lib/chat'
import { PRODUCT_NAME } from '@/lib/site'
import { cn } from '@/lib/utils'

let messageId = 0
function nextId(): string {
  messageId += 1
  return `msg-${messageId}`
}

function BotMessage({ text, suggestions, onSuggestion }: { text: string; suggestions?: string[]; onSuggestion: (s: string) => void }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-neutral-900 text-white flex items-center justify-center shrink-0 mt-0.5">
        <HugeiconsIcon icon={SparklesIcon} className="w-3.5 h-3.5" />
      </div>
      <div className="max-w-[85%]">
        <div className="bg-neutral-100 border border-neutral-200 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
          {text}
        </div>
        {suggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onSuggestion(s)}
                className="text-xs font-medium text-slate-700 bg-white border border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50 px-2.5 py-1 rounded-full transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex items-start justify-end gap-2.5">
      <div className="max-w-[85%] bg-neutral-900 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
      <div className="w-7 h-7 rounded-full bg-neutral-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
        <HugeiconsIcon icon={UserIcon} className="w-3.5 h-3.5" />
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-neutral-900 text-white flex items-center justify-center shrink-0 mt-0.5">
        <HugeiconsIcon icon={SparklesIcon} className="w-3.5 h-3.5" />
      </div>
      <div className="bg-neutral-100 border border-neutral-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse [animation-delay:300ms]" />
      </div>
    </div>
  )
}

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([initialBotMessage()])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, typing, open])

  const send = (raw: string) => {
    const text = raw.trim()
    if (!text || typing) return
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text }])
    setInput('')
    setTyping(true)
    const answer = answerQuestion(text)
    setTimeout(() => {
      setTyping(false)
      setMessages((prev) => [...prev, { id: nextId(), role: 'bot', text: answer.text, suggestions: answer.suggestions }])
    }, 650)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 md:right-6 z-40 w-[calc(100vw-2rem)] max-w-100 h-[min(560px,calc(100vh-8rem))] bg-white rounded-2xl border border-neutral-200 shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-neutral-950 text-white px-4 py-3.5 flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center">
              <HugeiconsIcon icon={ChatBotIcon} className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold leading-tight">{PRODUCT_NAME} Assistant</div>
              <div className="text-[11px] text-neutral-400 leading-tight truncate">
                Built-in help
              </div>
            </div>
            <Link
              to="/contact"
              className="text-[11px] font-semibold text-neutral-300 hover:text-white transition-colors hidden sm:block"
            >
              Contact
            </Link>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
              aria-label="Close chat"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-neutral-50">
            {messages.map((m) =>
              m.role === 'bot' ? (
                <BotMessage key={m.id} text={m.text} suggestions={m.suggestions} onSuggestion={send} />
              ) : (
                <UserMessage key={m.id} text={m.text} />
              )
            )}
            {typing && <TypingIndicator />}
          </div>

          <div className="border-t border-neutral-200 bg-white px-3 py-3 shrink-0">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the script, shield, IP rules…"
                className="flex-1 bg-neutral-100 border border-transparent focus:border-neutral-300 focus:bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors placeholder:text-neutral-400"
                aria-label="Chat message"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || typing}
                className="w-10 h-10 rounded-xl bg-neutral-900 hover:bg-neutral-700 text-white flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 disabled:hover:bg-neutral-900"
                aria-label="Send message"
              >
                <HugeiconsIcon icon={ArrowUpIcon} className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'fixed bottom-6 right-4 md:right-6 z-40 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all',
          open ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-neutral-900 hover:bg-neutral-700'
        )}
        aria-label={open ? 'Close chat assistant' : 'Open chat assistant'}
      >
        <HugeiconsIcon icon={ChatBotIcon} className="w-6 h-6 text-white" />
      </button>
    </>
  )
}
