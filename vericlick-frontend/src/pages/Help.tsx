import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Globe02Icon, LinkSquare02Icon, ShieldIcon, DashboardSquare01Icon, ArrowRight02Icon, Mail01Icon, UserIcon } from '@hugeicons/core-free-icons'

const sections = [
  {
    icon: Globe02Icon,
    title: 'Script Installation',
    body: (
      <>
        Your site is protected by a single <strong>&lt;script&gt;</strong> tag — no custom domains, no DNS changes.
        Copy the script tag from the <strong>Install</strong> page and paste it in your site's{' '}
        <span className="font-mono text-xs bg-neutral-100 px-1 rounded">&lt;head&gt;</span>.
        That's it — VeriClick starts collecting visitor signals and blocking bots automatically.
      </>
    ),
  },
  {
    icon: LinkSquare02Icon,
    title: 'Bot Detection',
    body: (
      <>
        The script collects device signals — browser fingerprint, mouse movement, click timing, and more — and sends them
        for analysis on every page load. Visitors flagged as bots are shown a challenge page instead of your real content.
        Legitimate visitors pass through with no friction.
      </>
    ),
  },
  {
    icon: ShieldIcon,
    title: 'IP Rules',
    body: (
      <>
        Every computer has a unique number on the internet called an <strong>IP address</strong>. IP Rules let you allow
        or block specific addresses from reaching your site. <strong>Allow</strong> rules are checked first and always win,
        so whitelisted addresses are never flagged again. <strong>Deny</strong> rules are checked next, followed by automatic
        bot detection and rate limits.
      </>
    ),
  },
  {
    icon: DashboardSquare01Icon,
    title: 'Dashboard',
    body: 'Shows your traffic, recent activity, and how many bots have been detected and blocked. The numbers update automatically as visitors interact with your site.',
  },
  {
    icon: UserIcon,
    title: 'Your account',
    body: (
      <>
        Your login email is shown in <strong>Settings → Account</strong>. You can close your account there too — it removes
        your workspace, sites, and traffic data permanently. It asks you to type DELETE to confirm, so it can't
        happen by accident.
      </>
    ),
  },
]

export default function HelpPage() {
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Help & Docs</h1>
          <p className="text-sm text-muted mt-1">Everything you need to protect your website with VeriClick.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {sections.map((section) => (
          <div key={section.title} className="bg-white rounded-2xl border border-border p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                <HugeiconsIcon icon={section.icon} className="w-5 h-5 text-slate-900" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">{section.title}</h2>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{section.body}</p>
          </div>
        ))}
      </div>

      <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 mt-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <HugeiconsIcon icon={ArrowRight02Icon} className="w-5 h-5" />
          Getting Started
        </h2>
        <ol className="space-y-3 text-sm text-neutral-300 leading-relaxed">
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center shrink-0">1</span>
            <span>Go to <strong>Install</strong> and copy the script tag</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <span>Paste it in your site's <strong>&lt;head&gt;</strong> and deploy</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center shrink-0">3</span>
            <span>VeriClick starts collecting visitor signals automatically</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center shrink-0">4</span>
            <span>Check the <strong>Dashboard</strong> to see traffic and blocked bots</span>
          </li>
        </ol>
      </div>

      <div className="bg-white rounded-2xl border border-border p-6 mt-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-3">Still stuck?</h2>
        <p className="text-sm text-slate-700 leading-relaxed mb-4">
          Ask the assistant (the chat bubble in the bottom-right corner) a question, or use the contact
          button below to reach a human.
        </p>
        <Link
          to="/contact"
          className="inline-flex items-center gap-2 bg-black hover:bg-neutral-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors"
        >
          <HugeiconsIcon icon={Mail01Icon} className="w-4 h-4" />
          Contact us
        </Link>
      </div>
    </div>
  )
}