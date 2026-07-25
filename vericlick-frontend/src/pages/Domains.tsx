import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, RefreshIcon, Search01Icon, PauseIcon, CheckmarkCircle02Icon, Alert02Icon, CancelCircleIcon, LinkSquare02Icon, Clock03Icon } from '@hugeicons/core-free-icons'
import { AddDomainDialog } from '@/components/domains/AddDomainDialog'
import { formatRelativeTime } from '@/lib/utils'
import { mockDomains } from '@/api/mock'
import type { Domain, HealthStatus } from '@/types'
import { toast } from 'sonner'

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>(mockDomains)
  const [search, setSearch] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [rechecking, setRechecking] = useState<number | null>(null)

  const filteredDomains = domains.filter(d =>
    d.domain.toLowerCase().includes(search.toLowerCase())
  )

  const healthIcon = (status: HealthStatus) => {
    switch (status) {
      case 'healthy': return <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-5 h-5 text-success" />
      case 'degraded': return <HugeiconsIcon icon={Alert02Icon} className="w-5 h-5 text-warning" />
      case 'blacklisted': return <HugeiconsIcon icon={CancelCircleIcon} className="w-5 h-5 text-error" />
    }
  }

  const healthBadge = (status: HealthStatus) => {
      const styles = {
      healthy: 'bg-neutral-100 text-neutral-500 border-neutral-200',
      degraded: 'bg-neutral-100 text-neutral-400 border-neutral-200',
      blacklisted: 'bg-error/10 text-error border-error/20',
    }
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold uppercase tracking-wider ${styles[status]}`}>
        {healthIcon(status)}
        {status}
      </span>
    )
  }

  const handleRecheck = (domain: Domain) => {
    setRechecking(domain.id)
    setTimeout(() => {
      setDomains(prev => prev.map(d =>
        d.id === domain.id ? { ...d, lastChecked: new Date().toISOString() } : d
      ))
      setRechecking(null)
      toast.success(`${domain.domain} rechecked — status unchanged`)
    }, 2000)
  }

  const handleAdd = (domainName: string) => {
    const newDomain: Domain = {
      id: Math.floor(Math.random() * 1000) + 100,
      domain: domainName,
      healthStatus: 'healthy',
      lastChecked: new Date().toISOString(),
      linksCount: 0,
      createdAt: new Date().toISOString(),
    }
    setDomains(prev => [newDomain, ...prev])
    toast.success('Domain added to registry')
  }

  // Summary stats
  const healthyCount = domains.filter(d => d.healthStatus === 'healthy').length
  const degradedCount = domains.filter(d => d.healthStatus === 'degraded').length
  const blacklistedCount = domains.filter(d => d.healthStatus === 'blacklisted').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Domains</h1>
          <p className="text-sm text-muted mt-1">Monitor and manage your tracking domains</p>
        </div>
        <button 
          onClick={() => setShowAddDialog(true)}
          className="flex items-center gap-2 bg-black hover:bg-neutral-800 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
        >
          <HugeiconsIcon icon={PlusSignIcon} className="w-4 h-4" />
          Add Domain
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-neutral-200 flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-5 h-5 text-neutral-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{healthyCount}</p>
            <p className="text-xs text-muted font-medium">Healthy</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-neutral-200 flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
            <HugeiconsIcon icon={Alert02Icon} className="w-5 h-5 text-neutral-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{degradedCount}</p>
            <p className="text-xs text-muted font-medium">Degraded</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-neutral-200 flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center">
            <HugeiconsIcon icon={CancelCircleIcon} className="w-5 h-5 text-error" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{blacklistedCount}</p>
            <p className="text-xs text-muted font-medium">Blacklisted</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-4 py-3 mb-6 shadow-sm">
        <HugeiconsIcon icon={Search01Icon} className="w-5 h-5 text-muted" />
        <input 
          type="text" 
          placeholder="Search domains..."
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Domain List */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/50">
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Domain</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Last Checked</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Assigned Links</th>
                <th className="text-right px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDomains.map((domain) => (
                <tr key={domain.id} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        domain.healthStatus === 'healthy' ? 'bg-neutral-100' :
                        domain.healthStatus === 'degraded' ? 'bg-neutral-100' : 'bg-error/10'
                      }`}>
                        {healthIcon(domain.healthStatus)}
                      </div>
                      <div>
                        <span className="font-mono text-sm font-bold text-slate-900">{domain.domain}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {healthBadge(domain.healthStatus)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <HugeiconsIcon icon={Clock03Icon} className="w-3.5 h-3.5" />
                      {formatRelativeTime(domain.lastChecked)}
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
                        onClick={() => handleRecheck(domain)}
                        disabled={rechecking === domain.id}
                        className={`p-2 rounded-lg transition-colors ${
                          rechecking === domain.id 
                            ? 'text-neutral-400 bg-neutral-100' 
                            : 'hover:bg-neutral-100 text-muted hover:text-black'
                        }`}
                        title="Force recheck"
                      >
                        <HugeiconsIcon icon={RefreshIcon} className={`w-4 h-4 ${rechecking === domain.id ? 'animate-spin' : ''}`} />
                      </button>
                      <button 
                        className="p-2 rounded-lg hover:bg-neutral-100 text-muted hover:text-black transition-colors"
                        title="Pause monitoring"
                      >
                        <HugeiconsIcon icon={PauseIcon} className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredDomains.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-muted text-sm">No domains found.</p>
          </div>
        )}
      </div>

      {/* Add Domain Dialog */}
      {showAddDialog && (
        <AddDomainDialog 
          onClose={() => setShowAddDialog(false)}
          onSubmit={handleAdd}
        />
      )}
    </div>
  )
}
