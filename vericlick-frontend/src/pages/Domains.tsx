import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Globe02Icon, Delete01Icon, CheckmarkCircle02Icon, Add01Icon, Copy01Icon, Key01Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import {
  fetchDomains, addDomain, deleteDomain, fetchWorkspace,
  getVerifyChallenge, confirmVerification, recheckDomain,
  fetchInstallTokens, createInstallToken, revokeInstallToken,
} from '@/api/workspace'
import type { Domain } from '@/types'
import { parseApiError } from '@/lib/errors'
import { DashboardSkeleton } from '@/components/ui/DashboardSkeleton'

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

function VerifyModal({ domain, onClose }: { domain: Domain; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState<'html_meta' | 'dns_txt'>('html_meta')
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<{ verified: boolean; error?: string; detail?: string } | null>(null)

  const { data: challenge } = useQuery({
    queryKey: ['verify-challenge', domain.id, method],
    queryFn: () => getVerifyChallenge(domain.id, method),
  })

  const confirmMutation = useMutation({
    mutationFn: () => confirmVerification(domain.id),
    onSuccess: (data) => {
      setResult(data)
      if (data.verified) {
        queryClient.invalidateQueries({ queryKey: ['domains'] })
      }
    },
    onSettled: () => setVerifying(false),
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Verify {domain.domain}</h2>
          <p className="text-sm text-muted mb-5">
            Prove you own this domain so VeriClick can protect it.
          </p>

          <div className="flex gap-2 mb-5">
            <button
              onClick={() => { setMethod('html_meta'); setResult(null) }}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${method === 'html_meta' ? 'bg-black text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              HTML Meta Tag
            </button>
            <button
              onClick={() => { setMethod('dns_txt'); setResult(null) }}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${method === 'dns_txt' ? 'bg-black text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              DNS TXT Record
            </button>
          </div>

          {challenge && (
            <div className="space-y-4">
              {method === 'html_meta' ? (
                <>
                  <div>
                    <p className="text-sm font-bold text-slate-900 mb-1">1. Add this tag to your homepage &lt;head&gt;</p>
                    <div className="relative">
                      <code className="block bg-slate-900 text-emerald-400 text-xs p-3 rounded-xl break-all pr-10">
                        {challenge.metaTag}
                      </code>
                      <button
                        onClick={() => copyToClipboard(challenge.metaTag)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                      >
                        <HugeiconsIcon icon={Copy01Icon} className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted">
                    Or use the combined snippet on the <strong>Install</strong> page — it includes both the
                    verification meta tag and the anti-bot script in one paste.
                  </p>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-bold text-slate-900 mb-1">1. Add a TXT record to your DNS</p>
                    <div className="space-y-2">
                      <div className="relative">
                        <label className="text-xs text-muted">Name / Host</label>
                        <code className="block bg-slate-900 text-emerald-400 text-xs p-2 rounded-lg pr-10">
                          {challenge.dnsName}
                        </code>
                        <button
                          onClick={() => copyToClipboard(challenge.dnsName)}
                          className="absolute top-6 right-2 p-1 rounded bg-slate-700 hover:bg-slate-600 text-white"
                        >
                          <HugeiconsIcon icon={Copy01Icon} className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="relative">
                        <label className="text-xs text-muted">Value</label>
                        <code className="block bg-slate-900 text-emerald-400 text-xs p-2 rounded-lg break-all pr-10">
                          {challenge.dnsValue}
                        </code>
                        <button
                          onClick={() => copyToClipboard(challenge.dnsValue)}
                          className="absolute top-6 right-2 p-1 rounded bg-slate-700 hover:bg-slate-600 text-white"
                        >
                          <HugeiconsIcon icon={Copy01Icon} className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted">
                    DNS changes may take up to 48 hours to propagate.
                  </p>
                </>
              )}

              {result && (
                <div className={`p-3 rounded-xl text-sm ${result.verified ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {result.verified ? (
                    <div className="space-y-2">
                      <span className="font-bold">Domain verified successfully!</span>
                      <a
                        href="/app/install"
                        className="block w-full text-center bg-black hover:bg-neutral-800 text-white py-2.5 rounded-xl text-sm font-bold transition-all"
                      >
                        Next: Install Script
                      </a>
                    </div>
                  ) : (
                    <span>{result.detail || result.error || 'Verification failed.'}</span>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  setVerifying(true)
                  confirmMutation.mutate()
                }}
                disabled={verifying || result?.verified}
                className="w-full bg-black hover:bg-neutral-800 text-white py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              >
                {verifying ? 'Verifying…' : result?.verified ? 'Verified' : 'Verify Now'}
              </button>
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

function InstallTokenSection() {
  const queryClient = useQueryClient()
  const [showRawToken, setShowRawToken] = useState<string | null>(null)

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchWorkspace,
  })
  const hasPlan = !!workspace?.planName

  const { data: tokens, isLoading } = useQuery({
    queryKey: ['install-tokens'],
    queryFn: fetchInstallTokens,
    retry: false,
    enabled: hasPlan,
  })

  const createMutation = useMutation({
    mutationFn: () => createInstallToken('Primary'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['install-tokens'] })
      setShowRawToken(data.token)
    },
    onError: (err) => toast.error(parseApiError(err) || 'Failed to create token'),
  })

  const revokeMutation = useMutation({
    mutationFn: revokeInstallToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['install-tokens'] })
      toast.success('Token revoked')
    },
    onError: (err) => toast.error(parseApiError(err) || 'Failed to revoke token'),
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  if (isLoading) return null

  if (!hasPlan) {
    return (
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-2">
          <HugeiconsIcon icon={Key01Icon} className="w-4 h-4 text-muted" />
          Install Tokens
        </h3>
        <p className="text-xs text-muted">
          A plan is required to generate install tokens. Choose a plan to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <HugeiconsIcon icon={Key01Icon} className="w-4 h-4 text-muted" />
            Install Tokens
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Tokens authenticate your script. The raw value is shown once.
          </p>
        </div>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="bg-black hover:bg-neutral-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
        >
          {createMutation.isPending ? 'Creating…' : 'Generate Token'}
        </button>
      </div>

      {showRawToken && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs font-bold text-amber-700 mb-2">Your new install token (copy it now — it won't be shown again):</p>
          <div className="relative">
            <code className="block bg-slate-900 text-emerald-400 text-xs p-3 rounded-lg break-all pr-10">
              {showRawToken}
            </code>
            <button
              onClick={() => copyToClipboard(showRawToken)}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
            >
              <HugeiconsIcon icon={Copy01Icon} className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={() => setShowRawToken(null)}
            className="mt-2 text-xs font-bold text-amber-700 hover:text-amber-900"
          >
            I've copied it
          </button>
        </div>
      )}

      {tokens && tokens.length > 0 ? (
        <div className="divide-y divide-neutral-100">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-bold text-slate-900">{t.label}</div>
                <div className="text-xs text-muted font-mono">{t.tokenPrefix}…</div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold ${t.isActive ? 'text-emerald-600' : 'text-red-500'}`}>
                  {t.isActive ? 'Active' : 'Revoked'}
                </span>
                {t.isActive && (
                  <button
                    onClick={() => {
                      if (window.confirm('Revoke this token? The script will stop working on your site.')) {
                        revokeMutation.mutate(t.id)
                      }
                    }}
                    className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted py-4 text-center">
          No install tokens yet. Generate one to get started.
        </p>
      )}
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

  const handleAdd = () => {
    if (!newDomain.trim()) {
      toast.error('Enter a domain')
      return
    }
    addMutation.mutate(newDomain.trim())
  }

  const activeDomains = domains?.filter((d) => d.isActive) ?? []
  const limit = workspace?.domainLimit ?? 3
  const used = workspace?.domainsUsed ?? 0
  const canAdd = used < limit

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
              <div key={d.id} className="flex items-center justify-between px-6 py-4 hover:bg-neutral-50/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <HugeiconsIcon icon={Globe02Icon} className="w-5 h-5 text-muted shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">{d.domain}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <VerificationBadge verified={d.verified} />
                      <HealthBadge status={d.healthStatus} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
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

      {workspace && <InstallTokenSection />}

      <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4 text-muted" />
          How domains work
        </h3>
        <ul className="text-sm text-muted space-y-2 leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="text-xs mt-1.5">1.</span>
            Add your domain, then verify ownership via meta tag or DNS record.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-xs mt-1.5">2.</span>
            Generate an install token and paste the VeriClick anti-bot script into your site.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-xs mt-1.5">3.</span>
            Use "Test Installation" on the Install page to confirm the script loads.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-xs mt-1.5">4.</span>
            Each plan covers 1 domain with 7-day access. Renew manually when ready.
          </li>
        </ul>
      </div>

      {verifyDomain && (
        <VerifyModal domain={verifyDomain} onClose={() => setVerifyDomain(null)} />
      )}
    </div>
  )
}
