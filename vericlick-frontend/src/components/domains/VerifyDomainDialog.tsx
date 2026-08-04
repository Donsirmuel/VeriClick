import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon, Copy01Icon, ShieldKeyIcon, CheckmarkCircle02Icon,
  RefreshIcon, Clock01Icon,
} from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { verifyDomain } from '@/api/domains'
import { parseApiError } from '@/lib/errors'
import type { Domain } from '@/types'

interface VerifyDomainDialogProps {
  domain: Domain
  onClose: () => void
  onVerified: () => void
}

export function VerifyDomainDialog({ domain, onClose, onVerified }: VerifyDomainDialogProps) {
  const [checking, setChecking] = useState(false)
  const [verified, setVerified] = useState(false)

  const handleCopyRecord = async () => {
    try {
      await navigator.clipboard.writeText(domain.verificationRecord)
      toast.success('TXT record copied')
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleVerify = async () => {
    setChecking(true)
    try {
      await verifyDomain(domain.id)
      setVerified(true)
      toast.success('Domain verified — this domain is now trusted')
      onVerified()
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-neutral-200">
        <div className="flex items-center justify-between p-6 border-b border-neutral-200">
          <h2 className="text-lg font-bold text-slate-900">Verify domain ownership</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors">
            <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5 text-muted" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {verified ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-success/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-7 h-7 text-success" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Ownership confirmed</h3>
              <p className="text-sm text-muted max-w-sm mx-auto">
                <span className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded">{domain.domain}</span>{' '}
                is verified. Tracked links on this domain are treated as fully trusted.
              </p>
              <button
                onClick={onClose}
                className="mt-6 bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 flex gap-3">
                <div className="mt-0.5 shrink-0">
                  <HugeiconsIcon icon={ShieldKeyIcon} className="w-5 h-5 text-black" />
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  To prove you own <span className="font-mono text-xs bg-white border border-neutral-200 px-1 rounded">{domain.domain}</span>,
                  add the TXT record below at your DNS provider. This is the same step used to
                  verify domains with email or CDN providers. You only do this once per domain.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 ml-1">TXT record value</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-neutral-900 text-neutral-100 text-xs font-mono px-4 py-3 rounded-xl overflow-x-auto whitespace-nowrap">
                    {domain.verificationRecord}
                  </div>
                  <button
                    onClick={handleCopyRecord}
                    className="p-3 bg-black hover:bg-neutral-800 text-white rounded-xl transition-colors shrink-0"
                    title="Copy TXT record"
                  >
                    <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 space-y-2">
                <h4 className="text-sm font-bold text-slate-900">How to add it</h4>
                <ol className="list-decimal pl-5 text-sm text-muted space-y-1 leading-relaxed">
                  <li>Open your DNS provider (where the domain's DNS is managed).</li>
                  <li>Create a new TXT record with <span className="font-mono text-xs bg-neutral-100 px-1 rounded">Type = TXT</span>.</li>
                  <li>Paste the value above into the record's <span className="font-mono text-xs bg-neutral-100 px-1 rounded">Value</span>.</li>
                  <li>Save, then click <strong>Check verification</strong> below (DNS can take a few minutes to propagate).</li>
                </ol>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={checking}
                  className="px-4 py-2.5 text-sm font-bold text-muted hover:text-slate-900 transition-colors disabled:opacity-50"
                >
                  Later
                </button>
                <button
                  onClick={handleVerify}
                  disabled={checking}
                  className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm disabled:opacity-50"
                >
                  <HugeiconsIcon icon={RefreshIcon} className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                  {checking ? 'Checking DNS...' : 'Check verification'}
                </button>
              </div>

              <p className="text-[11px] text-muted flex items-center gap-1.5">
                <HugeiconsIcon icon={Clock01Icon} className="w-3 h-3" />
                Already added it? DNS changes usually take 5–30 minutes to show up.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
