import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Globe02Icon, PlusSignIcon, RefreshIcon, Search01Icon, Edit01Icon, Cancel01Icon, Clock03Icon, LinkSquare02Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { AddDomainDialog } from '@/components/domains/AddDomainDialog'
import { VerifyDomainDialog } from '@/components/domains/VerifyDomainDialog'
import { DnsSetupDialog } from '@/components/domains/DnsSetupDialog'
import { fetchDomains, createDomain, updateDomain, deleteDomain, recheckDomain } from '@/api/domains'
import { fetchWorkspace } from '@/api/workspace'
import { formatRelativeTime } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { HelpTooltip } from '@/components/ui/HelpTooltip'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import type { Domain } from '@/types'

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

function readyBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-success/10 text-success">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-3.5 h-3.5" />
      Ready for links
    </span>
  )
}

function needsDnsBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-warning/10 text-warning">
      <span className="w-1.5 h-1.5 rounded-full bg-warning" />
      One quick step left
    </span>
  )
}

export default function DomainsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteName, setDeleteName] = useState('')
  const [editTarget, setEditTarget] = useState<{ id: string; domain: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [verifyTarget, setVerifyTarget] = useState<Domain | null>(null)
  const [dnsSetupTarget, setDnsSetupTarget] = useState<Domain | null>(null)

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: fetchDomains,
  })

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchWorkspace,
  })

  const planLabel = workspace?.betaFreeMode
    ? 'Free beta'
    : workspace?.planName ?? 'Free'
  const domainUsage = workspace
    ? workspace.domainLimit
      ? `${workspace.domainsUsed} / ${workspace.domainLimit}`
      : `${workspace.domainsUsed} / unlimited`
    : null
  const atLimit = Boolean(workspace && !workspace.betaFreeMode && !workspace.canAddDomain)

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
      setDeleteTarget(null)
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
      setEditTarget(null)
    },
  })

  const filteredDomains = domains.filter(d =>
    d.domain.toLowerCase().includes(search.toLowerCase())
  )

  // Verified + resolving to our server = fully ready for branded links.
  // Verified but NOT pointing at us = ownership done, DNS step still needed.
  const needsDnsStepDomains = domains.filter(d => d.verified && !d.ready)

  const handleStartEdit = (id: string, domain: string) => {
    setEditTarget({ id, domain })
    setEditValue(domain)
  }

  const handleSaveEdit = () => {
    if (!editTarget || !editValue.trim()) return
    updateMutation.mutate({ id: editTarget.id, domain: editValue.trim() })
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget)
  }

  const handleVerified = () => {
    queryClient.invalidateQueries({ queryKey: ['domains'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Domain Registry</h1>
          <p className="text-sm text-muted mt-1 max-w-3xl">A domain is the web address your links live on, like <code className="text-xs bg-neutral-100 px-1.5 py-0.5 rounded">your.domain/r/summer23</code>. For a domain to be fully ready you do two things, and the app walks you through both: <strong>Verify</strong> you own it (add a small text record), then <strong>Point</strong> it at VeriClick (add one short record) so your links use your own brand.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {domainUsage && (
            <span className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl border ${
              atLimit
                ? 'text-warning bg-warning/10 border-warning/20'
                : 'text-slate-700 bg-neutral-100 border-neutral-200'
            }`}>
              <HugeiconsIcon icon={Globe02Icon} className="w-4 h-4" />
              {planLabel}: {domainUsage}{' '}
              {workspace?.betaFreeMode ? 'domains' : workspace?.domainLimit ? 'domains used' : 'domains'}
            </span>
          )}
          {atLimit && (
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 bg-black hover:bg-neutral-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
            >
              Upgrade plan
            </Link>
          )}
          <button
            onClick={() => setShowAddDialog(true)}
            disabled={atLimit}
            title={atLimit ? 'You reached the domain limit for your plan. Upgrade to add more.' : undefined}
            className="bg-black hover:bg-neutral-800 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm"
          >
            <HugeiconsIcon icon={PlusSignIcon} className="w-4 h-4" />
            Add Domain
          </button>
        </div>
      </div>

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

      {needsDnsStepDomains.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-warning/30 bg-warning/10 p-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 shrink-0">
                <HugeiconsIcon icon={Globe02Icon} className="w-5 h-5 text-warning" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">
                  {needsDnsStepDomains.length === 1
                    ? 'Your domain is verified — one more quick step'
                    : `${needsDnsStepDomains.length} of your domains need one more quick step`}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed mt-0.5">
                  Ownership is confirmed, but {needsDnsStepDomains.length === 1 ? `your domain` : 'these domains'} don't
                  point at VeriClick yet. Links share the VeriClick URL until they do. Add one short record
                  to use your own brand.
                </p>
              </div>
            </div>
            <button
              onClick={() => setDnsSetupTarget(needsDnsStepDomains[0])}
              className="shrink-0 bg-black hover:bg-neutral-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
            >
              Show DNS setup
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : domains.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-2xl">
          <EmptyState
            icon={Globe02Icon}
            title="No domains registered"
            description="Add your first tracking domain to start routing traffic. Then prove ownership with a TXT record to get the 'Verified' badge."
            action={{ label: 'Add your first domain', onClick: () => setShowAddDialog(true) }}
          />
        </div>
      ) : filteredDomains.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-2xl">
          <EmptyState
            icon={Search01Icon}
            title="No matching domains"
            description="Try a different search term."
          />
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/50">
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Domain</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    Status
                    <HelpTooltip text="A domain is fully ready only when BOTH of its two steps are done: (1) Verified — you proved ownership by adding a TXT record; and (2) DNS points at VeriClick — you added the record we show you so the domain reaches our servers. 'Deferred' just means it hasn't been re-checked yet." />
                  </span>
                </th>
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
                      {editTarget?.id === domain.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="border border-neutral-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-black"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                          />
                          <button onClick={handleSaveEdit} className="text-xs font-bold text-success hover:text-success/80">Save</button>
                          <button onClick={() => setEditTarget(null)} className="text-xs font-bold text-muted hover:text-slate-700">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{domain.domain}</span>
                          {domain.verified ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-success bg-success/10 px-2 py-0.5 rounded-full">
                              Verified
                            </span>
                          ) : (
                            <button
                              onClick={() => setVerifyTarget(domain)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-warning bg-warning/10 hover:bg-warning/20 px-2 py-0.5 rounded-full transition-colors"
                              title="Verify ownership with a TXT record"
                            >
                              Verify ownership
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-start gap-2">
                      {domain.ready ? (
                        readyBadge()
                      ) : domain.verified ? (
                        <>
                          {needsDnsBadge()}
                          <button
                            onClick={() => setDnsSetupTarget(domain)}
                            className="text-xs font-bold text-slate-700 underline decoration-neutral-300 hover:decoration-black underline-offset-2 transition-colors"
                          >
                            Add DNS record →
                          </button>
                        </>
                      ) : (
                        <>
                          {healthBadge(domain.healthStatus)}
                          <span className="text-xs font-bold text-warning">
                            {domain.healthStatus === 'degraded'
                              ? 'Not resolving'
                              : 'Verify ownership first'}
                          </span>
                        </>
                      )}
                    </div>
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
                        title="Re-check domain health"
                      >
                        <HugeiconsIcon icon={RefreshIcon} className="w-4 h-4 text-muted" />
                      </button>
                      <button
                        onClick={() => handleStartEdit(domain.id, domain.domain)}
                        className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
                        title="Edit domain"
                      >
                        <HugeiconsIcon icon={Edit01Icon} className="w-4 h-4 text-muted" />
                      </button>
                      <button
                        onClick={() => { setDeleteTarget(domain.id); setDeleteName(domain.domain) }}
                        className="p-2 rounded-lg hover:bg-error/10 transition-colors"
                        title="Remove domain"
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
        </div>
      )}

      {showAddDialog && (
        <AddDomainDialog
          onClose={() => setShowAddDialog(false)}
          onSubmit={(domain) => createMutation.mutate(domain)}
          loading={createMutation.isPending}
        />
      )}

      {verifyTarget && (
        <VerifyDomainDialog
          domain={verifyTarget}
          onClose={() => setVerifyTarget(null)}
          onVerified={handleVerified}
          onRequestDnsSetup={(d) => setDnsSetupTarget(d)}
        />
      )}

      {dnsSetupTarget && (
        <DnsSetupDialog
          domain={dnsSetupTarget}
          onClose={() => setDnsSetupTarget(null)}
          onRechecked={() => {
            queryClient.invalidateQueries({ queryKey: ['domains'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove domain"
        message={`Are you sure you want to remove "${deleteName}"? Links using this domain will continue to work but will show as "No domain".`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
