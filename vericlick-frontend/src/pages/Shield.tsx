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
  const [protectionMode, setProtectionMode] = useState<ProtectionMode>('balanced')
  const [botAction, setBotAction] = useState<BotAction>('block')
  const [safeDestination, setSafeDestination] = useState('')

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

  const isDirty = config
    ? protectionMode !== config.protectionMode ||
      botAction !== config.botAction ||
      (botAction === 'honeypot' && safeDestination !== (config.safeDestination || workspace?.safeDestination || ''))
    : false

  if (!config) return null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Shield</h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Configure how VeriClick protects your site from bot traffic.
        </p>
      </div>

      <div className="space-y-6">
        {/* Protection Level */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-1">Protection Level</h2>
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
          <h2 className="text-sm font-bold text-slate-900 mb-1">What happens to bots</h2>
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
