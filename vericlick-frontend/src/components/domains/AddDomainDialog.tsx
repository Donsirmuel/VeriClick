import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Globe02Icon, ShieldIcon } from '@hugeicons/core-free-icons'

interface AddDomainDialogProps {
  onClose: () => void
  onSubmit: (domain: string) => void
  loading?: boolean
}

export function AddDomainDialog({ onClose, onSubmit, loading }: AddDomainDialogProps) {
  const [domain, setDomain] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!domain || loading) return
    onSubmit(domain)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md border border-neutral-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200">
          <h2 className="text-lg font-bold text-slate-900">Add Tracking Domain</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors">
            <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-neutral-50 p-4 rounded-xl flex gap-3 border border-neutral-200">
            <div className="mt-0.5">
              <HugeiconsIcon icon={ShieldIcon} className="w-5 h-5 text-black" />
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Register a new domain to our monitoring engine. We will automatically start checking for RBLs, blacklists, and security gateway flags every 15 minutes.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 ml-1">Domain Name</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-400 group-focus-within:text-black transition-colors">
                <HugeiconsIcon icon={Globe02Icon} className="w-5 h-5" />
              </div>
              <input 
                type="text" 
                autoFocus
                required
                placeholder="click.tracking-domain.com"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </div>
            <p className="text-[10px] text-muted ml-1">Do not include http:// or https://</p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-bold text-muted hover:text-slate-900 transition-colors">
              Cancel
            </button>
            <button type="submit" className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm">
              Register Domain
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
