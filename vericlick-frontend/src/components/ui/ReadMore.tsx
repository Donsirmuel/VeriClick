import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ReadMoreProps {
  children: React.ReactNode
  lines?: number
  className?: string
}

export function ReadMore({ children, lines = 2, className }: ReadMoreProps) {
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      const prev = el.style.cssText
      el.style.display = '-webkit-box'
      el.style.webkitLineClamp = String(lines)
      el.style.webkitBoxOrient = 'vertical'
      el.style.overflow = 'hidden'
      setCanExpand(el.scrollHeight > el.clientHeight)
      el.style.cssText = prev
    }
    check()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(check)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [lines, children, expanded])

  return (
    <div className={className}>
      <p
        ref={ref}
        className="text-sm text-muted"
        style={!expanded ? {
          display: '-webkit-box',
          WebkitLineClamp: lines,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        } : undefined}
      >
        {children}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className={cn(
            'mt-1 text-xs font-bold underline decoration-neutral-300 underline-offset-2 transition-colors',
            expanded ? 'text-muted hover:text-slate-700' : 'text-slate-700 hover:decoration-black',
          )}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}
