import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { CreditCardIcon, Globe02Icon, ShieldIcon, Delete01Icon, UserIcon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { fetchWorkspace, updateWorkspace } from '@/api/workspace'
import { deleteAccount, fetchMe } from '@/api/auth'
import { parseApiError } from '@/lib/errors'
import { formatDate } from '@/lib/utils'

const SETTINGS_SECTIONS = [
  { id: 'workspace', label: 'Workspace', icon: Globe02Icon },
  { id: 'billing', label: 'Plan & billing', icon: CreditCardIcon },
  { id: 'account', label: 'Account', icon: UserIcon },
]

export default function SettingsPage() {
  const queryClient = useQueryClient()

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchWorkspace,
  })

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
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

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)

  const handleDeleteAccount = async () => {
    if (confirmation.trim().toUpperCase() !== 'DELETE') {
      toast.error("Type DELETE to confirm")
      return
    }
    setDeleting(true)
    try {
      await deleteAccount(confirmation.trim())
      localStorage.removeItem('token')
      localStorage.removeItem('refresh')
      window.location.href = '/auth/login'
    } catch (err) {
      toast.error(parseApiError(err))
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-muted mt-1">Manage your workspace preferences and account.</p>
        </div>
      </div>

      <div className="sticky top-0 z-20 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3 bg-background/95 backdrop-blur mb-6 overflow-x-auto">
        <nav className="flex items-center gap-2 min-w-max">
          {SETTINGS_SECTIONS.map(({ id, label, icon }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full bg-white border border-neutral-200 text-slate-700 hover:border-neutral-400 transition-colors"
            >
              <HugeiconsIcon icon={icon} className="w-3.5 h-3.5" />
              {label}
            </a>
          ))}
        </nav>
      </div>

      <div className="grid gap-6 max-w-3xl">
        <section id="workspace" className="scroll-mt-32 bg-white rounded-2xl border border-border p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
              <HugeiconsIcon icon={Globe02Icon} className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Workspace</h3>
              <p className="text-sm text-muted leading-relaxed">
                Set the name users see and the page where blocked visitors land.
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
              <label className="text-sm font-medium text-slate-700 ml-1">Page for blocked visitors</label>
              <input
                type="url"
                value={safeDestination}
                onChange={(e) => setSafeDestination(e.target.value)}
                placeholder="https://example.com/protected"
                className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
              />
              <p className="text-xs text-muted ml-1 leading-relaxed">
                Bots and flagged visitors land on this page instead of your real one. This keeps
                them away from your actual content. Leave it blank to use VeriClick's built-in
                protected page.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-border">
            <button
              onClick={handleSaveWorkspace}
              disabled={updateMutation.isPending || !workspace}
              className="w-full sm:w-auto bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </section>

        <section id="billing" className="scroll-mt-32 bg-white rounded-2xl border border-border p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
              <HugeiconsIcon icon={CreditCardIcon} className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Plan &amp; billing</h3>
              <p className="text-sm text-muted leading-relaxed">
                {workspace?.planStatus === 'suspended'
                  ? 'Your plan is suspended. Your site protection is still active, but traffic is no longer recorded or filtered — renew to restore full analytics and protection.'
                  : workspace?.planStatus === 'grace'
                    ? `Grace period — your ${workspace?.planName ?? 'plan'} period ended, but everything keeps working until ${formatDate(workspace.graceExpiresAt)}. Renew to keep full access.`
                    : `${workspace?.planName ?? (workspace?.trialActive ? 'Free trial' : 'Free')} — ${
                         workspace?.planBillingMode === 'subscription' ? 'monthly subscription' :
                         workspace?.planBillingMode === 'period' ? '30-day period' :
                         workspace?.trialActive ? `trial ends ${formatDate(workspace.trialExpiresAt)}` : 'no active plan'
                       }${workspace?.planBillingMode === 'period' && workspace?.planExpiresAt
                         ? `, renews by ${formatDate(workspace.planExpiresAt)}`
                         : ''}.`
                }
              </p>
            </div>
          </div>
          <div className="flex justify-end pt-4 border-t border-border">
            <Link
              to="/app/billing"
              className="w-full sm:w-auto text-center bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all"
            >
              Manage billing
            </Link>
          </div>
        </section>

        <section id="account" className="scroll-mt-32 bg-white rounded-2xl border border-border p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
              <HugeiconsIcon icon={UserIcon} className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Account</h3>
              <p className="text-sm text-muted leading-relaxed">
                Your login email is <span className="font-medium text-slate-900">{me?.email ?? 'loading…'}</span>.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-error/20 bg-error/5 flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <HugeiconsIcon icon={ShieldIcon} className="w-5 h-5 text-error" />
            </div>
            <div className="space-y-3 flex-1">
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">Close account</h4>
                <p className="text-sm text-muted leading-relaxed">
                   This deletes your workspace and all protection data permanently. It cannot be undone.
                </p>
              </div>
              {confirmingDelete ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    placeholder="Type DELETE to confirm"
                    className="w-full bg-white border border-error/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-error transition-colors"
                  />
                  <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                    <button
                      onClick={() => { setConfirmingDelete(false); setConfirmation(''); setDeleting(false) }}
                      disabled={deleting}
                      className="w-full sm:w-auto px-4 py-2.5 text-sm font-bold text-muted hover:text-slate-900 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="w-full sm:w-auto bg-error hover:bg-error/90 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      <HugeiconsIcon icon={Delete01Icon} className="w-4 h-4" />
                      {deleting ? 'Deleting…' : 'Delete my account'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="w-full sm:w-auto bg-error hover:bg-error/90 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <HugeiconsIcon icon={Delete01Icon} className="w-4 h-4" />
                  Delete my account
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-border p-6 shadow-sm flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
            <HugeiconsIcon icon={ShieldIcon} className="w-4 h-4 text-slate-700" />
          </div>
          <p className="text-sm text-muted leading-relaxed">
            VeriClick is intentionally narrow: it blocks bots and protects your site, reviews suspicious traffic, and keeps the rest out of the way.
          </p>
        </section>
      </div>
    </div>
  )
}