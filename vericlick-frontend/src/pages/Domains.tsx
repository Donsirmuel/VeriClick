import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Globe02Icon, PlusSignIcon, RefreshIcon, Search01Icon, Edit01Icon, Cancel01Icon, Clock03Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { AddDomainDialog } from '@/components/domains/AddDomainDialog'
import { fetchDomains, createDomain, updateDomain, deleteDomain, recheckDomain } from '@/api/domains'
import { formatRelativeTime } from '@/lib/utils'

function healthBadge(status: string) {
  const styles: Record<string, string> = {
    healthy: 'bg-success/10 text-success border-success/20',
    degraded: 'bg-warning/10 text-warning border-warning/20',
    blacklisted: 'bg-error/10 text-error border-error/20',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${styles[status] || 'bg-neutral-100 text-muted'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'healthy' ? 'bg-success' :
        status === 'degraded' ? 'bg-warning' :
        'bg-error'
      }`} />
      {status}
    </span>
  )
}

export default function DomainsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)

  const { data: domains = [] } = useQuery({
    queryKey: ['domains'],
    queryFn: fetchDomains,
  })

  const createMutation = useMutation({
    mutationFn: createDomain,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      toast.success('Domain registered successfully')
      setShowAddDialog(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDomain,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      toast.success('Domain removed')
    },
  })

  const recheckMutation = useMutation({
    mutationFn: recheckDomain,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      toast.success('Recheck initiated')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, domain }: { id: string; domain: string }) => updateDomain(id, domain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      toast.success('Domain updated')
    },
  })

  const filteredDomains = domains.filter(d =>
    d.domain.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Domain Registry</h1>
          <p className="text-sm text-muted mt-1">Monitor and manage your tracking domains</p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="bg-black hover:bg-neutral-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm"
        >
          <HugeiconsIcon icon={PlusSignIcon} className="w-4 h-4" />
          Add Domain
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-6">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted">
          <HugeiconsIcon icon={Search01Icon} className="w-4 h-4" />
        </div>
        <input
          type="text"
          placeholder="Search domains..."
          className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:border-black transition-colors"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/50">
              <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Domain</th>
              <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Status</th>
              <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Last Checked</th>
              <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Links</th>
              <th className="text-right px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDomains.map(domain => (
              <tr key={domain.id} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-neutral-100 rounded-lg flex items-center justify-center">
                      <HugeiconsIcon icon={Globe02Icon} className="w-4 h-4 text-slate-700" />
                    </div>
                    <span className="font-bold text-sm">{domain.domain}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {healthBadge(domain.healthStatus)}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <HugeiconsIcon icon={Clock03Icon} className="w-3.5 h-3.5" />
                    {domain.lastChecked ? formatRelativeTime(domain.lastChecked) : 'Never'}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5 text-sm text-slate-900 font-medium">
                    <HugeiconsIcon icon={LinkSquare02Icon} className="w-4 h-4 text-muted" />
                    {domain.linksCount}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => recheckMutation.mutate(domain.id)}
                      className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
                      title="Recheck"
                    >
                      <HugeiconsIcon icon={RefreshIcon} className="w-4 h-4 text-muted" />
                    </button>
                    <button
                      onClick={() => {
                        const newDomain = prompt('New domain name:', domain.domain)
                        if (newDomain && newDomain !== domain.domain) {
                          updateMutation.mutate({ id: domain.id, domain: newDomain })
                        }
                      }}
                      className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
                      title="Edit"
                    >
                      <HugeiconsIcon icon={Edit01Icon} className="w-4 h-4 text-muted" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${domain.domain}?`)) {
                          deleteMutation.mutate(domain.id)
                        }
                      }}
                      className="p-2 rounded-lg hover:bg-error/10 transition-colors"
                      title="Remove"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4 text-error" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Domain Dialog */}
      {showAddDialog && (
        <AddDomainDialog
          onClose={() => setShowAddDialog(false)}
          onSubmit={(domain) => createMutation.mutate(domain)}
          loading={createMutation.isPending}
        />
      )}
    </div>
  )
}
