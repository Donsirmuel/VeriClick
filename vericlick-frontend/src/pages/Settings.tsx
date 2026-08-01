import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Settings01Icon, Notification02Icon, ShieldIcon, UserIcon, CodeIcon, Copy01Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { fetchWorkspace, updateWorkspace } from '@/api/workspace'
import { apiClient } from '@/api/client'

type Tab = 'general' | 'notifications' | 'security' | 'script'

const API_BASE = (apiClient.defaults.baseURL ?? 'http://localhost:8000/api').replace(/\/$/, '')

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('general')

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchWorkspace,
  })

  const [workspaceName, setWorkspaceName] = useState('')

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
    updateMutation.mutate(workspaceName)
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

  const tabs = [
    { id: 'general' as const, label: 'General', icon: Settings01Icon },
    { id: 'notifications' as const, label: 'Notifications', icon: Notification02Icon },
    { id: 'security' as const, label: 'Security', icon: ShieldIcon },
    { id: 'script' as const, label: 'Site Script', icon: CodeIcon },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-muted mt-1">Manage your workspace preferences</p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Tab sidebar */}
        <div className="w-56 shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-black text-white'
                    : 'text-muted hover:bg-neutral-100 hover:text-slate-900'
                }`}
              >
                <HugeiconsIcon icon={tab.icon} className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 max-w-2xl">
          {activeTab === 'general' && (
            <div className="bg-white rounded-2xl border border-border p-8 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Workspace</h3>
                <p className="text-sm text-muted">Configure your workspace name and preferences.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 ml-1">Workspace name</label>
                  <input
                    type="text"
                    defaultValue={workspace?.name ?? ''}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 ml-1">Default time zone</label>
                  <select className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors appearance-none">
                    <option>UTC</option>
                    <option>US/Eastern</option>
                    <option>US/Pacific</option>
                    <option>Europe/London</option>
                    <option>Asia/Tokyo</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-border">
                <button
                  onClick={handleSaveWorkspace}
                  disabled={updateMutation.isPending}
                  className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="bg-white rounded-2xl border border-border p-8 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Notifications</h3>
                <p className="text-sm text-muted">Choose how you want to be alerted.</p>
              </div>

              <div className="space-y-4">
                {[
                  { label: 'Bot spike alerts', desc: 'Get notified when bot traffic exceeds thresholds', default: true },
                  { label: 'Domain blacklist alerts', desc: 'Instant alerts when a domain is flagged on RBLs', default: true },
                  { label: 'Weekly digest', desc: 'Summary of traffic stats and protection performance', default: false },
                  { label: 'Product updates', desc: 'New features and platform improvements', default: false },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-neutral-300 transition-colors">
                    <div>
                      <div className="text-sm font-bold text-slate-900">{item.label}</div>
                      <div className="text-xs text-muted mt-0.5">{item.desc}</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked={item.default} className="sr-only peer" />
                      <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black" />
                    </label>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-4 border-t border-border">
                <button
                  onClick={() => toast.success('Notification preferences saved')}
                  className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all"
                >
                  Save preferences
                </button>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="bg-white rounded-2xl border border-border p-8 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Security</h3>
                <p className="text-sm text-muted">Manage your account security settings.</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center">
                        <HugeiconsIcon icon={UserIcon} className="w-4 h-4 text-slate-600" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900">Password</div>
                        <div className="text-xs text-muted">Last changed 30 days ago</div>
                      </div>
                    </div>
                    <button onClick={() => toast.success('Password change coming soon')} className="text-sm font-bold text-black hover:text-neutral-700 transition-colors">Change</button>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center">
                        <HugeiconsIcon icon={ShieldIcon} className="w-4 h-4 text-slate-600" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900">Two-factor authentication</div>
                        <div className="text-xs text-muted">Add an extra layer of security to your account</div>
                      </div>
                    </div>
                    <button onClick={() => toast.success('Two-factor authentication coming soon')} className="text-sm font-bold text-black hover:text-neutral-700 transition-colors">Enable</button>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center">
                        <HugeiconsIcon icon={ShieldIcon} className="w-4 h-4 text-slate-600" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900">API keys</div>
                        <div className="text-xs text-muted">Manage your programmatic access keys</div>
                      </div>
                    </div>
                    <button onClick={() => toast.success('API key management coming soon')} className="text-sm font-bold text-black hover:text-neutral-700 transition-colors">Manage</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'script' && (
            <div className="bg-white rounded-2xl border border-border p-8 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Site Script</h3>
                <p className="text-sm text-muted">
                  Add the script below to pages you own to detect bots and gather engagement signals
                  (scroll depth, mouse movement, clicks) directly from your site.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-neutral-900 text-neutral-100 text-xs font-mono leading-relaxed overflow-x-auto whitespace-nowrap">
                {snippet || <span className="italic text-neutral-500">Loading workspace…</span>}
              </div>

              <div className="p-4 rounded-xl border border-border bg-neutral-50 space-y-2">
                <h4 className="text-sm font-bold text-slate-900">How to install</h4>
                <ol className="list-decimal pl-5 text-sm text-muted space-y-1 leading-relaxed">
                  <li>Copy the snippet above.</li>
                  <li>Paste it in the <span className="font-mono text-xs bg-neutral-100 px-1 rounded">&lt;head&gt;</span> of any page you own, right before the closing tag.</li>
                  <li>Keep the <span className="font-mono text-xs bg-neutral-100 px-1 rounded">data-site</span> attribute as-is — it links events to this workspace.</li>
                  <li>The script fires an event after 3 seconds of inactivity or when the visitor leaves the page.</li>
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
