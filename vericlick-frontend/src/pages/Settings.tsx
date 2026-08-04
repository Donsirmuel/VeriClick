import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { CodeIcon, Copy01Icon, Globe02Icon, ShieldIcon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { fetchWorkspace, updateWorkspace } from '@/api/workspace'
import { apiClient } from '@/api/client'
import { Skeleton } from '@/components/ui/Skeleton'

const API_BASE = (apiClient.defaults.baseURL ?? 'http://localhost:8000/api').replace(/\/$/, '')

export default function SettingsPage() {
  const queryClient = useQueryClient()

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchWorkspace,
  })

  const [workspaceName, setWorkspaceName] = useState('')
  const [safeDestination, setSafeDestination] = useState('')

  useEffect(() => {
    if (!workspace) return
    setWorkspaceName(workspace.name)
    setSafeDestination(workspace.safeDestination ?? '')
  }, [workspace])

  const updateMutation = useMutation({
    mutationFn: updateWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      toast.success('Workspace updated')
    },
  })

  const handleSaveWorkspace = () => {
    if (!workspaceName.trim()) {
      toast.error('Workspace name cannot be empty')
      return
    }
    updateMutation.mutate({
      name: workspaceName.trim(),
      safeDestination: safeDestination.trim(),
    })
  }

  const snippet = workspace
    ? `<script src="${API_BASE}/tracker.js" data-site="${workspace.id}" data-token="${workspace.trackerSecret}" async></script>`
    : ''

  const handleCopySnippet = async () => {
    if (!snippet) return
    try {
      await navigator.clipboard.writeText(snippet)
      toast.success('Snippet copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-muted mt-1">Manage your workspace preferences.</p>
        </div>
      </div>

      <div className="grid gap-6 max-w-3xl">
        <section className="bg-white rounded-2xl border border-border p-8 shadow-sm space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
              <HugeiconsIcon icon={Globe02Icon} className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Workspace</h3>
              <p className="text-sm text-muted leading-relaxed">
                Set the name users see and the safe destination suspicious traffic should reach.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 ml-1">Workspace name</label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 ml-1">Safe destination</label>
              <input
                type="url"
                value={safeDestination}
                onChange={(e) => setSafeDestination(e.target.value)}
                placeholder="https://example.com/protected"
                className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
              />
              <p className="text-xs text-muted ml-1 leading-relaxed">
                Suspicious traffic is sent here instead of your real page. Leave it blank to use VeriClick's built-in protected page.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-border">
            <button
              onClick={handleSaveWorkspace}
              disabled={updateMutation.isPending || !workspace}
              className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-border p-8 shadow-sm space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
              <HugeiconsIcon icon={CodeIcon} className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Site script</h3>
              <p className="text-sm text-muted leading-relaxed">
                Add this only to pages you control if you want extra browser signals. The link tracker works without it.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-neutral-900 text-neutral-100 text-xs font-mono leading-relaxed overflow-x-auto whitespace-nowrap">
            {snippet || (
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-72" />
                <Skeleton className="h-3.5 w-96" />
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl border border-border bg-neutral-50 space-y-2">
            <h4 className="text-sm font-bold text-slate-900">How to install</h4>
            <ol className="list-decimal pl-5 text-sm text-muted space-y-1 leading-relaxed">
              <li>Copy the snippet above.</li>
              <li>Paste it near the end of the page <span className="font-mono text-xs bg-neutral-100 px-1 rounded">&lt;head&gt;</span>.</li>
              <li>Keep the <span className="font-mono text-xs bg-neutral-100 px-1 rounded">data-site</span> and <span className="font-mono text-xs bg-neutral-100 px-1 rounded">data-token</span> values unchanged.</li>
              <li>The script sends an event after a few seconds of inactivity or when the visitor leaves the page.</li>
            </ol>
          </div>

          <div className="flex justify-end pt-4 border-t border-border">
            <button
              onClick={handleCopySnippet}
              disabled={!snippet}
              className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4" />
              Copy snippet
            </button>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-border p-6 shadow-sm flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
            <HugeiconsIcon icon={ShieldIcon} className="w-4 h-4 text-slate-700" />
          </div>
          <p className="text-sm text-muted leading-relaxed">
            VeriClick is intentionally narrow: it protects links, verifies domains, reviews suspicious traffic, and keeps the rest out of the way.
          </p>
        </section>
      </div>
    </div>
  )
}
