import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon, Copy01Icon, Globe02Icon, CheckmarkCircle02Icon,
  RefreshIcon, Clock01Icon,
} from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { recheckDomain } from '@/api/domains'
import { formatRelativeTime } from '@/lib/utils'
import type { Domain } from '@/types'

interface DnsSetupDialogProps {
  domain: Domain
  onClose: () => void
  onRechecked?: () => void
}

export function DnsSetupDialog({ domain, onClose, onRechecked }: DnsSetupDialogProps) {
  const [checking, setChecking] = useState(false)

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleRecheck = async () => {
    setChecking(true)
    try {
      await recheckDomain(domain.id)
      toast.success('DNS rechecked')
      onRechecked?.()
    } catch {
      toast.error('Could not reach the check. Try again in a moment.')
    } finally {
      setChecking(false)
    }
  }

  const record = domain.dnsSetup
  const pointedAtServer = domain.pointsToServer
  const isReadyToServe = domain.verified && domain.ready

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-neutral-200 overflow-y-auto max-h-[calc(100vh-2rem)]">
        <div className="flex items-center justify-between p-6 border-b border-neutral-200">
          <h2 className="text-lg font-bold text-slate-900">Point your domain at VeriClick</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors">
            <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5 text-muted" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {isReadyToServe ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-success/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-7 h-7 text-success" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">All set — you're live</h3>
              <p className="text-sm text-muted max-w-sm mx-auto">
                <span className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded">{domain.domain}</span>{' '}
                is verified and pointed at VeriClick. Your tracking links are now running on your own domain.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 flex gap-3">
                <div className="mt-0.5 shrink-0">
                  <HugeiconsIcon icon={Globe02Icon} className="w-5 h-5 text-black" />
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  One small change makes{' '}
                  <span className="font-mono text-xs bg-white border border-neutral-200 px-1 rounded">{domain.domain}</span>{' '}
                  work with VeriClick. After it, links like{' '}
                  <span className="font-mono text-xs bg-white border border-neutral-200 px-1 rounded">{domain.domain}/r/&lt;slug&gt;</span>{' '}
                  use your own brand. Without this change, links still work — they just use the VeriClick URL instead.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 ml-1">The record to add</label>
                <div className="rounded-xl border border-neutral-200">
                  <table className="w-full text-sm table-fixed">
                    <tbody>
                      <tr className="border-b border-neutral-200">
                        <th className="text-left text-xs font-bold text-muted uppercase tracking-wider bg-neutral-50 px-4 py-2.5 w-24">Type</th>
                        <td className="px-4 py-2.5 font-mono text-xs truncate">{record.label}</td>
                      </tr>
                      <tr className="border-b border-neutral-200">
                        <th className="text-left text-xs font-bold text-muted uppercase tracking-wider bg-neutral-50 px-4 py-2.5 w-24">Name</th>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs whitespace-nowrap overflow-x-auto min-w-0 flex-1">{record.host === '@' ? `${record.host} (@)` : record.host}</span>
                            <button onClick={() => handleCopy(record.host, 'Host')} className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors shrink-0" title="Copy name">
                              <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4 text-muted" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr className="border-b border-neutral-200">
                        <th className="text-left text-xs font-bold text-muted uppercase tracking-wider bg-neutral-50 px-4 py-2.5 w-24">TTL</th>
                        <td className="px-4 py-2.5 font-mono text-xs truncate">{'300 (or default)'}</td>
                      </tr>
                      <tr>
                        <th className="text-left text-xs font-bold text-muted uppercase tracking-wider bg-neutral-50 px-4 py-2.5 w-24 align-top">Value</th>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0 bg-neutral-900 text-neutral-100 text-xs font-mono px-3 py-2.5 rounded-lg break-all">{record.target}</div>
                            <button
                              onClick={() => handleCopy(record.target, 'Value')}
                              className="p-2.5 bg-black hover:bg-neutral-800 text-white rounded-lg transition-colors shrink-0"
                              title="Copy record value"
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
                <h4 className="text-sm font-bold text-slate-900">How to do it</h4>
                <ol className="list-decimal pl-5 text-sm text-muted space-y-1 leading-relaxed">
                  <li>Log in to the company you bought <span className="font-mono text-xs bg-neutral-100 px-1 rounded">{domain.domain}</span> from (like GoDaddy, Namecheap, or Cloudflare).</li>
                  <li>Find the page called DNS or "Manage DNS".</li>
                  <li>Add a new record ({record.label}). Copy the Name (or "Host") and the Value above exactly as shown.</li>
                  <li>Save it.</li>
                  <li>It usually takes a few minutes to a few hours before the change spreads across the internet. When you think it's ready, press <strong>Check again</strong> below.</li>
                </ol>
                {record.note && (
                  <p className="text-xs text-slate-700 leading-relaxed bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
                    {record.note}
                  </p>
                )}
                <p className="text-xs text-muted leading-relaxed bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
                  No idea where to find it? Ask the assistant (chat bubble, bottom-right) or contact us — happy to help.
                </p>
              </div>

              {pointedAtServer && !domain.verified && (
                <div className="flex items-center gap-2 text-xs text-warning">
                  <HugeiconsIcon icon={Clock01Icon} className="w-3.5 h-3.5 shrink-0" />
                  Your domain points at VeriClick but ownership isn't verified yet. Go through the TXT step first.
                </div>
              )}

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
                  onClick={handleRecheck}
                  disabled={checking}
                  className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm disabled:opacity-50"
                >
                  <HugeiconsIcon icon={RefreshIcon} className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                  {checking ? 'Checking DNS...' : 'Check again'}
                </button>
              </div>

              <p className="text-[11px] text-muted flex items-center gap-1.5">
                <HugeiconsIcon icon={Clock01Icon} className="w-3 h-3" />
                Last checked {domain.lastChecked ? formatRelativeTime(domain.lastChecked) : 'recently'}.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}