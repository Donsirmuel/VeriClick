import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Search01Icon, ArrowRight02Icon, ArrowLeft02Icon,
  BlockedIcon, CheckmarkCircle02Icon,
} from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { fetchBlockedIps, whitelistIp } from '@/api/ip_rules'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { BlockedIPEntry } from '@/types'

const PAGE_SIZE = 50

export default function BlockedIPsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [whitelistTarget, setWhitelistTarget] = useState<BlockedIPEntry | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['blocked-ips', search, page],
    queryFn: () => fetchBlockedIps({ search, page }),
  })

  const blocked = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0

  const whitelistMutation = useMutation({
    mutationFn: whitelistIp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-ips'] })
      queryClient.invalidateQueries({ queryKey: ['ip-rules'] })
      toast.success('IP whitelisted')
      setWhitelistTarget(null)
    },
    onError: () => {
      toast.error('Failed to whitelist IP')
    },
  })

  const handleWhitelist = () => {
    if (!whitelistTarget) return
    whitelistMutation.mutate(whitelistTarget.id)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Blocked IPs</h1>
          <p className="text-sm text-muted mt-1">
            Recently blocked traffic for your links. Whitelist an IP to allow it through in the future.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted">
            <HugeiconsIcon icon={Search01Icon} className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search by IP or slug..."
            className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:border-black transition-colors"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-center text-sm text-muted">Loading...</div>
      ) : blocked.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-2xl">
          <EmptyState
            icon={BlockedIcon}
            title="No blocked IPs"
            description={
              search
                ? `No blocked entries match "${search}".`
                : 'No traffic has been blocked yet. When bots and bad actors are detected, they will show up here for you to review and whitelist.'
            }
          />
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/50">
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">IP</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Reason</th>
                <th className="text-center px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Bot?</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Matched Rule</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Slug</th>
                <th className="text-center px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Timestamp</th>
                <th className="text-right px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {blocked.map((entry) => (
                <tr key={entry.id} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono font-bold text-sm">{entry.ip}</span>
                    {entry.country && (
                      <span className="block text-xs text-muted mt-0.5">{entry.country}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-muted">{entry.reason || <span className="italic text-neutral-300">No reason</span>}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
                      entry.isBot ? 'bg-error/10 text-error' : 'bg-neutral-100 text-muted'
                    }`}>
                      {entry.isBot ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs text-muted">{entry.matchedRule || <span className="italic text-neutral-300">—</span>}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm">{entry.slug}</span>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-muted whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => setWhitelistTarget(entry)}
                        disabled={whitelistMutation.isPending}
                        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-50"
                      >
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-3.5 h-3.5" />
                        Whitelist
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      <ConfirmDialog
        open={!!whitelistTarget}
        title="Whitelist IP"
        message={`Create an allow rule for "${whitelistTarget?.ip}"? Traffic from this IP will bypass all checks.`}
        confirmLabel="Whitelist"
        onConfirm={handleWhitelist}
        onCancel={() => setWhitelistTarget(null)}
        loading={whitelistMutation.isPending}
      />
    </div>
  )
}
