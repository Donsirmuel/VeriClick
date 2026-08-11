import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon, Copy01Icon, Globe02Icon, ShieldKeyIcon, CheckmarkCircle02Icon,
  RefreshIcon, Clock01Icon,
} from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { fetchDomain, recheckDomain, verifyDomain } from '@/api/domains'
import { parseApiError } from '@/lib/errors'
import { formatRelativeTime } from '@/lib/utils'
import type { Domain } from '@/types'

interface DnsSetupDialogProps {
  domain: Domain
  onClose: () => void
  onRechecked?: () => void
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error('Failed to copy')
    }
  }
  return (
    <button
      onClick={handleCopy}
      className="p-2.5 bg-black hover:bg-neutral-800 text-white rounded-lg transition-colors shrink-0"
      title={`Copy ${label}`}
    >
      <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4" />
    </button>
  )
}

function StepBadge({ done }: { done: boolean }) {
  return done ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-success bg-success/10 px-2 py-0.5 rounded-full">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-3 h-3" />
      Done
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-warning bg-warning/10 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-warning" />
      To add
    </span>
  )
}

export function DnsSetupDialog({ domain, onClose, onRechecked }: DnsSetupDialogProps) {
  const [current, setCurrent] = useState<Domain>(domain)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const record = current.dnsSetup
  const trackingHost = record?.trackingHost || current.domain
  const verified = current.verified
  const pointed = current.pointsToServer
  const fullyReady = current.ready

  const handleCheck = async () => {
    setChecking(true)
    setError(null)
    try {
      // TXT ownership first, then DNS pointing. One "Check setup" press covers
      // both records the user was told to add.
      let verifyError: string | null = null
      if (!verified) {
        try {
          await verifyDomain(current.id)
        } catch (err) {
          verifyError = parseApiError(err)
        }
      }
      try {
        await recheckDomain(current.id)
      } catch {
        // Non-fatal — the fetch below still gives a current picture.
      }
      const fresh = await fetchDomain(current.id)
      setCurrent(fresh)
      onRechecked?.()

      if (fresh.verified && fresh.ready) {
        toast.success('Your domain is verified and pointing at VeriClick')
        // Auto-close once everything is confirmed.
        setTimeout(onClose, 1200)
      } else if (fresh.verified) {
        toast.success('Ownership verified — still waiting on the DNS record to spread')
      } else {
        setError(
          verifyError ||
          'The TXT record was not found yet. Add it to your DNS provider, wait for it to propagate (usually 5–30 minutes), then check again.'
        )
      }
    } catch {
      toast.error('Could not reach the check. Try again in a moment.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-neutral-200 overflow-y-auto max-h-[calc(100vh-2rem)]">
        <div className="flex items-center justify-between p-6 border-b border-neutral-200">
          <h2 className="text-lg font-bold text-slate-900">Set up your domain</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors">
            <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5 text-muted" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {fullyReady ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-success/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-7 h-7 text-success" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">All set — you're live</h3>
              <p className="text-sm text-muted max-w-sm mx-auto">
                <span className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded">{trackingHost}</span>{' '}
                is verified and pointed at VeriClick. Your tracking links now run on your own domain.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 flex gap-3">
                <div className="mt-0.5 shrink-0">
                  <HugeiconsIcon icon={Globe02Icon} className="w-5 h-5 text-black" />
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Add <strong>both</strong> records at your DNS provider in one go, then press
                  {' '}<strong>Check setup</strong> once. Your tracked links will live on{' '}
                  <span className="font-mono text-xs bg-white border border-neutral-200 px-1 rounded">{trackingHost}</span>
                  {' '}— for example{' '}
                  <span className="font-mono text-xs bg-white border border-neutral-200 px-1 rounded">{trackingHost}/r/&lt;slug&gt;</span>.
                </p>
              </div>

              {/* Step 1 — TXT ownership */}
              <div className={`rounded-xl border ${verified ? 'border-success/30 bg-success/5' : 'border-neutral-200'}`}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-neutral-100 rounded-lg flex items-center justify-center">
                      <HugeiconsIcon icon={ShieldKeyIcon} className="w-4 h-4 text-slate-700" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">1. Prove you own it (TXT)</h4>
                      <p className="text-[11px] text-muted">A text record that confirms control of {current.domain}.</p>
                    </div>
                  </div>
                  <StepBadge done={verified} />
                </div>
                {!verified && (
                  <div className="p-4 space-y-3">
                    <div className="rounded-xl border border-neutral-200">
                      <table className="w-full text-sm table-fixed">
                        <tbody>
                          <tr className="border-b border-neutral-200">
                            <th className="text-left text-xs font-bold text-muted uppercase tracking-wider bg-neutral-50 px-4 py-2.5 w-24">Type</th>
                            <td className="px-4 py-2.5 font-mono text-xs truncate">TXT</td>
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
                                <div className="flex-1 min-w-0 bg-neutral-900 text-neutral-100 text-xs font-mono px-3 py-2.5 rounded-lg break-all">{current.verificationRecord}</div>
                                <CopyButton text={current.verificationRecord} label="TXT record" />
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2 — CNAME pointing */}
              <div className={`rounded-xl border ${pointed ? 'border-success/30 bg-success/5' : 'border-neutral-200'}`}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-neutral-100 rounded-lg flex items-center justify-center">
                      <HugeiconsIcon icon={Globe02Icon} className="w-4 h-4 text-slate-700" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">2. Point it at VeriClick (CNAME)</h4>
                      <p className="text-[11px] text-muted">Routes {trackingHost} to VeriClick so links use your brand.</p>
                    </div>
                  </div>
                  <StepBadge done={pointed} />
                </div>
                {!pointed && record && (
                  <div className="p-4 space-y-3">
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
                                <CopyButton text={record.host} label="Host" />
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
                                <CopyButton text={record.target} label="Value" />
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {record.note && (
                      <p className="text-xs text-slate-700 leading-relaxed bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
                        {record.note}
                      </p>
                    )}
                    <p className="text-xs text-slate-700 leading-relaxed bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
                      No idea where to find it? Ask the assistant (chat bubble, bottom-right) or contact us — happy to help.
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 text-xs text-error bg-error/5 border border-error/20 rounded-lg px-3 py-2">
                  <HugeiconsIcon icon={Clock01Icon} className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="text-[11px] text-muted flex items-center gap-1.5">
                  <HugeiconsIcon icon={Clock01Icon} className="w-3 h-3" />
                  Last checked {current.lastChecked ? formatRelativeTime(current.lastChecked) : 'recently'}. DNS usually spreads in 5–30 minutes.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={checking}
                    className="px-4 py-2.5 text-sm font-bold text-muted hover:text-slate-900 transition-colors disabled:opacity-50"
                  >
                    Later
                  </button>
                  <button
                    onClick={handleCheck}
                    disabled={checking}
                    className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm disabled:opacity-50"
                  >
                    <HugeiconsIcon icon={RefreshIcon} className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                    {checking ? 'Checking setup...' : 'Check setup'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
