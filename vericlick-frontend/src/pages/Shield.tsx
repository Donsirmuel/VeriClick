import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { ShieldIcon, Shield02Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { apiClient } from '@/api/client'

type ProtectionMode = 'strict' | 'balanced' | 'monitor'
type BotAction = 'block' | 'honeypot' | 'log'

interface ShieldConfig {
  protectionMode: ProtectionMode
  botAction: BotAction
  rateLimit: number
  protectedPaths: string[]
  blockedPaths: string[]
}

const PROTECTION_MODES: { value: ProtectionMode; label: string; description: string; icon: typeof ShieldIcon }[] = [
  { value: 'strict', label: 'Strict', description: 'Block all detected bots', icon: ShieldIcon },
  { value: 'balanced', label: 'Balanced', description: 'Block obvious bots, challenge suspicious', icon: Shield02Icon },
  { value: 'monitor', label: 'Monitor Only', description: 'Log only, don\'t block', icon: Settings01Icon },
]

const BOT_ACTIONS: { value: BotAction; label: string; description: string }[] = [
  { value: 'block', label: 'Block page', description: 'Show block page to detected bots' },
  { value: 'honeypot', label: 'Honeypot redirect', description: 'Redirect to a neutral page' },
  { value: 'log', label: 'Log only', description: 'Log the visit, let them through' },
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

  const [protectionMode, setProtectionMode] = useState<ProtectionMode>('balanced')
  const [botAction, setBotAction] = useState<BotAction>('block')
  const [rateLimit, setRateLimit] = useState(100)
  const [protectedPathsInput, setProtectedPathsInput] = useState('')
  const [blockedPathsInput, setBlockedPathsInput] = useState('')

  useEffect(() => {
    if (config) {
      setProtectionMode(config.protectionMode)
      setBotAction(config.botAction)
      setRateLimit(config.rateLimit)
      setProtectedPathsInput(config.protectedPaths.join(', '))
      setBlockedPathsInput(config.blockedPaths.join(', '))
    }
  }, [config])

  const saveMutation = useMutation({
    mutationFn: async (payload: ShieldConfig) => {
      const { data } = await apiClient.patch<ShieldConfig>('/workspace/shield-config/', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-shield-config'] })
      toast.success('Anti-bot configuration saved')
    },
    onError: () => {
      toast.error('Failed to save anti-bot configuration')
    },
  })

  const parsePaths = (input: string): string[] =>
    input.split(',').map(p => p.trim()).filter(Boolean)

  const handleSave = () => {
    saveMutation.mutate({
      protectionMode,
      botAction,
      rateLimit,
      protectedPaths: parsePaths(protectedPathsInput),
      blockedPaths: parsePaths(blockedPathsInput),
    })
  }

  const isDirty = config
    ? protectionMode !== config.protectionMode ||
      botAction !== config.botAction ||
      rateLimit !== config.rateLimit ||
      protectedPathsInput !== config.protectedPaths.join(', ') ||
      blockedPathsInput !== config.blockedPaths.join(', ')
    : false

  if (!config) return null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Anti-Bot Configuration</h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Configure how the VeriClick script protects your pages. These settings control bot detection,
          rate limiting, and path filtering for your site.
        </p>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-border p-6 sm:p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Protection Mode</h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Choose how aggressively VeriClick handles detected bot traffic.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PROTECTION_MODES.map(({ value, label, description, icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setProtectionMode(value)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  protectionMode === value
                    ? 'border-black bg-black/5'
                    : 'border-border bg-white hover:border-neutral-400'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <HugeiconsIcon icon={icon} className="w-4 h-4" />
                  <span className="text-sm font-bold text-slate-900">{label}</span>
                </div>
                <span className="text-xs text-muted">{description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-6 sm:p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Bot Action</h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            What happens when a bot is detected on your page.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {BOT_ACTIONS.map(({ value, label, description }) => (
              <button
                key={value}
                type="button"
                onClick={() => setBotAction(value)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  botAction === value
                    ? 'border-black bg-black/5'
                    : 'border-border bg-white hover:border-neutral-400'
                }`}
              >
                <span className="text-sm font-bold text-slate-900 block mb-1">{label}</span>
                <span className="text-xs text-muted">{description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-6 sm:p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Rate Limit</h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Maximum number of requests allowed per time window before triggering bot detection.
          </p>
          <input
            type="number"
            min={10}
            max={10000}
            value={rateLimit}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val)) setRateLimit(Math.min(10000, Math.max(10, val)))
            }}
            className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
          />
        </div>

        <div className="bg-white rounded-2xl border border-border p-6 sm:p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Protected Paths</h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Comma-separated list of paths to protect. Leave empty to protect all paths.
          </p>
          <input
            type="text"
            value={protectedPathsInput}
            onChange={(e) => setProtectedPathsInput(e.target.value)}
            placeholder="/checkout, /account, /api/*"
            className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
          />
        </div>

        <div className="bg-white rounded-2xl border border-border p-6 sm:p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Blocked Paths</h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Comma-separated list of paths that should never be protected by the anti-bot engine.
          </p>
          <input
            type="text"
            value={blockedPathsInput}
            onChange={(e) => setBlockedPathsInput(e.target.value)}
            placeholder="/health, /status, /public/*"
            className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          {isDirty && (
            <span className="text-xs text-muted">Unsaved changes</span>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  )
}
