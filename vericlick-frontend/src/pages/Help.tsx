import { HugeiconsIcon } from '@hugeicons/react'
import { Globe02Icon, LinkSquare02Icon, ShieldIcon, DashboardSquare01Icon, ArrowRight02Icon } from '@hugeicons/core-free-icons'

const sections = [
  {
    icon: Globe02Icon,
    title: 'Domains',
    body: 'A domain is the web address your links live on (like your.domain). Add your domain first, then create links under it. A domain marked Verified means a scheduled health check confirmed it resolves.',
  },
  {
    icon: LinkSquare02Icon,
    title: 'Links',
    body: (
      <>
        Each link has a short code called a <strong>slug</strong> (e.g. summer23). When someone visits your.domain/r/summer23,
        VeriClick checks if they are a bot or a real person before redirecting them to your destination URL. Flagged requests
        are sent to your safe destination instead of your real page.
      </>
    ),
  },
  {
    icon: ShieldIcon,
    title: 'IP Rules',
    body: (
      <>
        An IP address is a computer's unique identifier on the internet. IP Rules let you allow or block specific IP addresses
        from reaching your links. <strong>Allow</strong> rules are checked first and always win, so whitelisted IPs are never
        flagged again. <strong>Deny</strong> rules are checked next, followed by automated bot detection and rate limits.
      </>
    ),
  },
  {
    icon: DashboardSquare01Icon,
    title: 'Dashboard',
    body: 'Shows your traffic stats, recent activity, and how many bots have been detected and blocked.',
  },
]

export default function HelpPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Help & Docs</h1>
          <p className="text-sm text-muted mt-1">Everything you need to get started with VeriClick.</p>
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
            <span>Go to <strong>Domains</strong> and add your domain</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <span>Go to <strong>Links</strong> and create your first link</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center shrink-0">3</span>
            <span>Share the short URL — VeriClick handles the rest</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center shrink-0">4</span>
            <span>Check the <strong>Dashboard</strong> to see traffic and blocked bots</span>
          </li>
        </ol>
      </div>
    </div>
  )
}
