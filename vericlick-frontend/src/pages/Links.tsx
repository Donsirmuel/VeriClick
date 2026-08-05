import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PlusSignIcon, Search01Icon, FilterIcon,
  Copy01Icon, Edit01Icon, Cancel01Icon,
  ArrowRight02Icon, ArrowLeft02Icon, ExternalLinkIcon,
  LinkSquare02Icon,
} from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { CreateLinkModal } from '@/components/links/CreateLinkModal'
import { fetchLinks, createLink, updateLink, deleteLink } from '@/api/links'
import { fetchDomains } from '@/api/domains'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import type { TrackingLink, LinkCreateInput } from '@/types'

export default function LinksPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editTarget, setEditTarget] = useState<TrackingLink | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TrackingLink | null>(null)

  const { data: linksData } = useQuery({
    queryKey: ['links', search, page],
    queryFn: () => fetchLinks({ search, page }),
  })

  const { data: domains } = useQuery({
    queryKey: ['domains-list'],
    queryFn: fetchDomains,
  })

  const links = linksData?.results ?? []
  const totalPages = linksData ? Math.ceil(linksData.count / 20) : 0

  const createMutation = useMutation({
    mutationFn: createLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['links'] })
      toast.success('Link created successfully')
      setShowCreateModal(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<LinkCreateInput> }) => updateLink(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['links'] })
      toast.success('Link updated successfully')
      setEditTarget(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['links'] })
      toast.success('Link deleted')
      setDeleteTarget(null)
    },
  })

  const handleCreate = (input: LinkCreateInput) => {
    createMutation.mutate(input)
  }

  const handleEdit = (input: LinkCreateInput) => {
    if (!editTarget) return
    editMutation.mutate({ id: editTarget.id, input })
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id)
  }

  const handleCopyTrackedLink = async (link: TrackingLink) => {
    try {
      await navigator.clipboard.writeText(link.trackingUrl)
      toast.success('Tracked link copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handlePreviewDestination = (link: TrackingLink) => {
    window.open(link.destinationUrl, '_blank', 'noopener,noreferrer')
  }

  const domainOptions = [...new Set(domains?.map(d => d.domain) ?? [])]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tracking Links</h1>
          <p className="text-sm text-muted mt-1">
            A <strong>tracked link</strong> is the URL you share — VeriClick checks every visitor before sending them to the <strong>destination</strong> (the real page behind it). Each link has a short slug like <code className="text-xs bg-neutral-100 px-1.5 py-0.5 rounded">abc123</code>.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-black hover:bg-neutral-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm"
        >
          <HugeiconsIcon icon={PlusSignIcon} className="w-4 h-4" />
          Create Link
        </button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted">
            <HugeiconsIcon icon={Search01Icon} className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search by slug, URL or domain..."
            className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:border-black transition-colors"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <button className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-colors">
          <HugeiconsIcon icon={FilterIcon} className="w-4 h-4 text-muted" />
        </button>
      </div>

      {links.length === 0 && !linksData ? (
        <TableSkeleton rows={6} columns={7} />
      ) : links.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-2xl">
          <EmptyState
            icon={LinkSquare02Icon}
            title="No links yet"
            description="Create your first tracking link to start monitoring clicks and blocking bots."
            action={search ? undefined : { label: 'Create your first link', onClick: () => setShowCreateModal(true) }}
          />
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="min-w-245 w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/50">
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Tracked link</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Destination</th>
                <th className="text-center px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Clicks</th>
                <th className="text-center px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Humans</th>
                <th className="text-center px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Bots</th>
                <th className="text-center px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Status</th>
                <th className="text-right px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => {
                const humanClicks = link.humanClicks ?? Math.max((link.totalClicks ?? 0) - (link.botClicks ?? 0), 0)

                return (
                <tr key={link.id} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono font-bold text-sm">{link.slug}</span>
                    <span className="mt-0.5 block max-w-[320px] truncate text-xs text-muted" title={link.trackingUrl}>{link.trackingUrl}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="block max-w-[320px] truncate text-sm text-muted" title={link.destinationUrl}>{link.destinationUrl}</span>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-sm">{link.totalClicks.toLocaleString()}</td>
                  <td className="px-6 py-4 text-center font-bold text-sm">{humanClicks.toLocaleString()}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-sm font-medium text-error">{link.botClicks.toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
                      link.status === 'active' ? 'bg-success/10 text-success' :
                      link.status === 'paused' ? 'bg-warning/10 text-warning' :
                      'bg-neutral-100 text-muted'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        link.status === 'active' ? 'bg-success' :
                        link.status === 'paused' ? 'bg-warning' :
                        'bg-muted'
                      }`} />
                      {link.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleCopyTrackedLink(link)} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors" title="Copy tracked link">
                        <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4 text-muted" />
                      </button>
                      <button onClick={() => handlePreviewDestination(link)} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors" title="Preview destination">
                        <HugeiconsIcon icon={ExternalLinkIcon} className="w-4 h-4 text-muted" />
                      </button>
                      <button onClick={() => setEditTarget(link)} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors" title="Edit">
                        <HugeiconsIcon icon={Edit01Icon} className="w-4 h-4 text-muted" />
                      </button>
                      <button onClick={() => setDeleteTarget(link)} className="p-2 rounded-lg hover:bg-error/10 transition-colors" title="Delete">
                        <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4 text-error" />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="p-2 rounded-xl border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40 transition-colors"
            >
              <HugeiconsIcon icon={ArrowLeft02Icon} className="w-4 h-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="p-2 rounded-xl border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40 transition-colors"
            >
              <HugeiconsIcon icon={ArrowRight02Icon} className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateLinkModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
          domains={domainOptions}
        />
      )}

      {editTarget && (
        <CreateLinkModal
          onClose={() => setEditTarget(null)}
          onSubmit={handleEdit}
          domains={domainOptions}
          initialData={editTarget}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete link"
        message={`Are you sure you want to delete "${deleteTarget?.slug}"? This action cannot be undone. All click data for this link will be lost.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
