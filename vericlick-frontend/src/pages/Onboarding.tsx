import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Shield02Icon,
  LinkSquare02Icon,
  ShieldIcon,
  DashboardSquare01Icon,
  ArrowLeft02Icon,
  Copy01Icon,
  CheckmarkCircle02Icon,
} from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { completeOnboarding, fetchSnippet, updateShieldConfig } from '@/api/workspace'
import { parseApiError } from '@/lib/errors'

type OnboardingType = 'shield' | 'redirect'
type ProtectionMode = 'strict' | 'balanced' | 'monitor'

const TOTAL_STEPS = 4

export default function Onboarding() {
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [type, setType] = useState<OnboardingType | null>(null)
  const [domain, setDomain] = useState('')
  const [snippetData, setSnippetData] = useState<{ snippet: string; apiKey: string; apiBase: string } | null>(null)
  const [protectionMode, setProtectionMode] = useState<ProtectionMode>('balanced')
  const [completed, setCompleted] = useState(false)
  const [planNotice, setPlanNotice] = useState(false)

  const onboardingMutation = useMutation({
    mutationFn: ({ type, domain }: { type: OnboardingType; domain: string }) => completeOnboarding(type, domain),
    onSuccess: async (_data, variables) => {
      if (variables.type === 'shield') {
        try {
          const snippet = await fetchSnippet(variables.domain)
          setSnippetData(snippet)
        } catch {
          // proceed even if snippet fetch fails
        }
      }
      setStep(3)
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 403) {
        setPlanNotice(true)
        return
      }
      toast.error(parseApiError(err) || 'Something went wrong. Please try again.')
    },
  })

  const snippetMutation = useMutation({
    mutationFn: async () => {
      const snippet = await fetchSnippet(domain)
      setSnippetData(snippet)
      return snippet
    },
    onError: () => {
      toast.error('Could not fetch snippet')
    },
  })

  const shieldConfigMutation = useMutation({
    mutationFn: async (mode: ProtectionMode) => {
      await updateShieldConfig({
        protectionMode: mode,
        botAction: mode === 'monitor' ? 'log' : 'block',
        rateLimitPerHour: 100,
        protectedPaths: [],
        blockedPaths: [],
      })
    },
    onSuccess: () => {
      setCompleted(true)
    },
    onError: () => {
      toast.error('Failed to save protection level')
    },
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const canGoBack = step > 1 && !completed

  const goBack = () => {
    if (step === 3 && type === 'shield') {
      setStep(2)
    } else if (step === 3 && type === 'redirect') {
      setStep(2)
    } else if (step === 2) {
      setStep(1)
      setType(null)
      setDomain('')
    } else if (step === 4) {
      setStep(3)
    }
  }

  const handleTypeSelect = (selected: OnboardingType) => {
    setType(selected)
    setStep(2)
  }

  const handleDomainSubmit = () => {
    const trimmed = domain.trim()
    if (!trimmed) return
    if (onboardingMutation.isPending) return
    onboardingMutation.mutate({ type: type!, domain: trimmed })
  }

  const handleProtectionSave = () => {
    if (shieldConfigMutation.isPending) return
    shieldConfigMutation.mutate(protectionMode)
  }

  const protectionModes: {
    value: ProtectionMode
    label: string
    description: string
    badge: string
    badgeColor: string
    icon: typeof ShieldIcon
  }[] = [
    { value: 'balanced', label: 'Balanced', description: 'Silently blocks confirmed bots. Human visitors notice nothing.', badge: 'Recommended', badgeColor: 'bg-emerald-100 text-emerald-700', icon: ShieldIcon },
    { value: 'strict', label: 'Strict', description: 'Challenges suspicious traffic including VPNs and data centers.', badge: 'Aggressive', badgeColor: 'bg-amber-100 text-amber-700', icon: Shield02Icon },
    { value: 'monitor', label: 'Monitor Only', description: 'Logs bot traffic without blocking. Great for learning.', badge: 'Passive', badgeColor: 'bg-blue-100 text-blue-700', icon: DashboardSquare01Icon },
  ]

  const progressPercent = (step / TOTAL_STEPS) * 100

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-neutral-500">
              Step {completed ? TOTAL_STEPS : step} of {TOTAL_STEPS}
            </span>
            <span className="text-xs font-bold text-neutral-500">{Math.round(progressPercent)}%</span>
          </div>
          <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-black rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-8">
          {/* Back button */}
          {canGoBack && (
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 text-sm font-bold text-neutral-500 hover:text-black transition-colors mb-6"
            >
              <HugeiconsIcon icon={ArrowLeft02Icon} className="w-4 h-4" />
              Back
            </button>
          )}

          {/* Step 1: Choose type */}
          {step === 1 && !completed && (
            <div>
              <h1 className="text-xl font-bold text-slate-900 mb-1">What do you want to protect?</h1>
              <p className="text-sm text-neutral-500 mb-6">Choose the type of protection you need.</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleTypeSelect('shield')}
                  className="p-5 rounded-xl border border-neutral-200 hover:border-black hover:bg-neutral-50 text-left transition-all"
                >
                  <HugeiconsIcon icon={Shield02Icon} className="w-8 h-8 text-slate-900 mb-3" />
                  <div className="text-sm font-bold text-slate-900 mb-1">My Website</div>
                  <div className="text-xs text-neutral-500 leading-relaxed">
                    Add a script to your website to block bots and suspicious traffic
                  </div>
                </button>
                <button
                  onClick={() => handleTypeSelect('redirect')}
                  className="p-5 rounded-xl border border-neutral-200 hover:border-black hover:bg-neutral-50 text-left transition-all"
                >
                  <HugeiconsIcon icon={LinkSquare02Icon} className="w-8 h-8 text-slate-900 mb-3" />
                  <div className="text-sm font-bold text-slate-900 mb-1">A Short Link</div>
                  <div className="text-xs text-neutral-500 leading-relaxed">
                    Create a smart redirect link that filters bot traffic before forwarding
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Domain input */}
          {step === 2 && !completed && (
            <div>
              <h1 className="text-xl font-bold text-slate-900 mb-1">
                {type === 'shield' ? "What's your website domain?" : 'What domain will you use for redirects?'}
              </h1>
              <p className="text-sm text-neutral-500 mb-6">
                {type === 'shield'
                  ? 'Enter the domain you want to protect (e.g., example.com)'
                  : 'This is the domain your short links will use'}
              </p>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDomainSubmit()}
                  placeholder={type === 'shield' ? 'example.com' : 't.example.com'}
                  className="flex-1 bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
                  autoFocus
                />
                <button
                  onClick={handleDomainSubmit}
                  disabled={!domain.trim() || onboardingMutation.isPending}
                  className="bg-black hover:bg-neutral-800 text-white px-5 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                >
                  {onboardingMutation.isPending ? 'Setting up…' : 'Continue'}
                </button>
              </div>
              {snippetMutation.isError && (
                <p className="text-xs text-red-500">Failed to fetch snippet. Try again.</p>
              )}
              {planNotice && (
                <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-sm text-blue-700 mb-3">
                    A plan is required to register domains. Pick a plan to get started — it only takes a minute.
                  </p>
                  <button
                    onClick={() => navigate('/app/billing')}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                  >
                    Choose a Plan
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Setup instructions */}
          {step === 3 && !completed && (
            <div>
              <h1 className="text-xl font-bold text-slate-900 mb-1">Setup instructions</h1>
              <p className="text-sm text-neutral-500 mb-6">
                {type === 'shield'
                  ? 'Paste this script tag in your website.'
                  : 'Add this CNAME record in your domain\'s DNS settings.'}
              </p>

              {type === 'shield' && snippetData && (
                <div className="mb-6">
                  <p className="text-sm text-neutral-600 mb-3">
                    Your domain is registered. Paste this script in your website's{' '}
                    <code className="bg-neutral-100 px-1.5 py-0.5 rounded text-xs font-mono">&lt;head&gt;</code>:
                  </p>
                  <div className="relative">
                    <code className="block bg-slate-900 text-emerald-400 text-xs font-mono p-4 rounded-xl break-all pr-12 leading-relaxed">
                      {`<script src="${snippetData.apiBase}/shield.js" data-api-key="${snippetData.apiKey}" defer></script>`}
                    </code>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `<script src="${snippetData.apiBase}/shield.js" data-api-key="${snippetData.apiKey}" defer></script>`
                        )
                      }
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                      title="Copy snippet"
                    >
                      <HugeiconsIcon icon={Copy01Icon} className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-neutral-500 mt-3">
                    That's it — VeriClick will verify your domain automatically when the script first loads.
                  </p>
                </div>
              )}

              {type === 'shield' && !snippetData && (
                <div className="mb-6">
                  <p className="text-sm text-neutral-500 mb-3">Loading snippet…</p>
                  <button
                    onClick={() => snippetMutation.mutate()}
                    disabled={snippetMutation.isPending}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                  >
                    {snippetMutation.isPending ? 'Loading…' : 'Retry'}
                  </button>
                </div>
              )}

              {type === 'redirect' && (
                <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                  <p className="text-sm font-bold text-slate-900">CNAME Setup</p>
                  <p className="text-xs text-neutral-500">
                    Add a CNAME record in your DNS settings:
                  </p>
                  <div className="bg-slate-900 text-emerald-400 text-xs font-mono p-3 rounded-lg space-y-1">
                    <div>
                      <span className="text-neutral-400">Type:</span> CNAME
                    </div>
                    <div>
                      <span className="text-neutral-400">Host:</span>{' '}
                      {domain.split('.')[0] || 't'}
                    </div>
                    <div>
                      <span className="text-neutral-400">Value:</span> edge.vericlick.cc
                    </div>
                    <div>
                      <span className="text-neutral-400">TTL:</span> Auto
                    </div>
                  </div>
                  <p className="text-xs text-neutral-500">
                    Once the CNAME is active, your redirect domain is ready.
                  </p>
                </div>
              )}

              <button
                onClick={() => setStep(4)}
                className="mt-6 w-full bg-black hover:bg-neutral-800 text-white py-3 rounded-xl text-sm font-bold transition-all"
              >
                Next
              </button>
            </div>
          )}

          {/* Step 4: Protection level */}
          {step === 4 && !completed && (
            <div>
              <h1 className="text-xl font-bold text-slate-900 mb-1">Choose your protection level</h1>
              <p className="text-sm text-neutral-500 mb-6">
                You can change this later in your dashboard settings.
              </p>

              {type === 'shield' && (
                <div className="space-y-3 mb-6">
                  {protectionModes.map(({ value, label, description, badge, badgeColor, icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setProtectionMode(value)}
                      className={`w-full p-4 rounded-xl border text-left transition-all ${
                        protectionMode === value
                          ? 'border-black bg-black/5'
                          : 'border-neutral-200 bg-white hover:border-neutral-400'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <HugeiconsIcon icon={icon} className="w-4 h-4" />
                        <span className="text-sm font-bold text-slate-900">{label}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeColor}`}>
                          {badge}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-500">{description}</span>
                    </button>
                  ))}
                </div>
              )}

              {type === 'redirect' && (
                <p className="text-sm text-neutral-600 mb-6">
                  Your redirect is set up. You can configure bot handling for each redirect in the dashboard.
                </p>
              )}

              <button
                onClick={handleProtectionSave}
                disabled={shieldConfigMutation.isPending}
                className="w-full bg-black hover:bg-neutral-800 text-white py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              >
                {shieldConfigMutation.isPending ? 'Saving…' : 'Finish Setup'}
              </button>
            </div>
          )}

          {/* Completion */}
          {completed && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-8 h-8 text-emerald-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 mb-2">You're all set!</h1>
              <p className="text-sm text-neutral-500 mb-8 max-w-sm mx-auto leading-relaxed">
                Your site is being protected. Visit your dashboard to see traffic analytics.
              </p>
              <button
                onClick={() => navigate('/app/dashboard')}
                className="bg-black hover:bg-neutral-800 text-white px-8 py-3.5 rounded-xl text-sm font-bold transition-all"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>

        {/* Skip / billing link */}
        {!completed && (
          <div className="text-center mt-4">
            <button
              onClick={() => navigate('/app/dashboard')}
              className="text-xs font-bold text-neutral-400 hover:text-black transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
