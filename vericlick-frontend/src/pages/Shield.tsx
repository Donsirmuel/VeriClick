import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { ShieldIcon, Shield02Icon, Settings01Icon, Copy01Icon, CheckmarkCircle02Icon, Download01Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { apiClient } from '@/api/client'
import { fetchDomains, fetchSnippet, testInstallation } from '@/api/workspace'
import { formatRelativeTime } from '@/lib/utils'

type ProtectionMode = 'strict' | 'balanced' | 'monitor'
type BotAction = 'block' | 'honeypot' | 'log'
type Platform = 'html' | 'wordpress' | 'shopify' | 'wix' | 'squarespace' | 'webflow' | 'cpanel'

interface ShieldConfig {
  protectionMode: ProtectionMode
  botAction: BotAction
  rateLimit: number
  protectedPaths: string[]
  blockedPaths: string[]
  safeDestination: string
}

const PROTECTION_MODES: {
  value: ProtectionMode
  label: string
  description: string
  icon: typeof ShieldIcon
}[] = [
  { value: 'balanced', label: 'Balanced (Recommended)', description: 'Silently blocks confirmed bots', icon: Shield02Icon },
  { value: 'strict', label: 'Strict', description: 'Challenges suspicious traffic including VPNs', icon: ShieldIcon },
  { value: 'monitor', label: 'Monitor Only', description: 'Logs bot traffic without blocking', icon: Settings01Icon },
]

const BOT_ACTIONS: { value: BotAction; label: string }[] = [
  { value: 'block', label: 'Block (show error page)' },
  { value: 'honeypot', label: 'Redirect to safe page' },
  { value: 'log', label: 'Log only (record but don\'t block)' },
]

const PLATFORMS: { key: Platform; name: string; icon: string; description: string; steps: string[]; iniSnippet?: string; iniHint?: string; altMethods?: { id: string; label: string; steps: string[]; iniSnippet: string; iniHint: string }[] }[] = [
  { key: 'html', name: 'HTML', icon: '🌐', description: 'Add before the closing </head> tag', steps: ['Open your HTML file', 'Find the <head> section', 'Paste the snippet before the closing </head> tag', 'Save and deploy'] },
  { key: 'wordpress', name: 'WordPress', icon: '📝', description: 'Plugin or theme header', steps: ["Install 'Insert Headers and Footers' by WPCode", 'Go to Code Snippets > Header & Footer', 'Paste the snippet in the Header section', 'Save and activate'] },
  { key: 'shopify', name: 'Shopify', icon: '🛒', description: 'theme.liquid before </head>', steps: ['Go to Online Store > Edit Code', 'Open layout/theme.liquid', 'Find the </head> tag', 'Paste the snippet immediately before it', 'Save'] },
  { key: 'wix', name: 'Wix', icon: '✨', description: 'Custom code via Settings', steps: ['Go to Settings > Custom Code', "Click '+ Add Custom Code'", "Select 'Head' as the placement", 'Paste the snippet', 'Save and publish'] },
  { key: 'squarespace', name: 'Squarespace', icon: '🎨', description: 'Code Injection in site settings', steps: ['Go to Settings > Advanced > Code Injection', "Paste the snippet in the 'Header' field", 'Click Save'] },
  { key: 'webflow', name: 'Webflow', icon: '🖼️', description: 'Site Settings > Custom Code', steps: ['Go to Site Settings > Custom Code', "Paste in the 'Head Code' section", 'Save and publish your site'] },
  { key: 'cpanel', name: 'cPanel / PHP', icon: '📁', description: 'Auto-inject via PHP prepend — no template editing', steps: [], altMethods: [
    { id: 'multiphp', label: 'MultiPHP INI Editor', steps: [
      'Click the download buttons above to save the .js and prepend.php files',
      "Log in to cPanel \u2192 File Manager \u2192 open your site's root folder (public_html)",
      'Upload both files there',
      'Go to cPanel \u2192 Software \u2192 MultiPHP INI Editor \u2192 Editor Mode \u2192 select Home Directory',
      'Paste the line below into the editor (replace USERNAME with your cPanel username):',
      'Click Save, then wait about 5 minutes \u2014 PHP picks up the new setting automatically',
    ], iniSnippet: 'auto_prepend_file = "/home/USERNAME/public_html/vericlick-prepend.php"', iniHint: 'The line must start with auto_prepend_file = \u2014 if you see "invalid line", you may have pasted only the path without the setting name.' },
    { id: 'php-include', label: 'Edit each .php file', steps: [
      'Click the download buttons above to save the .js and prepend.php files',
      "Log in to cPanel \u2192 File Manager \u2192 open your site's root folder (public_html)",
      'Upload both files there',
      'Open index.php (your main entry point)',
      'Add this as the VERY FIRST line, before any HTML or PHP code:',
      'Repeat for every other .php file you want protected (e.g. apply.php, about.php)',
    ], iniSnippet: "<?php require_once '/home/USERNAME/public_html/vericlick-prepend.php'; ?>", iniHint: 'This works on any PHP host \u2014 no server config needed. Every .php page you want protected must include this line at the top.' },
  ] },
]

export default function ShieldPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: config } = useQuery({
    queryKey: ['workspace-shield-config'],
    queryFn: async () => {
      const { data } = await apiClient.get<ShieldConfig>('/workspace/shield-config/')
      return data
    },
  })

  const { data: domains } = useQuery({
    queryKey: ['domains'],
    queryFn: fetchDomains,
  })

  const [selectedDomainId, setSelectedDomainId] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('html')
  const [cpanelMethod, setCpanelMethod] = useState('multiphp')
  const [copiedSnippet, setCopiedSnippet] = useState(false)
  const [protectionMode, setProtectionMode] = useState<ProtectionMode>('balanced')
  const [botAction, setBotAction] = useState<BotAction>('block')
  const [safeDestination, setSafeDestination] = useState('')
  const [saveError, setSaveError] = useState('')

  // Auto-select domain from ?domain= query param (redirected from Domains page)
  useEffect(() => {
    const domainParam = searchParams.get('domain')
    if (domainParam && domains?.length) {
      const match = domains.find((d) => d.domain === domainParam)
      if (match) {
        setSelectedDomainId(match.id)
        setSearchParams({}, { replace: true })
      }
    }
  }, [searchParams, domains, setSearchParams])

  const selectedDomain = domains?.find((d) => d.id === selectedDomainId)

  const { data: snippetData, isLoading: snippetLoading } = useQuery({
    queryKey: ['snippet', selectedDomain?.domain],
    queryFn: () => fetchSnippet(selectedDomain!.domain),
    enabled: !!selectedDomain,
  })

  interface ProtectedPage {
    path: string
    visits: number
    bots: number
    lastSeen: string | null
  }

  const scriptLive = !!selectedDomain && (selectedDomain.verified || !!selectedDomain.scriptInstalled)
  const { data: protectedPages, isLoading: pagesLoading } = useQuery({
    queryKey: ['shield-pages', selectedDomain?.domain],
    queryFn: async () => {
      const { data } = await apiClient.get<ProtectedPage[]>('/shield/pages/', {
        params: { domain: selectedDomain!.domain },
      })
      return data
    },
    enabled: scriptLive,
  })

  useEffect(() => {
    if (config) {
      setProtectionMode(config.protectionMode)
      setBotAction(config.botAction)
      setSafeDestination(config.safeDestination ?? '')
    }
  }, [config])

  const saveMutation = useMutation({
    mutationFn: async (payload: { protectionMode: ProtectionMode; botAction: BotAction; safeDestination: string }) => {
      const { data } = await apiClient.patch('/workspace/shield-config/', payload)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-shield-config'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      setSaveError('')
      // Reflect what the server stored, not what was typed — it normalises
      // "example.com/safe" into a full address.
      if (typeof data?.safeDestination === 'string') setSafeDestination(data.safeDestination)
      toast.success('Anti-bot settings saved')
    },
    onError: (err: any) => {
      // A rejected safe destination is a fixable typo. Saying only "failed"
      // leaves the user re-clicking Save with no idea what is wrong.
      const detail = err?.response?.data?.safeDestination
      const message = Array.isArray(detail) ? detail[0] : detail
      setSaveError(message || '')
      toast.error(message || 'Could not save your anti-bot settings')
    },
  })

  const handleSave = () => {
    saveMutation.mutate({
      protectionMode,
      botAction,
      safeDestination: botAction === 'honeypot' ? safeDestination : '',
    })
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedSnippet(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopiedSnippet(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const verifyMutation = useMutation({
    mutationFn: () => testInstallation(selectedDomain!.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      if (result.installed) {
        toast.success(`VeriClick script found on ${result.domain}`)
      } else {
        toast.error(result.error || 'Script not found — if you just installed it, wait a few minutes and try again')
      }
    },
    onError: () => toast.error('Verification request failed — try again in a moment'),
  })

  const isDirty = config
    ? protectionMode !== config.protectionMode ||
      botAction !== config.botAction ||
      (botAction === 'honeypot' && safeDestination !== (config.safeDestination ?? ''))
    : false

  const currentSnippet = snippetData?.snippet ?? ''
  const currentGuide = PLATFORMS.find((p) => p.key === selectedPlatform)!

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Anti-Bot</h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Install the script, then configure how VeriClick protects your site.
        </p>
      </div>

      <div className="space-y-6">
        {/* Install Script */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-1">1. Install the script</h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Add this snippet to your website's <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">&lt;head&gt;</code> section. It verifies your domain and protects every page.
          </p>

          <div className="mb-4">
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Select your domain</label>
            <select
              value={selectedDomainId}
              onChange={(e) => setSelectedDomainId(e.target.value)}
              className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
            >
              <option value="">Choose a domain…</option>
              {domains?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.domain} {!d.verified ? ' (unverified)' : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedDomainId && (
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Platform</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setSelectedPlatform(p.key)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-xs font-bold transition-all ${
                      selectedPlatform === p.key
                        ? 'bg-black text-white'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base">{p.icon}</span>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedDomainId && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700">Snippet</span>
                {currentSnippet && (
                  <div className="flex items-center gap-2">
                    {selectedPlatform === 'cpanel' && snippetData?.apiBase && (
                      <>
                        <a
                          href={`${snippetData.apiBase}/shield.js/download`}
                          download
                          className="bg-white hover:bg-neutral-100 text-slate-700 border border-neutral-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <HugeiconsIcon icon={Download01Icon} className="w-3.5 h-3.5" />
                          Download .js File
                        </a>
                        <a
                          href={`${snippetData.apiBase}/shield/prepend.php/download?api_key=${snippetData.apiKey}`}
                          download
                          className="bg-white hover:bg-neutral-100 text-slate-700 border border-neutral-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <HugeiconsIcon icon={Download01Icon} className="w-3.5 h-3.5" />
                          Download prepend.php
                        </a>
                      </>
                    )}
                    <button
                      onClick={() => handleCopy(currentSnippet)}
                      className="bg-white hover:bg-neutral-100 text-slate-700 border border-neutral-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      {copiedSnippet ? (
                        <>
                          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-3.5 h-3.5 text-green-500" />
                          Copied
                        </>
                      ) : (
                        <>
                          <HugeiconsIcon icon={Copy01Icon} className="w-3.5 h-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
              {snippetLoading ? (
                <div className="bg-neutral-900 text-neutral-400 text-xs font-mono p-4 rounded-xl text-center">
                  Loading snippet…
                </div>
              ) : (
                <pre className="bg-neutral-900 text-neutral-100 text-xs font-mono p-4 rounded-xl overflow-x-auto">
                  <code>{currentSnippet}</code>
                </pre>
              )}
              <div className="mt-3">
                <h4 className="text-xs font-bold text-slate-700 mb-2">{currentGuide.icon} {currentGuide.name} — Quick Steps</h4>
                {selectedPlatform === 'cpanel' && currentGuide.altMethods ? (
                  <>
                    <div className="flex gap-1 mb-3 bg-slate-100 rounded-lg p-1">
                      {currentGuide.altMethods.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setCpanelMethod(m.id)}
                          className={`flex-1 text-[11px] font-bold px-3 py-1.5 rounded-md transition-all ${
                            cpanelMethod === m.id
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {m.label}
                          {m.id === 'php-include' && <span className="ml-1 text-[9px] text-emerald-600 font-extrabold">★</span>}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      const method = currentGuide.altMethods!.find((m) => m.id === cpanelMethod) || currentGuide.altMethods![0]
                      return (
                        <>
                          <ol className="space-y-1.5">
                            {method.steps.map((step, i) => (
                              <li key={i} className="flex gap-2 text-xs text-slate-600">
                                <span className="bg-slate-100 text-slate-500 w-5 h-5 rounded-full flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                                {step}
                              </li>
                            ))}
                          </ol>
                          <div className="mt-3">
                            <div className="flex items-center justify-between bg-neutral-900 rounded-lg px-3 py-2">
                              <code className="text-xs font-mono text-neutral-100 break-all">{method.iniSnippet}</code>
                              <button
                                onClick={() => handleCopy(method.iniSnippet)}
                                className="text-neutral-400 hover:text-white text-[10px] font-bold uppercase tracking-wider ml-2 shrink-0"
                              >
                                {copiedSnippet ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                            <p className="mt-1.5 text-[11px] text-amber-700 leading-relaxed">
                              {method.iniHint}
                            </p>
                          </div>
                        </>
                      )
                    })()}
                  </>
                ) : (
                  <>
                    <ol className="space-y-1.5">
                      {currentGuide.steps.map((step, i) => (
                        <li key={i} className="flex gap-2 text-xs text-slate-600">
                          <span className="bg-slate-100 text-slate-500 w-5 h-5 rounded-full flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                    {currentGuide.iniSnippet && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between bg-neutral-900 rounded-lg px-3 py-2">
                          <code className="text-xs font-mono text-neutral-100 break-all">{currentGuide.iniSnippet}</code>
                          <button
                            onClick={() => handleCopy(currentGuide.iniSnippet!)}
                            className="text-neutral-400 hover:text-white text-[10px] font-bold uppercase tracking-wider ml-2 shrink-0"
                          >
                            {copiedSnippet ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        {currentGuide.iniHint && (
                          <p className="mt-1.5 text-[11px] text-amber-700 leading-relaxed">
                            {currentGuide.iniHint}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {!scriptLive && selectedDomain && (
                <div className="mt-4 flex flex-col items-start gap-2">
                  <button
                    onClick={() => verifyMutation.mutate()}
                    disabled={verifyMutation.isPending}
                    className="inline-flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl bg-black text-white hover:bg-neutral-800 transition-colors disabled:opacity-50"
                  >
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4" />
                    {verifyMutation.isPending ? 'Checking your site…' : "I've added the script — Verify now"}
                  </button>
                  <Link
                    to="/app/domains"
                    className="text-xs text-muted hover:text-slate-900 transition-colors"
                  >
                    Manage domains →
                  </Link>
                </div>
              )}

              {snippetData?.apiBase && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-amber-800 mb-1">Using a Content-Security-Policy (CSP)?</p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    A strict CSP silently blocks the script. Allow this host in your policy:
                    add <code className="bg-amber-100 px-1 rounded font-mono">{snippetData.apiBase.replace(/\/$/, '')}</code> to
                    both <code className="bg-amber-100 px-1 rounded font-mono">script-src</code> and{' '}
                    <code className="bg-amber-100 px-1 rounded font-mono">connect-src</code>.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Pages covered by the script */}
        {scriptLive && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="text-sm font-bold text-slate-900">Pages covered by the script</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full shrink-0">
                Last 7 days
              </span>
            </div>
            <p className="text-sm text-muted leading-relaxed mb-4">
              Pages on <strong>{selectedDomain?.domain}</strong> where the script has reported visits.
            </p>

            {pagesLoading ? (
              <p className="text-sm text-neutral-500 py-4 text-center">Loading pages…</p>
            ) : !protectedPages || protectedPages.length === 0 ? (
              <div className="bg-slate-50 border border-neutral-200 rounded-xl p-6 text-center">
                <p className="text-sm font-bold text-slate-700 mb-1">No pages seen yet</p>
                <p className="text-xs text-muted leading-relaxed">
                  The script hasn't reported any visits in the last 7 days. Visit a page on your
                  site, then refresh here — it can take a moment.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold text-neutral-500 border-b border-neutral-200">
                      <th className="py-2 pr-4">Page</th>
                      <th className="py-2 pr-4 text-right">Visits</th>
                      <th className="py-2 pr-4 text-right">Bots</th>
                      <th className="py-2 text-right">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {protectedPages.map((p) => (
                      <tr key={p.path} className="border-b border-neutral-100 last:border-0">
                        <td className="py-2.5 pr-4 font-mono text-xs text-slate-800 break-all max-w-[280px]">
                          {p.path}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-bold text-slate-900">{p.visits}</td>
                        <td className="py-2.5 pr-4 text-right">
                          {p.bots > 0 ? (
                            <span className="text-red-600 font-bold">{p.bots}</span>
                          ) : (
                            <span className="text-neutral-400">0</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right text-xs text-neutral-500 whitespace-nowrap">
                          {p.lastSeen ? formatRelativeTime(p.lastSeen) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Protection Level */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-1">2. Protection Level</h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Choose how aggressively VeriClick handles detected bot traffic.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PROTECTION_MODES.map(({ value, label, description, icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setProtectionMode(value)}
                className={`p-5 rounded-xl border text-left transition-all ${
                  protectionMode === value
                    ? 'border-black bg-black/5 ring-1 ring-black/10'
                    : 'border-neutral-200 bg-white hover:border-neutral-400'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <HugeiconsIcon icon={icon} className="w-5 h-5" />
                  <span className="text-sm font-bold text-slate-900">{label}</span>
                </div>
                <span className="text-xs text-muted leading-relaxed">{description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* What happens to bots */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-1">3. What happens to bots</h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Choose the action taken when a bot is detected.
          </p>
          <select
            value={botAction}
            onChange={(e) => setBotAction(e.target.value as BotAction)}
            className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
          >
            {BOT_ACTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Safe destination URL */}
        {botAction === 'honeypot' && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-1">Safe destination URL</h2>
            <p className="text-sm text-muted leading-relaxed mb-4">
              Where bots will be redirected instead of being blocked.
            </p>
            <input
              type="text"
              inputMode="url"
              value={safeDestination}
              onChange={(e) => { setSafeDestination(e.target.value); setSaveError('') }}
              placeholder="https://example.com/safe-page"
              aria-invalid={!!saveError}
              aria-describedby={saveError ? 'safe-destination-error' : undefined}
              className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors ${
                saveError ? 'border-red-400 focus:border-red-500' : 'border-neutral-200 focus:border-black'
              }`}
            />
            {saveError && (
              <p id="safe-destination-error" className="text-xs text-red-600 mt-2">{saveError}</p>
            )}
          </div>
        )}

        {/* Save */}
        <div className="flex items-center justify-end gap-3">
          {isDirty && (
            <span className="text-xs text-muted">Unsaved changes</span>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
