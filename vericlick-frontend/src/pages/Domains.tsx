import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Globe02Icon, Delete01Icon, CheckmarkCircle02Icon, Add01Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { fetchDomains, addDomain, deleteDomain, fetchWorkspace } from '@/api/workspace'
import { parseApiError } from '@/lib/errors'
import { formatDate } from '@/lib/utils'
import { DashboardSkeleton } from '@/components/ui/DashboardSkeleton'

export default function Domains() {
  const queryClient = useQueryClient()
  const [newDomain, setNewDomain] = useState('')

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
      toast.success('Domain added')
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
          Register the domains you want to protect. Your plan allows up to{' '}
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
                    <div className="text-xs text-muted">Added {formatDate(d.createdAt)}</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Remove ${d.domain}?`)) {
                      deleteMutation.mutate(d.id)
                    }
                  }}
                  className="text-neutral-400 hover:text-red-500 transition-colors shrink-0 ml-4 p-1"
                  title="Remove domain"
                >
                  <HugeiconsIcon icon={Delete01Icon} className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <HugeiconsIcon icon={Globe02Icon} className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
            <p className="text-sm text-muted mb-1">No domains registered yet</p>
            <p className="text-xs text-muted">
              Add a domain above to start protecting it with VeriClick.
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
            <span className="text-xs mt-1.5">•</span>
            Register the domain where you want protection. No DNS changes needed.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-xs mt-1.5">•</span>
            Install the VeriClick script on pages of that domain to activate protection.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-xs mt-1.5">•</span>
            Each plan covers a set number of domains — Basic (5), Plus (10), Pro (20).
          </li>
        </ul>
      </div>
    </div>
  )
}
