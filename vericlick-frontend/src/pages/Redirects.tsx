import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  LinkSquare02Icon, Add01Icon, Delete01Icon,
  Copy01Icon, Clock02Icon,
} from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import {
  fetchRedirectRoutes, createRedirectRoute, deleteRedirectRoute,
  renewRedirectRoute, updateRedirectRoute,
  fetchRedirectDomains, addRedirectDomain,
  getVerifyChallenge, confirmVerification,
  verifyRedirectDomainCname, fetchWorkspace,
} from '@/api/workspace'
import type { RedirectRoute } from '@/types'
import { parseApiError } from '@/lib/errors'
import { DashboardSkeleton } from '@/components/ui/DashboardSkeleton'

function daysUntil(dateStr: string | null): number {
  if (!dateStr) return 0
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000))
}

function RouteCard({ route, onRenew, onDeactivate, onDelete }: {
  route: RedirectRoute
  onRenew: () => void
  onDeactivate: () => void
  onDelete: () => void
}) {
  const days = daysUntil(route.expiresAt)
  const isExpired = route.expiresAt && new Date(route.expiresAt) < new Date()
  const isWarning = days <= 3 && days > 0 && !isExpired

  return (
    <div className={`rounded-2xl border p-6 shadow-sm ${isExpired ? 'bg-red-50 border-red-200' : isWarning ? 'bg-amber-50 border-amber-200' : 'bg-white border-neutral-200'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <HugeiconsIcon icon={LinkSquare02Icon} className="w-5 h-5 text-muted shrink-0" />
            <span className="text-sm font-bold text-slate-900 truncate">{route.domain.domain}</span>
            {route.slug && <span className="text-xs text-muted">/{route.slug}</span>}
          </div>
          <div className="text-xs text-muted truncate">→ {route.destinationUrl}</div>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ml-2 ${route.isActive && !isExpired ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
          {route.isActive && !isExpired ? 'Active' : isExpired ? 'Expired' : 'Inactive'}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted mb-4">
        <span>Bot handling: <strong className="text-slate-700">{route.botAction}</strong></span>
        <span>Clicks: <strong className="text-slate-700">{route.clicksCount}</strong></span>
        <span className={isWarning ? 'text-amber-600 font-bold' : isExpired ? 'text-red-600 font-bold' : ''}>
          {isExpired ? 'Expired' : `Expires in ${days} day${days !== 1 ? 's' : ''}`}
        </span>
      </div>

      {isWarning && (
        <div className="mb-4 p-3 bg-amber-100 rounded-xl text-xs text-amber-700 font-bold">
          Your redirect expires soon. Visitors will stop being redirected after it expires.
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onRenew}
          className="bg-black hover:bg-neutral-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
        >
          Renew 7 Days
        </button>
        <button
          onClick={onDeactivate}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors"
        >
          Deactivate
        </button>
        <button
          onClick={onDelete}
          className="text-neutral-400 hover:text-red-500 transition-colors p-2 ml-auto"
          title="Delete"
        >
          <HugeiconsIcon icon={Delete01Icon} className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function CreateWizard({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(1)
  const [destinationUrl, setDestinationUrl] = useState('')
  const [botAction, setBotAction] = useState('honeypot')
  const [fallbackUrl, setFallbackUrl] = useState('')
  const [domainId, setDomainId] = useState('')
  const [slug, setSlug] = useState('')
  const [newRedirectDomain, setNewRedirectDomain] = useState('')
  const [verifyMethod, setVerifyMethod] = useState<'html_meta' | 'dns_txt'>('html_meta')
  const [cnameResult, setCnameResult] = useState<{ cname_ok: boolean; target: string | null; detail: string } | null>(null)

  const { data: redirectDomains } = useQuery({
    queryKey: ['redirect-domains'],
    queryFn: fetchRedirectDomains,
  })

  const { data: challenge } = useQuery({
    queryKey: ['verify-challenge', domainId, verifyMethod],
    queryFn: () => getVerifyChallenge(domainId, verifyMethod),
    enabled: !!domainId,
  })

  const addDomainMutation = useMutation({
    mutationFn: addRedirectDomain,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['redirect-domains'] })
      setDomainId(data.id)
      setNewRedirectDomain('')
      toast.success('Domain added')
    },
    onError: (err) => toast.error(parseApiError(err) || 'Failed to add domain'),
  })

  const verifyMutation = useMutation({
    mutationFn: () => confirmVerification(domainId),
    onSuccess: (data) => {
      if (data.verified) {
        queryClient.invalidateQueries({ queryKey: ['redirect-domains'] })
        toast.success('Domain verified!')
        setStep(3)
      } else {
        toast.error(data.detail || 'Verification failed')
      }
    },
  })

  const cnameVerifyMutation = useMutation({
    mutationFn: () => verifyRedirectDomainCname(domainId),
    onSuccess: (data: { cname_ok: boolean; target: string | null; detail: string }) => {
      setCnameResult(data)
      if (data.cname_ok) {
        toast.success('CNAME verified!')
      }
    },
    onError: () => {
      setCnameResult({ cname_ok: false, target: null, detail: 'DNS lookup failed. Try again in a few minutes.' })
    },
  })

  const createMutation = useMutation({
    mutationFn: () => createRedirectRoute({
      domainId,
      slug,
      destinationUrl,
      botAction,
      fallbackUrl: botAction === 'redirect' ? fallbackUrl : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redirect-routes'] })
      toast.success('Redirect created!')
      onClose()
    },
    onError: (err) => toast.error(parseApiError(err) || 'Failed to create redirect'),
  })

  const selectedDomain = redirectDomains?.find((d) => d.id === domainId)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied')
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Create Redirect</h2>
          <p className="text-sm text-muted mb-5">Step {step} of 4</p>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-900 block mb-1">Destination URL</label>
                <input
                  type="url"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  placeholder="https://example.com/sale"
                  className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-900 block mb-2">Bot handling</label>
                {[
                  { value: 'honeypot', label: 'Honeypot — trap bots with a fake page' },
                  { value: 'block', label: 'Block — return 404' },
                  { value: 'neutral', label: 'Neutral — empty page' },
                  { value: 'redirect', label: 'Redirect — send bots to a different URL' },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 py-1.5 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="botAction"
                      value={opt.value}
                      checked={botAction === opt.value}
                      onChange={(e) => setBotAction(e.target.value)}
                      className="accent-black"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {botAction === 'redirect' && (
                <div>
                  <label className="text-sm font-bold text-slate-900 block mb-1">Fallback URL (for bots)</label>
                  <input
                    type="url"
                    value={fallbackUrl}
                    onChange={(e) => setFallbackUrl(e.target.value)}
                    placeholder="https://example.com/blocked"
                    className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black"
                  />
                </div>
              )}
              <div>
                <label className="text-sm font-bold text-slate-900 block mb-1">Link path (optional)</label>
                <p className="text-xs text-muted mb-2">
                  This is the short part after your domain — e.g. <code className="bg-slate-100 px-1 rounded font-mono">yourdomain.com/<strong>{slug || 'sale'}</strong></code>. Leave empty for the root path.
                </p>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '')
                    if (val.length <= 200) setSlug(val)
                  }}
                  placeholder="sale"
                  className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black font-mono"
                />
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={slug.length}
                    onChange={(e) => {
                      const maxLen = Number(e.target.value)
                      setSlug((prev) => prev.slice(0, maxLen))
                    }}
                    className="flex-1 accent-black h-1.5"
                  />
                  <span className="text-xs text-muted font-mono w-14 text-right">{slug.length}/200</span>
                </div>
              </div>
              <button
                onClick={() => destinationUrl && setStep(2)}
                disabled={!destinationUrl}
                className="w-full bg-black hover:bg-neutral-800 text-white py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                This is the domain visitors will access. It must be a domain you own.
              </p>

              {redirectDomains && redirectDomains.length > 0 && (
                <div>
                  <label className="text-sm font-bold text-slate-900 block mb-1">Select existing domain</label>
                  <select
                    value={domainId}
                    onChange={(e) => setDomainId(e.target.value)}
                    className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black"
                  >
                    <option value="">Select a domain…</option>
                    {redirectDomains.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.domain} {!d.verified ? '(unverified)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="flex-1 h-px bg-neutral-200" />
                or add new
                <span className="flex-1 h-px bg-neutral-200" />
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRedirectDomain}
                  onChange={(e) => setNewRedirectDomain(e.target.value)}
                  placeholder="app.yourdomain.com"
                  className="flex-1 bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black"
                />
                <button
                  onClick={() => {
                    if (newRedirectDomain.trim()) addDomainMutation.mutate(newRedirectDomain.trim())
                  }}
                  disabled={!newRedirectDomain.trim() || addDomainMutation.isPending}
                  className="bg-black hover:bg-neutral-800 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              {selectedDomain && !selectedDomain.verified && challenge && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                  <p className="text-sm font-bold text-amber-700">Verify domain ownership</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setVerifyMethod('html_meta')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${verifyMethod === 'html_meta' ? 'bg-black text-white' : 'bg-slate-100'}`}
                    >
                      HTML Meta Tag
                    </button>
                    <button
                      onClick={() => setVerifyMethod('dns_txt')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${verifyMethod === 'dns_txt' ? 'bg-black text-white' : 'bg-slate-100'}`}
                    >
                      DNS TXT
                    </button>
                  </div>
                  {verifyMethod === 'html_meta' ? (
                    <div className="relative">
                      <code className="block bg-slate-900 text-emerald-400 text-xs p-3 rounded-lg break-all pr-10">
                        {challenge.metaTag}
                      </code>
                      <button onClick={() => copyToClipboard(challenge.metaTag)} className="absolute top-2 right-2 p-1 rounded bg-slate-700 text-white">
                        <HugeiconsIcon icon={Copy01Icon} className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <label className="text-xs text-muted">Name</label>
                        <code className="block bg-slate-900 text-emerald-400 text-xs p-2 rounded-lg">{challenge.dnsName}</code>
                      </div>
                      <div className="relative">
                        <label className="text-xs text-muted">Value</label>
                        <code className="block bg-slate-900 text-emerald-400 text-xs p-2 rounded-lg break-all">{challenge.dnsValue}</code>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => verifyMutation.mutate()}
                    disabled={verifyMutation.isPending}
                    className="w-full bg-black hover:bg-neutral-800 text-white py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  >
                    {verifyMutation.isPending ? 'Verifying…' : 'Verify'}
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep(3)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl text-sm font-bold transition-colors">
                  Back
                </button>
                <button
                  onClick={() => {
                    if (selectedDomain?.verified) setStep(3)
                    else toast.error('Domain must be verified first')
                  }}
                  disabled={!selectedDomain?.verified}
                  className="flex-1 bg-black hover:bg-neutral-800 text-white py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Point your domain to our edge proxy so traffic can be routed through VeriClick.
              </p>

              <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                <p className="text-sm font-bold text-slate-900">CNAME Setup</p>
                <p className="text-xs text-muted">
                  Add a CNAME record in your DNS settings for <strong>{selectedDomain?.domain}</strong>:
                </p>
                <div className="bg-slate-900 text-emerald-400 text-xs font-mono p-3 rounded-lg space-y-1">
                  <div><span className="text-muted">Host:</span> {selectedDomain?.domain?.split('.')[0]}</div>
                  <div><span className="text-muted">Value:</span> edge.vericlick.cc</div>
                  <div><span className="text-muted">TTL:</span> 300 (or Auto)</div>
                </div>
                <p className="text-xs text-muted">
                  This tells DNS to route traffic for your domain to our edge proxy.
                  Changes may take a few minutes to propagate.
                </p>
              </div>

              {cnameResult && (
                <div className={`p-3 rounded-xl text-xs font-bold ${cnameResult.cname_ok
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                  {cnameResult.detail}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl text-sm font-bold transition-colors">
                  Back
                </button>
                <button
                  onClick={() => cnameVerifyMutation.mutate()}
                  disabled={cnameVerifyMutation.isPending}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {cnameVerifyMutation.isPending ? 'Checking…' : 'Verify CNAME'}
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 bg-black hover:bg-neutral-800 text-white py-3 rounded-xl text-sm font-bold transition-all"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted">Domain</span><span className="font-bold">{selectedDomain?.domain}</span></div>
                {slug && <div className="flex justify-between"><span className="text-muted">Path</span><span className="font-bold font-mono">/{slug}</span></div>}
                <div className="flex justify-between"><span className="text-muted">Destination</span><span className="font-bold truncate ml-4">{destinationUrl}</span></div>
                <div className="flex justify-between"><span className="text-muted">Bot handling</span><span className="font-bold capitalize">{botAction}</span></div>
                <div className="flex justify-between"><span className="text-muted">Valid for</span><span className="font-bold">7 days</span></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl text-sm font-bold transition-colors">
                  Back
                </button>
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending}
                  className="flex-1 bg-black hover:bg-neutral-800 text-white py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating…' : 'Activate Redirect'}
                </button>
              </div>
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

export default function RedirectsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showWizard, setShowWizard] = useState(false)

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchWorkspace,
  })
  const hasPlan = !!workspace?.planName

  const { data: routes, isLoading } = useQuery({
    queryKey: ['redirect-routes'],
    queryFn: fetchRedirectRoutes,
  })

  const renewMutation = useMutation({
    mutationFn: renewRedirectRoute,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redirect-routes'] })
      toast.success('Renewed for 7 more days')
    },
    onError: (err) => toast.error(parseApiError(err) || 'Failed to renew'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteRedirectRoute,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redirect-routes'] })
      toast.success('Redirect deleted')
    },
    onError: (err) => toast.error(parseApiError(err) || 'Failed to delete'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => updateRedirectRoute(id, { isActive: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redirect-routes'] })
      toast.success('Redirect deactivated')
    },
  })

  if (isLoading) return <DashboardSkeleton />

  const activeRoutes = routes ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Smart Redirects</h1>
          <p className="text-sm text-muted mt-1">
            Redirect visitors through your custom domains. Each domain gets 1 redirect with 7-day validity.
          </p>
        </div>
        <button
          onClick={() => hasPlan ? setShowWizard(true) : navigate('/app/billing')}
          className="bg-black hover:bg-neutral-800 text-white px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
          title={hasPlan ? 'Create a new redirect' : 'Choose a plan to get started'}
        >
          <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
          {hasPlan ? 'Create Redirect' : 'Choose a plan'}
        </button>
      </div>

      {activeRoutes.length > 0 ? (
        <div className="grid gap-4">
          {activeRoutes.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              onRenew={() => renewMutation.mutate(route.id)}
              onDeactivate={() => {
                if (window.confirm('Deactivate this redirect?')) deactivateMutation.mutate(route.id)
              }}
              onDelete={() => {
                if (window.confirm(`Delete redirect for ${route.domain.domain}?`)) deleteMutation.mutate(route.id)
              }}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-neutral-200 p-8 text-center shadow-sm">
          <HugeiconsIcon icon={LinkSquare02Icon} className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
          <p className="text-sm text-muted mb-1">No redirects yet</p>
          <p className="text-xs text-muted mb-4">
            Create a redirect to send visitors through your custom domain.
          </p>
          <button
            onClick={() => hasPlan ? setShowWizard(true) : navigate('/app/billing')}
            className="bg-black hover:bg-neutral-800 text-white px-5 py-3 rounded-xl text-sm font-bold transition-all"
          >
            {hasPlan ? 'Create your first redirect' : 'Choose a plan'}
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
          <HugeiconsIcon icon={Clock02Icon} className="w-4 h-4 text-muted" />
          How redirects work
        </h3>
        <ul className="text-sm text-muted space-y-2 leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="text-xs mt-1.5">1.</span>
            Point your domain (e.g. app.yourdomain.com) to our edge proxy via CNAME.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-xs mt-1.5">2.</span>
            Visitors are redirected to your destination. Bots are handled per your settings.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-xs mt-1.5">3.</span>
            Redirects expire after 7 days. You'll get an email reminder to renew.
          </li>
        </ul>
      </div>

      {showWizard && <CreateWizard onClose={() => setShowWizard(false)} />}
    </div>
  )
}
