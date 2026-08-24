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
  verifyRedirectDomainCname, fetchWorkspace,
  lookupNameservers,
} from '@/api/workspace'
import type { CnameCheckResult, NsLookupResult } from '@/api/workspace'
import type { RedirectRoute } from '@/types'
import { parseApiError } from '@/lib/errors'
import { DashboardSkeleton } from '@/components/ui/DashboardSkeleton'
import { PERIOD_DAYS } from '@/components/shared/BillingPeriodToggle'

function daysUntil(dateStr: string | null): number {
  if (!dateStr) return 0
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000))
}

const SLUG_MAX = 200
// Backend accepts [a-zA-Z0-9_-]; drop look-alike characters so a generated
// slug survives being read aloud or copied off a screen.
const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** A full-length random pool. The slider slices it, so dragging grows and
 *  shrinks one stable string instead of rerolling on every pixel. */
function makeSlugPool(): string {
  const bytes = new Uint8Array(SLUG_MAX)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join('')
}

function RouteCard({ route, periodDays, onRenew, onToggleActive, onDelete }: {
  route: RedirectRoute
  periodDays: number
  onRenew: () => void
  onToggleActive: () => void
  onDelete: () => void
}) {
  const days = daysUntil(route.expiresAt)
  const isExpired = route.expiresAt && new Date(route.expiresAt) < new Date()
  const isWarning = days <= 3 && days > 0 && !isExpired

  // The whole point of the link is to be shared, so make the full URL the thing
  // you grab — not something the user reassembles from domain + slug by eye.
  const shortlinkUrl = route.useShortlink && route.slug
    ? `https://vericlick.cc/${route.slug}`
    : null
  const fullUrl = shortlinkUrl || `https://${route.domain.domain}${route.slug ? `/${route.slug}` : ''}`
  const live = route.isActive && !isExpired

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

      <div className={`flex items-center gap-2 mb-4 p-2.5 rounded-xl border ${
        live ? 'bg-slate-50 border-neutral-200' : 'bg-neutral-100 border-neutral-200'
      }`}>
        <code
          className={`flex-1 min-w-0 truncate text-xs font-mono ${
            live ? 'text-slate-800' : 'text-neutral-400 line-through'
          }`}
          title={fullUrl}
        >
          {fullUrl}
        </code>
        <button
          onClick={() => {
            if (!live) {
              toast.error(
                isExpired
                  ? 'This link has expired — renew it before sharing'
                  : 'This link is deactivated — activate it before sharing',
              )
              return
            }
            navigator.clipboard.writeText(fullUrl)
            toast.success('Link copied')
          }}
          className="shrink-0 p-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-100 text-slate-600 hover:text-slate-900 transition-colors"
          title="Copy link"
          aria-label="Copy link"
        >
          <HugeiconsIcon icon={Copy01Icon} className="w-3.5 h-3.5" />
        </button>
        <a
          href={fullUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            // Opening a dead link just shows the neutral page and looks broken.
            if (!live) {
              e.preventDefault()
              toast.error(isExpired ? 'This link has expired — renew it first' : 'This link is deactivated')
            }
          }}
          className={`shrink-0 p-1.5 rounded-lg border transition-colors ${
            live
              ? 'bg-white border-neutral-200 hover:bg-neutral-100 text-slate-600 hover:text-slate-900'
              : 'bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed'
          }`}
          title={live ? 'Open link in a new tab' : 'Link is not live'}
          aria-label="Open link"
        >
          <HugeiconsIcon icon={LinkSquare02Icon} className="w-3.5 h-3.5" />
        </a>
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
          Renew {periodDays} days
        </button>
        <button
          onClick={onToggleActive}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors"
        >
          {route.isActive ? 'Deactivate' : 'Activate'}
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

/**
 * Three steps, in the order the work actually happens:
 *
 *   1. Link address — pick the subdomain the link will live on
 *   2. Point DNS    — add the CNAME; checking it also verifies the domain
 *   3. Destination  — where it sends people, then the link goes live
 *
 * Address first because it is the step with a waiting period: the DNS clock
 * starts while the user is still deciding where the link should point. The
 * previous order asked for the destination first, so the user finished all the
 * thinking and THEN discovered they had to wait for propagation.
 */
function CreateWizard({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(1)
  const [useShortlink, setUseShortlink] = useState<boolean | null>(null) // null = not chosen yet
  const [destinationUrl, setDestinationUrl] = useState('')
  const [botAction, setBotAction] = useState('honeypot')
  const [fallbackUrl, setFallbackUrl] = useState('')
  const [domainId, setDomainId] = useState('')
  const [slug, setSlug] = useState('')
  const [slugPool, setSlugPool] = useState(makeSlugPool)
  const [newRedirectDomain, setNewRedirectDomain] = useState('')
  const [subPrefix, setSubPrefix] = useState('go')
  const [subRoot, setSubRoot] = useState('')
  const [manualDomain, setManualDomain] = useState(false)
  const [cnameResult, setCnameResult] = useState<CnameCheckResult | null>(null)

  const { data: redirectDomains } = useQuery({
    queryKey: ['redirect-domains'],
    queryFn: fetchRedirectDomains,
  })

  const addDomainMutation = useMutation({
    mutationFn: addRedirectDomain,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['redirect-domains'] })
      setDomainId(data.id)
      setNewRedirectDomain('')
      toast.success(`${data.domain} added`)
      setStep(3) // DNS step
    },
    onError: (err) => toast.error(parseApiError(err) || 'Failed to add domain'),
  })

  const cnameVerifyMutation = useMutation({
    mutationFn: () => verifyRedirectDomainCname(domainId),
    onSuccess: (data) => {
      setCnameResult(data)
      queryClient.invalidateQueries({ queryKey: ['redirect-domains'] })
      if (data.cnameOk) {
        toast.success('DNS is pointing at us — address verified')
        setStep(4) // destination step for custom domain
      }
    },
    onError: () => {
      setCnameResult({ cnameOk: false, target: null, detail: 'DNS lookup failed. Try again in a few minutes.' })
    },
  })

  const createMutation = useMutation({
    mutationFn: () => createRedirectRoute(
      useShortlink
        ? { slug, destinationUrl, botAction, useShortlink: true, fallbackUrl: botAction === 'redirect' ? fallbackUrl : undefined }
        : { domainId, slug, destinationUrl, botAction, fallbackUrl: botAction === 'redirect' ? fallbackUrl : undefined }
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redirect-routes'] })
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      toast.success('Your link is live')
      onClose()
    },
    onError: (err) => toast.error(parseApiError(err) || 'Failed to create redirect'),
  })

  const selectedDomain = redirectDomains?.find((d) => d.id === domainId)

  const { data: nsInfo } = useQuery({
    queryKey: ['ns-lookup', selectedDomain?.domain],
    queryFn: () => lookupNameservers(selectedDomain!.domain),
    enabled: !!selectedDomain?.domain && step === 3 && !useShortlink,
    staleTime: 300_000,
  })

  // A link must live on a subdomain: an apex cannot hold a CNAME, and pointing a
  // protected site's apex at the edge would take the whole site off its host.
  const rootDomains = Array.from(new Set(
    (redirectDomains ?? [])
      .filter((d) => d.verified)
      .map((d) => {
        const parts = d.domain.split('.')
        return parts.length > 2 ? parts.slice(1).join('.') : d.domain
      }),
  ))
  const effectiveRoot = subRoot || rootDomains[0] || ''
  const builtDomain = subPrefix && effectiveRoot ? `${subPrefix}.${effectiveRoot}` : ''
  const usingBuilder = rootDomains.length > 0 && !manualDomain
  const domainToAdd = usingBuilder ? builtDomain : newRedirectDomain.trim().toLowerCase()

  // Reusable addresses: already verified and not already carrying a link.
  const readyDomains = (redirectDomains ?? []).filter((d) => d.verified && d.purpose === 'redirect')

  const canCreate = !!destinationUrl && (botAction !== 'redirect' || !!fallbackUrl)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied')
  }

  // Dynamic step labels depending on shortlink vs custom domain
  const STEP_LABELS = useShortlink === null
    ? ['Link type']
    : useShortlink
      ? ['Link type', 'Destination']
      : ['Link type', 'Link address', 'Point DNS', 'Destination']

  // Current step number for the progress bar (remapped for shortlink path)
  const displayStep = useShortlink === null
    ? 1
    : useShortlink
      ? step  // step 1 = type, step 2 = destination
      : step  // step 1 = type, step 2 = address, step 3 = DNS, step 4 = destination

  // Back button target
  const goBack = () => {
    if (useShortlink === null) return // can't go back from step 1
    if (useShortlink) {
      if (step === 2) setStep(1)
    } else {
      if (step === 2) setStep(1)
      else if (step === 3) setStep(2)
      else if (step === 4) setStep(3)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Create a redirect link</h2>

          <div className="flex items-center gap-1.5 mb-5">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1
              const done = n < displayStep
              const active = n === displayStep
              return (
                <div key={label} className="flex-1 min-w-0">
                  <div className={`h-1.5 rounded-full transition-all ${done || active ? 'bg-black' : 'bg-neutral-200'}`} />
                  <span className={`block text-[11px] font-bold mt-1.5 truncate ${
                    active ? 'text-black' : done ? 'text-muted' : 'text-neutral-400'
                  }`}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* ---- Step 1: choose link type ---- */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Choose how your link works. You can always create the other type later.
              </p>

              <button
                onClick={() => { setUseShortlink(true); setStep(2) }}
                className="w-full p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl text-left hover:border-emerald-500 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-emerald-200 transition-colors">
                    <HugeiconsIcon icon={LinkSquare02Icon} className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Quick shortlink</p>
                    <p className="text-xs text-emerald-700">vericlick.cc/your-slug — ready immediately, no DNS setup</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => { setUseShortlink(false); setStep(2) }}
                className="w-full p-4 bg-white border border-neutral-200 rounded-xl text-left hover:border-neutral-400 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-slate-200 transition-colors">
                    <HugeiconsIcon icon={LinkSquare02Icon} className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Custom domain</p>
                    <p className="text-xs text-muted">Use your own subdomain like go.yoursite.com</p>
                  </div>
                </div>
              </button>

              {readyDomains.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-xs text-muted mb-2">
                    <span className="flex-1 h-px bg-neutral-200" />
                    or use an existing domain
                    <span className="flex-1 h-px bg-neutral-200" />
                  </div>
                  <select
                    value={domainId}
                    onChange={(e) => {
                      if (e.target.value) {
                        setDomainId(e.target.value)
                        setUseShortlink(false)
                        setStep(4) // skip to destination (already verified)
                      }
                    }}
                    className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black"
                  >
                    <option value="">Choose an address…</option>
                    {readyDomains.map((d) => (
                      <option key={d.id} value={d.id}>{d.domain}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* ---- DNS step (custom domain only) ---- */}
          {!useShortlink && step === 3 && selectedDomain && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                One DNS record connects <strong>{selectedDomain.domain}</strong> to VeriClick.
              </p>

              {/* Provider-aware hint */}
              {nsInfo && nsInfo.nameservers.length > 0 && (
                <div className={`p-4 rounded-xl border text-xs leading-relaxed ${
                  nsInfo.provider
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-50 border-neutral-200 text-slate-700'
                }`}>
                  {nsInfo.provider ? (
                    <>
                      <p className="font-bold text-sm mb-1">Your DNS is managed by {nsInfo.provider}</p>
                      <p className="text-xs mb-2">
                        You bought your domain elsewhere, but you pointed it at <strong>{nsInfo.provider}</strong>'s
                        nameservers — so you need to add this CNAME record in your {nsInfo.provider} account, not your registrar.
                      </p>
                      {nsInfo.dashboard_url && (
                        <a
                          href={nsInfo.dashboard_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2"
                        >
                          Open {nsInfo.dashboard_url.replace('https://', '').split('/')[0]} &rarr;
                        </a>
                      )}
                    </>
                  ) : (
                    <p>
                      <span className="font-bold">Nameservers:</span> {nsInfo.nameservers.join(', ')}
                      <br />
                      Add the CNAME record below in the DNS panel of whoever controls these nameservers.
                    </p>
                  )}
                </div>
              )}

              <div className="p-4 bg-slate-50 border border-neutral-200 rounded-xl space-y-3">
                <p className="text-sm font-bold text-slate-900">Add this record</p>
                <div className="bg-slate-900 text-emerald-400 text-xs font-mono p-3 rounded-lg space-y-1 overflow-x-auto">
                  <div><span className="text-muted">Type: </span>CNAME</div>
                  <div className="flex items-center gap-2">
                    <span><span className="text-muted">Name: </span>{selectedDomain.domain.split('.')[0]}</span>
                    <button onClick={() => copyToClipboard(selectedDomain.domain.split('.')[0])} className="p-0.5 rounded bg-slate-700 text-white shrink-0">
                      <HugeiconsIcon icon={Copy01Icon} className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span><span className="text-muted">Value:</span> edge.vericlick.cc</span>
                    <button onClick={() => copyToClipboard('edge.vericlick.cc')} className="p-0.5 rounded bg-slate-700 text-white shrink-0">
                      <HugeiconsIcon icon={Copy01Icon} className="w-3 h-3" />
                    </button>
                  </div>
                  <div><span className="text-muted">TTL:  </span>Auto</div>
                </div>
              </div>

              <p className="text-xs text-muted">
                Only <span className="font-mono">{selectedDomain.domain}</span> changes. Your main
                site and email keep working exactly as they do now. DNS usually updates within
                a few minutes.
              </p>

              {cnameResult && !cnameResult.cnameOk && (
                <div className="p-3 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
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
                  className="flex-1 bg-black hover:bg-neutral-800 text-white py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                >
                  {cnameVerifyMutation.isPending ? 'Checking DNS…' : "I've added it — check DNS"}
                </button>
              </div>
            </div>
          )}

          {/* ---- Step 2: custom domain address selection ---- */}
          {!useShortlink && step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Your link needs its own address — a subdomain like{' '}
                <span className="font-mono text-slate-700">go.yoursite.com</span>. It can't be
                your main domain, because that has to keep pointing at your website.
              </p>

              {rootDomains.length === 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  You don't have a verified domain yet. Add and verify one on the Domains
                  page first — then you can build a link address on it here.
                </div>
              )}

              {usingBuilder ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={subPrefix}
                      onChange={(e) => setSubPrefix(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase().slice(0, 63))}
                      aria-label="Subdomain prefix"
                      className="w-24 bg-slate-50 border border-neutral-200 rounded-xl px-3 py-3 text-sm text-center focus:outline-none focus:border-black font-mono"
                    />
                    <span className="self-center text-sm text-muted font-mono">.</span>
                    <select
                      value={effectiveRoot}
                      onChange={(e) => setSubRoot(e.target.value)}
                      aria-label="Root domain"
                      className="flex-1 min-w-0 bg-slate-50 border border-neutral-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-black"
                    >
                      {rootDomains.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {['go', 't', 'link', 'r'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSubPrefix(p)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-colors ${
                          subPrefix === p ? 'bg-black text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        {p}.
                      </button>
                    ))}
                  </div>

                  {builtDomain && (
                    <div className="p-3 bg-slate-50 border border-neutral-200 rounded-xl">
                      <p className="text-xs text-muted mb-0.5">Your link will live at</p>
                      <p className="text-sm font-mono text-slate-900 break-all">{builtDomain}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => setStep(1)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl text-sm font-bold transition-colors">
                      Back
                    </button>
                    <button
                      onClick={() => domainToAdd && addDomainMutation.mutate(domainToAdd)}
                      disabled={!domainToAdd || addDomainMutation.isPending}
                      className="flex-1 bg-black hover:bg-neutral-800 text-white py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    >
                      {addDomainMutation.isPending ? 'Adding…' : 'Continue'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualDomain(true)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl text-sm font-bold transition-colors whitespace-nowrap"
                    >
                      Different domain
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRedirectDomain}
                      onChange={(e) => setNewRedirectDomain(e.target.value)}
                      placeholder="go.yourdomain.com"
                      className="flex-1 min-w-0 bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black"
                    />
                    <button
                      onClick={() => domainToAdd && addDomainMutation.mutate(domainToAdd)}
                      disabled={!domainToAdd || addDomainMutation.isPending}
                      className="bg-black hover:bg-neutral-800 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    >
                      {addDomainMutation.isPending ? 'Adding…' : 'Continue'}
                    </button>
                  </div>
                  <p className="text-xs text-muted">
                    Use a subdomain such as <span className="font-mono">go.yourdomain.com</span> —
                    an apex domain can't hold the record this needs.
                  </p>
                  {rootDomains.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setManualDomain(false)}
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 underline"
                    >
                      Back to my domains
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---- Destination step (both paths) ---- */}
          {((useShortlink && step === 2) || (!useShortlink && step === 4)) && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-0.5">Your link</p>
                <p className="text-sm font-mono text-emerald-900 break-all">
                  {useShortlink
                    ? `vericlick.cc${slug ? `/${slug}` : ''}`
                    : `${selectedDomain?.domain || ''}${slug ? `/${slug}` : ''}`
                  }
                </p>
                {useShortlink && (
                  <p className="text-xs text-emerald-600 mt-1">
                    No DNS setup needed — ready to share immediately
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900 block mb-1">Where should it send people?</label>
                <input
                  type="url"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  placeholder="https://example.com/my-offer"
                  autoFocus
                  className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900 block mb-1">Link ending (optional)</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, SLUG_MAX)
                    setSlug(val)
                    setSlugPool(val + makeSlugPool().slice(val.length))
                  }}
                  placeholder="offer"
                  className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black font-mono"
                />
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="range"
                    min={0}
                    max={SLUG_MAX}
                    value={slug.length}
                    onChange={(e) => setSlug(slugPool.slice(0, Number(e.target.value)))}
                    className="flex-1 accent-black h-1.5"
                    aria-label="Generated link ending length"
                  />
                  <span className="text-xs text-muted font-mono w-14 text-right">{slug.length}/{SLUG_MAX}</span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-2">
                  <p className="text-xs text-muted">
                    Drag for a random ending, or type your own. Longer is harder to guess.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const pool = makeSlugPool()
                      setSlugPool(pool)
                      setSlug(pool.slice(0, slug.length || 8))
                    }}
                    className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                  >
                    Regenerate
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900 block mb-1">What should bots get instead?</label>
                <p className="text-xs text-muted mb-2">
                  Real visitors always go to your destination. This is only for traffic we flag as automated.
                </p>
                {[
                  { value: 'honeypot', label: 'A decoy page', hint: 'Looks real, wastes their time' },
                  { value: 'block', label: 'Nothing — 404', hint: 'Looks like the link does not exist' },
                  { value: 'neutral', label: 'A blank page', hint: 'Quietly gives them nothing' },
                  { value: 'redirect', label: 'A different URL', hint: 'Send them somewhere of your choosing' },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-start gap-2 py-1.5 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="botAction"
                      value={opt.value}
                      checked={botAction === opt.value}
                      onChange={(e) => setBotAction(e.target.value)}
                      className="accent-black mt-0.5"
                    />
                    <span>
                      <span className="font-medium">{opt.label}</span>
                      <span className="block text-xs text-muted">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>

              {botAction === 'redirect' && (
                <div>
                  <label className="text-sm font-bold text-slate-900 block mb-1">Send bots to</label>
                  <input
                    type="url"
                    value={fallbackUrl}
                    onChange={(e) => setFallbackUrl(e.target.value)}
                    placeholder="https://example.com/blocked"
                    className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={goBack} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl text-sm font-bold transition-colors">
                  Back
                </button>
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={!canCreate || createMutation.isPending}
                  className="flex-1 bg-black hover:bg-neutral-800 text-white py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating…' : 'Create my link'}
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
  // A link lives as long as the plan period paying for it.
  const periodDays = PERIOD_DAYS[workspace?.planBillingPeriod ?? 'weekly']

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

  // One toggle rather than a one-way switch: a deactivated link had no way back
  // on, because the only button still said "Deactivate".
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateRedirectRoute(id, { isActive }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['redirect-routes'] })
      toast.success(variables.isActive ? 'Link is live again' : 'Link deactivated')
    },
    onError: (err) => toast.error(parseApiError(err) || 'Could not change the link'),
  })

  if (isLoading) return <DashboardSkeleton />

  const activeRoutes = routes ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Smart Redirects</h1>
          <p className="text-sm text-muted mt-1">
            Redirect visitors through your custom domains. Each domain gets one link,
            valid for as long as your current plan period.
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
              periodDays={periodDays}
              onRenew={() => renewMutation.mutate(route.id)}
              onToggleActive={() => {
                if (route.isActive) {
                  if (!window.confirm('Deactivate this link? Visitors will stop being forwarded.')) return
                }
                toggleActiveMutation.mutate({ id: route.id, isActive: !route.isActive })
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
            Links last as long as your plan period ({periodDays} days on your current plan).
            You'll get an email reminder before one expires.
          </li>
        </ul>
      </div>

      {showWizard && <CreateWizard onClose={() => setShowWizard(false)} />}
    </div>
  )
}
