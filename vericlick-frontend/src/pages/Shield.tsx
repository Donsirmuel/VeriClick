import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { ShieldIcon, Shield02Icon, Settings01Icon, Copy01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { apiClient } from '@/api/client'
import { fetchDomains, fetchSnippet } from '@/api/workspace'

type ProtectionMode = 'strict' | 'balanced' | 'monitor'
type BotAction = 'block' | 'honeypot' | 'log'
type Platform = 'html' | 'wordpress' | 'shopify' | 'wix' | 'squarespace' | 'webflow'

interface ShieldConfig {
  protectionMode: ProtectionMode
  botAction: BotAction
  rateLimit: number
  protectedPaths: string[]
  blockedPaths: string[]
  safeDestination: string
}

const PROTECTION_MODES: {
  value: ProtectionMode
  label: string
  description: string
  icon: typeof ShieldIcon
}[] = [
  { value: 'balanced', label: 'Balanced (Recommended)', description: 'Silently blocks confirmed bots', icon: Shield02Icon },
  { value: 'strict', label: 'Strict', description: 'Challenges suspicious traffic including VPNs', icon: ShieldIcon },
  { value: 'monitor', label: 'Monitor Only', description: 'Logs bot traffic without blocking', icon: Settings01Icon },
]

const BOT_ACTIONS: { value: BotAction; label: string }[] = [
  { value: 'block', label: 'Block (show error page)' },
  { value: 'honeypot', label: 'Redirect to safe page' },
  { value: 'log', label: 'Log only (record but don\'t block)' },
]

const PLATFORMS: { key: Platform; name: string; icon: string; description: string; steps: string[] }[] = [
  { key: 'html', name: 'HTML', icon: '🌐', description: 'Add before the closing </head> tag', steps: ['Open your HTML file', 'Find the <head> section', 'Paste the snippet before the closing </head> tag', 'Save and deploy'] },
  { key: 'wordpress', name: 'WordPress', icon: '📝', description: 'Plugin or theme header', steps: ["Install 'Insert Headers and Footers' by WPCode", 'Go to Code Snippets > Header & Footer', 'Paste the snippet in the Header section', 'Save and activate'] },
  { key: 'shopify', name: 'Shopify', icon: '🛒', description: 'theme.liquid before </head>', steps: ['Go to Online Store > Edit Code', 'Open layout/theme.liquid', 'Find the </head> tag', 'Paste the snippet immediately before it', 'Save'] },
  { key: 'wix', name: 'Wix', icon: '✨', description: 'Custom code via Settings', steps: ['Go to Settings > Custom Code', "Click '+ Add Custom Code'", "Select 'Head' as the placement", 'Paste the snippet', 'Save and publish'] },
  { key: 'squarespace', name: 'Squarespace', icon: '🎨', description: 'Code Injection in site settings', steps: ['Go to Settings > Advanced > Code Injection', "Paste the snippet in the 'Header' field", 'Click Save'] },
  { key: 'webflow', name: 'Webflow', icon: '🖼️', description: 'Site Settings > Custom Code', steps: ['Go to Site Settings > Custom Code', "Paste in the 'Head Code' section", 'Save and publish your site'] },
]

export default function ShieldPage() {
  const queryClient = useQueryClient()

  const { data: config } = useQuery({
    queryKey: ['workspace-shield-config'],
    queryFn: async () => {
      const { data } = await apiClient.get<ShieldConfig>('/workspace/shield-config/')
      return data
    },
  })

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ safeDestination: string; planName: string | null; trialActive: boolean }>('/workspace/')
      return data
    },
  })

  const { data: domains } = useQuery({
    queryKey: ['domains'],
    queryFn: fetchDomains,
  })

  const [selectedDomainId, setSelectedDomainId] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('html')
  const [copiedSnippet, setCopiedSnippet] = useState(false)
  const [protectionMode, setProtectionMode] = useState<ProtectionMode>('balanced')
  const [botAction, setBotAction] = useState<BotAction>('block')
  const [safeDestination, setSafeDestination] = useState('')

  const { data: snippetData, isLoading: snippetLoading } = useQuery({
    queryKey: ['snippet', selectedDomainId],
    queryFn: () => fetchSnippet(selectedDomainId),
    enabled: !!selectedDomainId,
  })

  useEffect(() => {
    if (config) {
      setProtectionMode(config.protectionMode)
      setBotAction(config.botAction)
      setSafeDestination(config.safeDestination || workspace?.safeDestination || '')
    }
  }, [config, workspace])

  const saveMutation = useMutation({
    mutationFn: async (payload: { protectionMode: ProtectionMode; botAction: BotAction; safeDestination: string }) => {
      const { data } = await apiClient.patch('/workspace/shield-config/', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-shield-config'] })
      toast.success('Shield configuration saved')
    },
    onError: () => {
      toast.error('Failed to save shield configuration')
    },
  })

  const handleSave = () => {
    saveMutation.mutate({
      protectionMode,
      botAction,
      safeDestination: botAction === 'honeypot' ? safeDestination : '',
    })
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedSnippet(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopiedSnippet(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const isDirty = config
    ? protectionMode !== config.protectionMode ||
      botAction !== config.botAction ||
      (botAction === 'honeypot' && safeDestination !== (config.safeDestination || workspace?.safeDestination || ''))
    : false

  const currentSnippet = snippetData?.snippet ?? ''
  const currentGuide = PLATFORMS.find((p) => p.key === selectedPlatform)!

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Anti-Bot</h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Install the script, then configure how VeriClick protects your site.
        </p>
      </div>

      <div className="space-y-6">
        {/* Install Script */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-1">1. Install the script</h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Add this snippet to your website's <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">&lt;head&gt;</code> section. It verifies your domain and protects every page.
          </p>

          <div className="mb-4">
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Select your domain</label>
            <select
              value={selectedDomainId}
              onChange={(e) => setSelectedDomainId(e.target.value)}
              className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
            >
              <option value="">Choose a verified domain…</option>
              {domains?.map((d) => (
                <option key={d.id} value={d.id} disabled={!d.verified}>
                  {d.domain} {!d.verified ? '(unverified)' : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedDomainId && (
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Platform</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setSelectedPlatform(p.key)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-xs font-bold transition-all ${
                      selectedPlatform === p.key
                        ? 'bg-black text-white'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base">{p.icon}</span>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedDomainId && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700">Snippet</span>
                {currentSnippet && (
                  <button
                    onClick={() => handleCopy(currentSnippet)}
                    className="bg-white hover:bg-neutral-100 text-slate-700 border border-neutral-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    {copiedSnippet ? (
                      <>
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-3.5 h-3.5 text-green-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <HugeiconsIcon icon={Copy01Icon} className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                )}
              </div>
              {snippetLoading ? (
                <div className="bg-neutral-900 text-neutral-400 text-xs font-mono p-4 rounded-xl text-center">
                  Loading snippet…
                </div>
              ) : (
                <pre className="bg-neutral-900 text-neutral-100 text-xs font-mono p-4 rounded-xl overflow-x-auto">
                  <code>{currentSnippet}</code>
                </pre>
              )}
              <div className="mt-3">
                <h4 className="text-xs font-bold text-slate-700 mb-2">{currentGuide.icon} {currentGuide.name} — Quick Steps</h4>
                <ol className="space-y-1.5">
                  {currentGuide.steps.map((step, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-600">
                      <span className="bg-slate-100 text-slate-500 w-5 h-5 rounded-full flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>

        {/* Protection Level */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-1">2. Protection Level</h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Choose how aggressively VeriClick handles detected bot traffic.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PROTECTION_MODES.map(({ value, label, description, icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setProtectionMode(value)}
                className={`p-5 rounded-xl border text-left transition-all ${
                  protectionMode === value
                    ? 'border-black bg-black/5 ring-1 ring-black/10'
                    : 'border-neutral-200 bg-white hover:border-neutral-400'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <HugeiconsIcon icon={icon} className="w-5 h-5" />
                  <span className="text-sm font-bold text-slate-900">{label}</span>
                </div>
                <span className="text-xs text-muted leading-relaxed">{description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* What happens to bots */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-1">3. What happens to bots</h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Choose the action taken when a bot is detected.
          </p>
          <select
            value={botAction}
            onChange={(e) => setBotAction(e.target.value as BotAction)}
            className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
          >
            {BOT_ACTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Safe destination URL */}
        {botAction === 'honeypot' && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-1">Safe destination URL</h2>
            <p className="text-sm text-muted leading-relaxed mb-4">
              Where bots will be redirected instead of being blocked.
            </p>
            <input
              type="url"
              value={safeDestination}
              onChange={(e) => setSafeDestination(e.target.value)}
              placeholder="https://example.com/safe-page"
              className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
            />
          </div>
        )}

        {/* Save */}
        <div className="flex items-center justify-end gap-3">
          {isDirty && (
            <span className="text-xs text-muted">Unsaved changes</span>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
