import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, Edit01Icon, Cancel01Icon, ShieldIcon, Clock02Icon, Globe02Icon, SmartPhone01Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { fetchIPRules, createIPRule, updateIPRule, deleteIPRule } from '@/api/ip_rules'
import { fetchCountryRules, createCountryRule, updateCountryRule, deleteCountryRule, fetchDevicePolicy, updateDevicePolicy } from '@/api/traffic_rules'
import { fetchWorkspace } from '@/api/workspace'
import { FreeTierBanner } from '@/components/FreeTierBanner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { HelpTooltip } from '@/components/ui/HelpTooltip'
import { ReadMore } from '@/components/ui/ReadMore'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { CountryFlag, countryName, COMMON_COUNTRIES } from '@/components/shared/CountryFlag'
import type { IPRule, IPRuleAction, CountryRule, CountryRuleAction, DeviceClass, DevicePolicy } from '@/types'
import { cn } from '@/lib/utils'

const DEVICE_CLASSES: { value: DeviceClass; label: string; desc: string }[] = [
  { value: 'mobile', label: 'Mobile', desc: 'Phones' },
  { value: 'tablet', label: 'Tablet', desc: 'iPads and tablets' },
  { value: 'desktop', label: 'Desktop', desc: 'Laptops and desktops' },
]

const OS_FAMILIES = ['Windows', 'macOS', 'iOS', 'Android', 'Chrome OS', 'Linux', 'BlackBerry', 'KaiOS', 'Other']

function formatRemaining(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '< 1 min left'
  if (mins < 60) return `${mins}m left`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m left`
  return `${Math.floor(hours / 24)}d ${hours % 24}h left`
}

type Tab = 'ip' | 'countries' | 'devices'

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'ip', label: 'IP Addresses', icon: ShieldIcon },
  { id: 'countries', label: 'Countries', icon: Globe02Icon },
  { id: 'devices', label: 'Devices', icon: SmartPhone01Icon },
]

export default function TrafficRulesPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('ip')

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchWorkspace,
  })

  // IP rules are a paid feature, but free workspaces can use them during their
  // 7-day trial. Once the trial ends the UI locks the rule forms and points to upgrade.
  const canManageRules = !workspace
    ? true
    : workspace.planName !== null || workspace.trialActive

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Traffic Rules</h1>
          <ReadMore className="max-w-3xl mt-1" lines={2}>
            Set the audience rules VeriClick applies to every tracked link: which IPs,
            countries, and devices can get through — and which get diverted to your safe
            destination. Rules are checked in this order: IP allow → IP deny → country →
            device/OS. An allow rule for an IP or country always wins.
          </ReadMore>
        </div>
      </div>

      <div className="mb-6">
        <FreeTierBanner workspace={workspace} />
      </div>

      <div className="mb-6 inline-flex gap-1 p-1 rounded-xl bg-neutral-100">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all',
              tab === id ? 'bg-white text-black shadow-sm' : 'text-muted hover:text-slate-900',
            )}
          >
            <HugeiconsIcon icon={icon} className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'ip' && (
        <IpTab canManage={canManageRules} />
      )}
      {tab === 'countries' && (
        <CountriesTab canManage={canManageRules} queryClient={queryClient} />
      )}
      {tab === 'devices' && (
        <DevicesTab canManage={canManageRules} queryClient={queryClient} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// IP tab (previously the standalone IP Rules page)
// ---------------------------------------------------------------------------

function IpTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<IPRule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<IPRule | null>(null)

  const { data: rulesData, isLoading } = useQuery({
    queryKey: ['ip-rules'],
    queryFn: fetchIPRules,
  })

  const rules = rulesData?.results ?? []

  const createMutation = useMutation({
    mutationFn: createIPRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-rules'] })
      toast.success('IP rule created')
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<IPRule> }) => updateIPRule(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-rules'] })
      toast.success('IP rule updated')
      setEditTarget(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteIPRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-rules'] })
      toast.success('IP rule deleted')
      setDeleteTarget(null)
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const ipOrCidr = (data.get('ipOrCidr') as string).trim()
    const action = data.get('action') as IPRuleAction
    const reason = (data.get('reason') as string).trim()
    if (!ipOrCidr) {
      toast.error('IP or CIDR is required')
      return
    }
    const input = { ipOrCidr, action, reason, isActive: true }
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, input })
    } else {
      createMutation.mutate(input)
    }
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id)
  }

  const handleToggleActive = (rule: IPRule) => {
    updateMutation.mutate({ id: rule.id, input: { isActive: !rule.isActive } })
  }

  const handleExpire = (rule: IPRule) => {
    updateMutation.mutate({ id: rule.id, input: { expiresAt: new Date().toISOString() } })
  }

  const canExpire = (rule: IPRule) =>
    rule.isActive && !!rule.expiresAt && new Date(rule.expiresAt).getTime() > Date.now()

  const openEdit = (rule: IPRule) => {
    setEditTarget(rule)
    setShowForm(true)
  }

  const openCreate = () => {
    setEditTarget(null)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditTarget(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted max-w-2xl">
          Allow specific IPs through or block suspicious addresses before they reach your links.
          <HelpTooltip text="An IP address is like a computer's home address on the internet. Allow rules let specific IPs through and are checked first — they always win, so whitelisted IPs are never flagged again. Deny rules block traffic next. After that, automated bot detection and rate limits apply. You can use CIDR ranges like 192.168.1.0/24 to cover many addresses at once." side="bottom" />
        </p>
        <button
          onClick={openCreate}
          disabled={!canManage}
          title={canManage ? undefined : 'Traffic rules are a paid feature. Your free trial ended — upgrade to continue.'}
          className="bg-black hover:bg-neutral-800 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm shrink-0"
        >
          <HugeiconsIcon icon={PlusSignIcon} className="w-4 h-4" />
          Add Rule
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 mb-8 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-1">
            {editTarget ? 'Edit Rule' : 'New IP Rule'}
          </h3>
          <p className="text-sm text-muted mb-4">
            {editTarget ? 'Update the rule details below.' : 'Specify an IP address or CIDR range and choose whether to allow or deny traffic.'}
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 ml-1">IP / CIDR</label>
                <input
                  name="ipOrCidr"
                  defaultValue={editTarget?.ipOrCidr ?? ''}
                  placeholder="e.g. 192.168.1.1 or 10.0.0.0/8"
                  className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-black font-mono transition-colors"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 ml-1">Action</label>
                <select
                  name="action"
                  defaultValue={editTarget?.action ?? 'deny'}
                  className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-black transition-colors appearance-none"
                >
                  <option value="deny">Deny — Block traffic</option>
                  <option value="allow">Allow — Bypass checks</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 ml-1">Reason</label>
                <input
                  name="reason"
                  defaultValue={editTarget?.reason ?? ''}
                  placeholder="Why this rule?"
                  className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-black transition-colors"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2.5 rounded-xl text-sm font-bold border border-neutral-200 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              >
                {editTarget ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : rules.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-2xl">
          <EmptyState
            icon={ShieldIcon}
            title="No IP rules yet"
            description="Create rules to allow trusted IPs through or block suspicious traffic before it reaches your links."
            action={canManage ? { label: 'Add your first rule', onClick: openCreate } : undefined}
          />
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/50">
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">IP / CIDR</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    Action
                    <HelpTooltip text="Allow: traffic bypasses all checks and is always let through. Deny: traffic is blocked and sent to your page for blocked visitors." />
                  </span>
                </th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Reason</th>
                <th className="text-center px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">
                  <span className="flex items-center justify-center gap-1.5">
                    Status
                    <HelpTooltip text="Active rules are enforced. Inactive rules are saved but not applied." />
                  </span>
                </th>
                <th className="text-center px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Expires</th>
                <th className="text-right px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm">{rule.ipOrCidr}</span>
                      {rule.source === 'auto' && (
                        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 uppercase tracking-wider" title="Generated automatically after repeated suspicious traffic">
                          Auto
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
                      rule.action === 'allow' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                    }`}>
                      {rule.action === 'allow' ? 'Allow' : 'Deny'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-muted">{rule.reason || <span className="italic text-neutral-300">No reason given</span>}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleToggleActive(rule)}
                      className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                        rule.isActive ? 'bg-success/10 text-success' : 'bg-neutral-100 text-muted'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        rule.isActive ? 'bg-success' : 'bg-muted'
                      }`} />
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-muted">
                    {rule.expiresAt
                      ? (
                        <span className={new Date(rule.expiresAt).getTime() <= Date.now() ? 'text-error' : ''}>
                          {new Date(rule.expiresAt).toLocaleDateString()}
                          <span className="block text-xs mt-0.5">{formatRemaining(rule.expiresAt)}</span>
                        </span>
                      )
                      : <span className="text-neutral-300">Never</span>
                    }
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      {canExpire(rule) && (
                        <button onClick={() => handleExpire(rule)} className="p-2.5 rounded-lg hover:bg-warning/10 transition-colors" title="Expire now">
                          <HugeiconsIcon icon={Clock02Icon} className="w-4 h-4 text-warning" />
                        </button>
                      )}
                      <button onClick={() => openEdit(rule)} className="p-2.5 rounded-lg hover:bg-neutral-100 transition-colors" title="Edit">
                        <HugeiconsIcon icon={Edit01Icon} className="w-4 h-4 text-muted" />
                      </button>
                      <button onClick={() => setDeleteTarget(rule)} className="p-2.5 rounded-lg hover:bg-error/10 transition-colors" title="Delete">
                        <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4 text-error" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete IP rule"
        message={`Are you sure you want to delete the rule for "${deleteTarget?.ipOrCidr}"? This will remove the rule immediately.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Countries tab
// ---------------------------------------------------------------------------

function CountriesTab({ canManage, queryClient }: { canManage: boolean; queryClient: ReturnType<typeof useQueryClient> }) {
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<CountryRule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CountryRule | null>(null)

  const { data: rulesData, isLoading } = useQuery({
    queryKey: ['country-rules'],
    queryFn: fetchCountryRules,
  })

  const rules = rulesData?.results ?? []

  const createMutation = useMutation({
    mutationFn: createCountryRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['country-rules'] })
      toast.success('Country rule saved')
      setShowForm(false)
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.errors?.[0]?.detail
      toast.error(detail ?? 'Failed to save country rule')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CountryRule> }) => updateCountryRule(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['country-rules'] })
      toast.success('Country rule updated')
      setEditTarget(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCountryRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['country-rules'] })
      toast.success('Country rule removed')
      setDeleteTarget(null)
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const countryCode = (data.get('countryCode') as string).trim().toUpperCase()
    const action = data.get('action') as CountryRuleAction
    const reason = (data.get('reason') as string).trim()
    if (countryCode.length !== 2) {
      toast.error('Pick a country from the list')
      return
    }
    const input = { countryCode, action, reason, isActive: true }
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, input })
    } else {
      createMutation.mutate(input)
    }
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id)
  }

  const handleToggleActive = (rule: CountryRule) => {
    updateMutation.mutate({ id: rule.id, input: { isActive: !rule.isActive } })
  }

  const openEdit = (rule: CountryRule) => {
    setEditTarget(rule)
    setShowForm(true)
  }

  const openCreate = () => {
    setEditTarget(null)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditTarget(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted max-w-2xl">
          Block or allow entire countries. Visitors from a denied country are sent to your safe
          destination; an allow rule for a country wins over a deny rule for the same country.
        </p>
        <button
          onClick={openCreate}
          disabled={!canManage}
          title={canManage ? undefined : 'Traffic rules are a paid feature. Your free trial ended — upgrade to continue.'}
          className="bg-black hover:bg-neutral-800 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm shrink-0"
        >
          <HugeiconsIcon icon={PlusSignIcon} className="w-4 h-4" />
          Add Rule
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 mb-8 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-1">
            {editTarget ? 'Edit Country Rule' : 'New Country Rule'}
          </h3>
          <p className="text-sm text-muted mb-4">
            Choose a country and whether to allow or deny its traffic.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 ml-1">Country</label>
                <select
                  name="countryCode"
                  defaultValue={editTarget?.countryCode ?? ''}
                  className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-black transition-colors appearance-none"
                >
                  <option value="" disabled>Select a country</option>
                  {COMMON_COUNTRIES.map(code => (
                    <option key={code} value={code}>{countryName(code)} ({code})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 ml-1">Action</label>
                <select
                  name="action"
                  defaultValue={editTarget?.action ?? 'deny'}
                  className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-black transition-colors appearance-none"
                >
                  <option value="deny">Deny — Block traffic</option>
                  <option value="allow">Allow — Bypass checks</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 ml-1">Reason</label>
                <input
                  name="reason"
                  defaultValue={editTarget?.reason ?? ''}
                  placeholder="Why this rule?"
                  className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-black transition-colors"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2.5 rounded-xl text-sm font-bold border border-neutral-200 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              >
                {editTarget ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : rules.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-2xl">
          <EmptyState
            icon={Globe02Icon}
            title="No country rules yet"
            description="Deny or allow entire countries to control exactly which audiences can reach your links."
            action={canManage ? { label: 'Add your first rule', onClick: openCreate } : undefined}
          />
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/50">
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Country</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Action</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Reason</th>
                <th className="text-center px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Status</th>
                <th className="text-right px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <CountryFlag code={rule.countryCode} />
                      <span className="font-bold text-sm">{countryName(rule.countryCode)}</span>
                      <span className="font-mono text-xs text-muted">{rule.countryCode}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
                      rule.action === 'allow' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                    }`}>
                      {rule.action === 'allow' ? 'Allow' : 'Deny'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-muted">{rule.reason || <span className="italic text-neutral-300">No reason given</span>}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleToggleActive(rule)}
                      className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                        rule.isActive ? 'bg-success/10 text-success' : 'bg-neutral-100 text-muted'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        rule.isActive ? 'bg-success' : 'bg-muted'
                      }`} />
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(rule)} className="p-2.5 rounded-lg hover:bg-neutral-100 transition-colors" title="Edit">
                        <HugeiconsIcon icon={Edit01Icon} className="w-4 h-4 text-muted" />
                      </button>
                      <button onClick={() => setDeleteTarget(rule)} className="p-2.5 rounded-lg hover:bg-error/10 transition-colors" title="Delete">
                        <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4 text-error" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete country rule"
        message={`Are you sure you want to delete the rule for "${countryName(deleteTarget?.countryCode ?? '')}"? This will remove the rule immediately.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Devices tab
// ---------------------------------------------------------------------------

function DevicesTab({ canManage, queryClient }: { canManage: boolean; queryClient: ReturnType<typeof useQueryClient> }) {
  const [selectedClasses, setSelectedClasses] = useState<DeviceClass[] | null>(null)
  const [selectedOs, setSelectedOs] = useState<string[] | null>(null)

  const { data: policy, isLoading } = useQuery({
    queryKey: ['device-policy'],
    queryFn: fetchDevicePolicy,
  })

  const saveMutation = useMutation({
    mutationFn: (input: Partial<DevicePolicy>) => updateDevicePolicy(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-policy'] })
      toast.success('Device rules saved')
    },
    onError: () => {
      toast.error('Failed to save device rules')
    },
  })

  const classes = selectedClasses ?? policy?.allowedDeviceClasses ?? []
  const os = selectedOs ?? policy?.blockedOsFamilies ?? []
  const dirty =
    JSON.stringify(classes) !== JSON.stringify(policy?.allowedDeviceClasses ?? []) ||
    JSON.stringify(os) !== JSON.stringify(policy?.blockedOsFamilies ?? [])

  const toggleClass = (value: DeviceClass) => {
    setSelectedClasses(classes.includes(value) ? classes.filter(c => c !== value) : [...classes, value])
  }

  const toggleOs = (value: string) => {
    setSelectedOs(os.includes(value) ? os.filter(o => o !== value) : [...os, value])
  }

  const save = () => {
    if (!dirty) return
    saveMutation.mutate({ allowedDeviceClasses: classes, blockedOsFamilies: os })
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-muted mb-6">
        Workspace-wide device and operating-system rules. When a list is empty, nothing is
        restricted. Visitors that don't match are sent to your page for blocked visitors.
      </p>

      {isLoading ? (
        <TableSkeleton rows={4} columns={3} />
      ) : (
        <div className="space-y-6">
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Allowed device types</h3>
            <p className="text-sm text-muted mb-4">
              When set, only these device types can reach your links. Leave all unchecked to allow every device.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {DEVICE_CLASSES.map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => canManage && toggleClass(value)}
                  disabled={!canManage}
                  className={`p-4 rounded-xl border text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                    classes.includes(value)
                      ? 'border-black bg-slate-50 ring-1 ring-black'
                      : 'border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-slate-900">{label}</span>
                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      classes.includes(value) ? 'bg-black border-black' : 'border-neutral-300'
                    }`}>
                      {classes.includes(value) && (
                        <svg viewBox="0 0 10 8" className="w-2.5 h-2.5"><path d="M1 4l2.5 2.5L9 1" fill="none" stroke="#fff" strokeWidth="2" /></svg>
                      )}
                    </span>
                  </div>
                  <span className="text-xs text-muted">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Blocked operating systems</h3>
            <p className="text-sm text-muted mb-4">
              Visitors on a checked operating system are sent to your page for blocked visitors.
            </p>
            <div className="flex flex-wrap gap-2">
              {OS_FAMILIES.map(osName => (
                <button
                  key={osName}
                  type="button"
                  onClick={() => canManage && toggleOs(osName)}
                  disabled={!canManage}
                  className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full border transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                    os.includes(osName)
                      ? 'bg-error/10 text-error border-error/30'
                      : 'bg-neutral-50 text-slate-700 border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  {os.includes(osName) && (
                    <svg viewBox="0 0 10 8" className="w-2.5 h-2.5"><path d="M1 4l2.5 2.5L9 1" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
                  )}
                  {osName}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            {dirty && (
              <span className="text-xs text-muted">Unsaved changes</span>
            )}
            <button
              onClick={save}
              disabled={!canManage || !dirty || saveMutation.isPending}
              title={canManage ? undefined : 'Traffic rules are a paid feature. Your free trial ended — upgrade to continue.'}
              className="bg-black hover:bg-neutral-800 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save device rules'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
