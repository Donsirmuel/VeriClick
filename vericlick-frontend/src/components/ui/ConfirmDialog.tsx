import { HugeiconsIcon } from '@hugeicons/react'
import { AlertCircleIcon, Cancel01Icon } from '@hugeicons/core-free-icons'
interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-neutral-200 p-8 max-w-md w-full mx-4">
        <button
          onClick={onCancel}
          disabled={loading}
          aria-label="Close dialog"
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-neutral-100 transition-colors disabled:opacity-50"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5 text-muted" />
        </button>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            variant === 'danger' ? 'bg-error/10' : 'bg-neutral-100'
          }`}>
            <HugeiconsIcon
              icon={variant === 'danger' ? AlertCircleIcon : Cancel01Icon}
              className={`w-6 h-6 ${variant === 'danger' ? 'text-error' : 'text-muted'}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-slate-900 mb-1">{title}</h3>
            <p className="text-sm text-muted leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-8">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl text-sm font-bold border border-neutral-200 hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 ${
              variant === 'danger'
                ? 'bg-error hover:bg-error/90'
                : 'bg-black hover:bg-neutral-800'
            }`}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
