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
  onRequestDnsSetup?: (domain: Domain) => void
}

export function VerifyDomainDialog({ domain, onClose, onVerified, onRequestDnsSetup }: VerifyDomainDialogProps) {
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
      // Auto-close so the user lands back on the list with the updated status.
      setTimeout(onClose, 1400)
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
            <div className="py-4 space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 bg-success/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-7 h-7 text-success" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Ownership confirmed</h3>
                <p className="text-sm text-muted max-w-sm mx-auto">
                  <span className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded">{domain.domain}</span>{' '}
                  is verified — you control it. That's the first of two steps.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 space-y-3">
                <h4 className="text-sm font-bold text-slate-900">What's next</h4>
{domain.pointsToServer ? (
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4 text-success" />
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      Your domain is already pointing at VeriClick. Links on{' '}
                      <span className="font-mono text-xs bg-neutral-100 px-1 rounded">{domain.domain}</span> are
                      ready to use your own brand. Copy a tracking link from the Links page and start sharing.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      One more short step: point{' '}
                      <span className="font-mono text-xs bg-neutral-100 px-1 rounded">{domain.domain}</span>{' '}
                      at VeriClick so your links use your own brand. Until then links still work — they just use the VeriClick URL.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3">
                {onRequestDnsSetup && (
                  <button
                    onClick={() => { if (onRequestDnsSetup) { onRequestDnsSetup(domain); onClose() } }}
                    className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
                  >
                    Set up DNS next
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 text-sm font-bold text-muted hover:text-slate-900 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 flex gap-3">
                <div className="mt-0.5 shrink-0">
                  <HugeiconsIcon icon={ShieldKeyIcon} className="w-5 h-5 text-black" />
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  To prove you own <span className="font-mono text-xs bg-white border border-neutral-200 px-1 rounded">{domain.domain}</span>,
                  you add a small "text record" (a TXT record) at the company you bought the domain from.
                  It's a standard step used by many services, and you only do it once per domain.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 ml-1">The text record (TXT) to add</label>
                <div className="rounded-xl border border-neutral-200">
                  <table className="w-full text-sm table-fixed">
                    <tbody>
                      <tr className="border-b border-neutral-200">
                        <th className="text-left text-xs font-bold text-muted uppercase tracking-wider bg-neutral-50 px-4 py-2.5 w-24">Type</th>
                        <td className="px-4 py-2.5 font-mono text-xs truncate">{'TXT'}</td>
                      </tr>
                      <tr className="border-b border-neutral-200">
                        <th className="text-left text-xs font-bold text-muted uppercase tracking-wider bg-neutral-50 px-4 py-2.5 w-24">Name</th>
                        <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap overflow-x-auto min-w-0">{'@'}</td>
                      </tr>
                      <tr className="border-b border-neutral-200">
                        <th className="text-left text-xs font-bold text-muted uppercase tracking-wider bg-neutral-50 px-4 py-2.5 w-24">TTL</th>
                        <td className="px-4 py-2.5 font-mono text-xs truncate">{'300'}</td>
                      </tr>
                      <tr>
                        <th className="text-left text-xs font-bold text-muted uppercase tracking-wider bg-neutral-50 px-4 py-2.5 w-24 align-top">Value</th>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0 bg-neutral-900 text-neutral-100 text-xs font-mono px-3 py-2.5 rounded-lg break-all">{domain.verificationRecord}</div>
                            <button
                              onClick={handleCopyRecord}
                              className="p-2.5 bg-black hover:bg-neutral-800 text-white rounded-lg transition-colors shrink-0"
                              title="Copy TXT record"
                            >
                              <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 space-y-2">
                <h4 className="text-sm font-bold text-slate-900">How to add it</h4>
                <ol className="list-decimal pl-5 text-sm text-muted space-y-1 leading-relaxed">
                  <li>Log in to the company you bought <span className="font-mono text-xs bg-neutral-100 px-1 rounded">{domain.domain}</span> from (like GoDaddy, Namecheap, or Cloudflare).</li>
                  <li>Find the page called DNS or "Manage DNS" and add a new record of type <strong>TXT</strong>.</li>
                  <li>Copy the value on the right into the "Value" or "Content" box. Leave the Name as <span className="font-mono text-xs bg-neutral-100 px-1 rounded">@</span> if you can. If there's a TTL box, use the default.</li>
                  <li>Save it, then press <strong>Check verification</strong> below. It can take a few minutes for the change to spread across the internet.</li>
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
