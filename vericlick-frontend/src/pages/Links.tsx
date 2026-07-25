import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, Search01Icon, Copy01Icon, EditIcon, Delete02Icon, ExternalLinkIcon, EyeIcon, ViewOffIcon } from '@hugeicons/core-free-icons'
import { CreateLinkModal } from '@/components/links/CreateLinkModal'
import { formatRelativeTime, truncateUrl } from '@/lib/utils'
import { mockLinks } from '@/api/mock'
import { generateSlug } from '@/lib/utils'
import type { TrackingLink, LinkStatus, LinkCreateInput } from '@/types'
import { toast } from 'sonner'

export default function LinksPage() {
  const [links, setLinks] = useState<TrackingLink[]>(mockLinks)
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editTarget, setEditTarget] = useState<TrackingLink | null>(null)

  const filteredLinks = links.filter(link =>
    link.slug.toLowerCase().includes(search.toLowerCase()) ||
    link.destinationUrl.toLowerCase().includes(search.toLowerCase()) ||
    link.domain.toLowerCase().includes(search.toLowerCase())
  )

  const handleCopySlug = (link: TrackingLink) => {
    const fullUrl = `https://${link.domain}/${link.slug}`
    navigator.clipboard.writeText(fullUrl)
    toast.success(`Copied ${fullUrl}`)
  }

  const handleCreate = (input: LinkCreateInput) => {
    const newLink: TrackingLink = {
      id: Math.floor(Math.random() * 1000) + 100,
      slug: input.slug || generateSlug(),
      destinationUrl: input.destinationUrl,
      domain: input.domain,
      domainHealth: 'healthy',
      totalClicks: 0,
      botClicks: 0,
      status: input.status,
      createdAt: new Date().toISOString(),
    }
    setLinks(prev => [newLink, ...prev])
    toast.success('Link created successfully')
  }

  const handleEdit = (input: LinkCreateInput) => {
    if (!editTarget) return
    setLinks(prev => prev.map(l =>
      l.id === editTarget.id
        ? { ...l, slug: input.slug || l.slug, destinationUrl: input.destinationUrl, domain: input.domain, status: input.status }
        : l
    ))
    setEditTarget(null)
    toast.success('Link updated successfully')
  }

  const handleDelete = (id: number) => {
    setLinks(prev => prev.filter(l => l.id !== id))
    toast.success('Link deleted')
  }

  const handleToggleStatus = (link: TrackingLink) => {
    const newStatus: LinkStatus = link.status === 'active' ? 'paused' : 'active'
    setLinks(prev => prev.map(l =>
      l.id === link.id ? { ...l, status: newStatus } : l
    ))
    toast.success(`Link ${newStatus === 'active' ? 'activated' : 'paused'}`)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Links</h1>
          <p className="text-sm text-muted mt-1">Manage your tracking links and destinations</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-black hover:bg-neutral-800 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
        >
          <HugeiconsIcon icon={PlusSignIcon} className="w-4 h-4" />
          Create Link
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-4 py-3 mb-6 shadow-sm">
        <HugeiconsIcon icon={Search01Icon} className="w-5 h-5 text-muted" />
        <input 
          type="text" 
          placeholder="Search by slug, destination, or domain..."
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-muted hover:text-slate-900 text-xs font-medium">
            Clear
          </button>
        )}
      </div>

      {/* Links Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/50">
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Slug</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Destination</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Domain</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Clicks</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Bots</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Created</th>
                <th className="text-right px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLinks.map((link) => (
                <tr key={link.id} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => handleCopySlug(link)}
                      className="font-mono text-sm font-bold text-primary hover:text-primary-hover flex items-center gap-1 group"
                    >
                      {link.slug}
                      <HugeiconsIcon icon={Copy01Icon} className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </td>
                  <td className="px-6 py-4 max-w-50">
                    <a href={link.destinationUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-muted hover:text-slate-900 transition-colors truncate">
                      {truncateUrl(link.destinationUrl, 35)}
                      <HugeiconsIcon icon={ExternalLinkIcon} className="w-3 h-3 shrink-0" />
                    </a>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        link.domainHealth === 'healthy' ? 'bg-neutral-400' :
                        link.domainHealth === 'degraded' ? 'bg-warning' : 'bg-error'
                      }`} />
                      <span className="text-sm font-medium text-slate-900 truncate">{link.domain}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-slate-900">{link.totalClicks.toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-error">{link.botClicks.toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => handleToggleStatus(link)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors ${
                      link.status === 'active' 
                        ? 'bg-neutral-100 text-black hover:bg-neutral-200' 
                        : 'bg-neutral-100 text-muted hover:bg-neutral-200'
                    }`}>
                      {link.status === 'active' ? <HugeiconsIcon icon={EyeIcon} className="w-3 h-3 inline mr-1" /> : <HugeiconsIcon icon={ViewOffIcon} className="w-3 h-3 inline mr-1" />}
                      {link.status}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-muted">{formatRelativeTime(link.createdAt)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => handleCopySlug(link)}
                        className="p-2 rounded-lg hover:bg-neutral-100 text-muted hover:text-black transition-colors"
                        title="Copy URL"
                      >
                        <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setEditTarget(link)}
                        className="p-2 rounded-lg hover:bg-neutral-100 text-muted hover:text-black transition-colors"
                        title="Edit"
                      >
                        <HugeiconsIcon icon={EditIcon} className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(link.id)}
                        className="p-2 rounded-lg hover:bg-error/10 text-muted hover:text-error transition-colors"
                        title="Delete"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredLinks.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-muted text-sm">No links found matching your search.</p>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 bg-neutral-50/30">
          <span className="text-xs text-muted">
            Showing {filteredLinks.length} of {links.length} links
          </span>
          <div className="flex items-center gap-1">
            <button className="px-3 py-1.5 text-xs font-bold rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors">
              Prev
            </button>
            <button className="px-3 py-1.5 text-xs font-bold rounded-lg bg-black text-white">
              1
            </button>
            <button className="px-3 py-1.5 text-xs font-bold rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateLinkModal 
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
          domains={mockLinks.map(l => l.domain).filter((v, i, a) => a.indexOf(v) === i)}
        />
      )}

      {/* Edit Modal */}
      {editTarget && (
        <CreateLinkModal 
          onClose={() => setEditTarget(null)}
          onSubmit={handleEdit}
          domains={mockLinks.map(l => l.domain).filter((v, i, a) => a.indexOf(v) === i)}
          initialData={editTarget}
        />
      )}
    </div>
  )
}
