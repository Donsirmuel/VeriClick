import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Globe02Icon, Delete01Icon, CheckmarkCircle02Icon, Add01Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import {
  fetchDomains, addDomain, deleteDomain, fetchWorkspace, recheckDomain, testInstallation,
} from '@/api/workspace'
import type { Domain } from '@/types'
import { parseApiError } from '@/lib/errors'
import { DashboardSkeleton } from '@/components/ui/DashboardSkeleton'
import { Link } from 'react-router-dom'

function HealthBadge({ status }: { status: string }) {
  if (status === 'healthy') return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-3 h-3" /> Healthy
    </span>
  )
  if (status === 'unhealthy') return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-3 h-3" /> Unhealthy
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
      Unknown
    </span>
  )
}

function VerificationBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-3 h-3" /> Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
      Unverified
    </span>
  )
}

function ScriptBadge({ installed }: { installed: boolean }) {
  return installed ? (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-3 h-3" /> Script installed
    </span>
  ) : null
}

function VerifyModal({ domain, onClose }: { domain: Domain; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Verify {domain.domain}</h2>
          <p className="text-sm text-muted mb-5">
            Prove you own this domain so VeriClick can protect it.
          </p>

          {domain.purpose === 'protection' ? (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-neutral-200 rounded-xl p-4">
                <p className="text-sm text-slate-700 leading-relaxed">
                  Your domain will be verified automatically when the script first loads on your site.
                  Just paste the VeriClick script in your &lt;head&gt; and you're done.
                </p>
              </div>
              <Link
                to="/app/shield"
                className="block w-full text-center bg-black hover:bg-neutral-800 text-white py-3 rounded-xl text-sm font-bold transition-all"
              >
                Next: Install Script
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-bold text-slate-900">Add a CNAME record to your DNS</p>
              <p className="text-xs text-muted">
                Add the following CNAME record to verify ownership of this redirect domain.
              </p>
              <p className="text-xs text-muted">
                DNS changes may take up to 48 hours to propagate.
              </p>
              <Link
                to="/app/shield"
                className="block w-full text-center bg-black hover:bg-neutral-800 text-white py-3 rounded-xl text-sm font-bold transition-all"
              >
                Next: Install Script
              </Link>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-full border-t border-neutral-200 py-3 text-sm font-bold text-slate-600 hover:bg-neutral-50 rounded-b-2xl transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}

export default function Domains() {
  const queryClient = useQueryClient()
  const [newDomain, setNewDomain] = useState('')
  const [verifyDomain, setVerifyDomain] = useState<Domain | null>(null)

  const { data: domains, isLoading: domainsLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: fetchDomains,
  })

  const { data: workspace, isLoading: workspaceLoading } = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchWorkspace,
  })

  const addMutation = useMutation({
    mutationFn: addDomain,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      setNewDomain('')
      toast.success('Domain added — now verify it')
    },
    onError: (err) => toast.error(parseApiError(err) || 'Failed to add domain'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDomain,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      toast.success('Domain removed')
    },
    onError: (err) => toast.error(parseApiError(err) || 'Failed to remove domain'),
  })

  const recheckMutation = useMutation({
    mutationFn: recheckDomain,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      toast.success('Health check updated')
    },
    onError: (err) => toast.error(parseApiError(err) || 'Health check failed'),
  })

  const installationMutation = useMutation({
    mutationFn: testInstallation,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      if (result.installed) {
        toast.success('VeriClick script found on the website')
      } else {
        toast.error(result.error || 'VeriClick script was not found on the website')
      }
    },
    onError: (err) => toast.error(parseApiError(err) || 'Script verification failed'),
  })

  const handleAdd = () => {
    if (!newDomain.trim()) {
      toast.error('Enter a domain')
      return
    }
    addMutation.mutate(newDomain.trim())
  }

  const activeDomains = domains?.filter((d) => d.isActive) ?? []
  const limit = workspace?.domainLimit ?? 0
  const used = workspace?.domainsUsed ?? 0
  const hasPlan = !!workspace?.planName
  const canAdd = hasPlan && used < limit

  if (domainsLoading || workspaceLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Domains</h1>
        <p className="text-sm text-muted mt-1">
          Register and verify your domains to activate protection. Your plan allows up to{' '}
          <strong>{limit}</strong> domains.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <div className="text-sm font-bold text-slate-900">
              {used} / {limit} domains used
            </div>
            <div className="text-xs text-muted mt-0.5">
              {canAdd
                ? `You can add ${limit - used} more domain${limit - used !== 1 ? 's' : ''}`
                : 'Upgrade your plan to add more domains'}
            </div>
          </div>
          <div className="h-2 w-full sm:w-40 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-black rounded-full transition-all"
              style={{ width: `${Math.min((used / limit) * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="example.com"
            disabled={!canAdd}
            className="flex-1 bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors disabled:opacity-50"
          />
          <button
            onClick={handleAdd}
            disabled={!canAdd || addMutation.isPending}
            className="bg-black hover:bg-neutral-800 text-white px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 whitespace-nowrap"
          >
            <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
            {addMutation.isPending ? 'Adding…' : 'Add domain'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        {activeDomains.length > 0 ? (
          <div className="divide-y divide-neutral-100">
            {activeDomains.map((d) => (
              <div key={d.id} className="flex flex-col gap-3 px-4 sm:px-6 py-4 hover:bg-neutral-50/50 transition-colors sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <HugeiconsIcon icon={Globe02Icon} className="w-5 h-5 text-muted shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">{d.domain}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <VerificationBadge verified={d.verified} />
                      <HealthBadge status={d.healthStatus} />
                      <ScriptBadge installed={d.scriptInstalled} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-4">
                  {d.purpose === 'protection' && (
                    <button
                      onClick={() => installationMutation.mutate(d.id)}
                      disabled={installationMutation.isPending}
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {installationMutation.isPending ? 'Checking…' : d.scriptInstalled ? 'Check' : 'Verify script'}
                    </button>
                  )}
                  {!d.verified && (
                    <button
                      onClick={() => setVerifyDomain(d)}
                      className="text-xs font-bold text-black bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Verify
                    </button>
                  )}
                  {d.verified && (
                    <button
                      onClick={() => recheckMutation.mutate(d.id)}
                      disabled={recheckMutation.isPending}
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Recheck
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (window.confirm(`Remove ${d.domain}?`)) {
                        deleteMutation.mutate(d.id)
                      }
                    }}
                    className="text-neutral-400 hover:text-red-500 transition-colors p-1"
                    title="Remove domain"
                  >
                    <HugeiconsIcon icon={Delete01Icon} className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <HugeiconsIcon icon={Globe02Icon} className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
            <p className="text-sm text-muted mb-1">No domains registered yet</p>
            <p className="text-xs text-muted">
              Add a domain above, then verify ownership to start protecting it.
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4 text-muted" />
          How domains work
        </h3>
        <ul className="text-sm text-muted space-y-2 leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="text-xs mt-1.5">1.</span>
            Add your domain, then verify ownership.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-xs mt-1.5">2.</span>
            Paste the VeriClick anti-bot script into your site's &lt;head&gt;.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-xs mt-1.5">3.</span>
            Protection activates automatically on the first page load.
          </li>
        </ul>
      </div>

      {verifyDomain && (
        <VerifyModal domain={verifyDomain} onClose={() => setVerifyDomain(null)} />
      )}
    </div>
  )
}
