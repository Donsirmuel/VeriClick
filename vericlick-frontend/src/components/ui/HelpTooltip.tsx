import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { HelpCircleIcon } from '@hugeicons/core-free-icons'

interface HelpTooltipProps {
  text: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function HelpTooltip({ text, side = 'top' }: HelpTooltipProps) {
  const [show, setShow] = useState(false)

  const sideClasses = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        className="text-muted hover:text-slate-600 transition-colors focus:outline-none"
      >
        <HugeiconsIcon icon={HelpCircleIcon} className="w-4 h-4" />
      </button>
      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <div className={`absolute z-50 ${sideClasses[side]} w-64 p-3 bg-slate-900 text-white text-xs leading-relaxed rounded-xl shadow-xl pointer-events-none`}>
            {text}
            <div className={`absolute w-2 h-2 bg-slate-900 transform rotate-45 ${
              side === 'top' ? 'top-full -translate-x-1/2 left-1/2 -mt-1' :
              side === 'bottom' ? 'bottom-full -translate-x-1/2 left-1/2 -mb-1' :
              side === 'left' ? 'left-full -translate-y-1/2 top-1/2 -ml-1' :
              'right-full -translate-y-1/2 top-1/2 -mr-1'
            }`} />
          </div>
        </>
      )}
    </span>
  )
}
