import { HugeiconsIcon } from '@hugeicons/react'

interface EmptyStateProps {
  icon: any
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mb-5">
        <HugeiconsIcon icon={icon} className="w-7 h-7 text-muted" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-muted text-center max-w-sm mb-6 leading-relaxed">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="bg-black hover:bg-neutral-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
