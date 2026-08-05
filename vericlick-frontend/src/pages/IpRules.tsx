import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, Edit01Icon, Cancel01Icon, ShieldIcon, Clock02Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { fetchIPRules, createIPRule, updateIPRule, deleteIPRule } from '@/api/ip_rules'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { HelpTooltip } from '@/components/ui/HelpTooltip'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import type { IPRule, IPRuleAction } from '@/types'

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

export default function IpRulesPage() {
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">IP Rules</h1>
          <p className="text-sm text-muted mt-1">
            Control which IP addresses can or cannot reach your links
            <HelpTooltip text="An IP address is like a computer's home address on the internet. Allow rules let specific IPs through and are checked first — they always win, so whitelisted IPs are never flagged again. Deny rules block traffic next. After that, automated bot detection and rate limits apply. You can use CIDR ranges like 192.168.1.0/24 to cover many addresses at once." side="right" />
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-black hover:bg-neutral-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm"
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
            action={{ label: 'Add your first rule', onClick: openCreate }}
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
                    <HelpTooltip text="Allow: traffic bypasses all checks and is always let through. Deny: traffic is blocked and sent to your safe destination." />
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
                    <span className="font-mono font-bold text-sm">{rule.ipOrCidr}</span>
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
                        <button onClick={() => handleExpire(rule)} className="p-2 rounded-lg hover:bg-warning/10 transition-colors" title="Expire now">
                          <HugeiconsIcon icon={Clock02Icon} className="w-4 h-4 text-warning" />
                        </button>
                      )}
                      <button onClick={() => openEdit(rule)} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors" title="Edit">
                        <HugeiconsIcon icon={Edit01Icon} className="w-4 h-4 text-muted" />
                      </button>
                      <button onClick={() => setDeleteTarget(rule)} className="p-2 rounded-lg hover:bg-error/10 transition-colors" title="Delete">
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
