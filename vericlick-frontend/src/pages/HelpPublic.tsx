import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Globe02Icon, LinkSquare02Icon, ShieldIcon, DashboardSquare01Icon, ArrowRight02Icon, Mail01Icon, PlayCircle02Icon, UserIcon } from '@hugeicons/core-free-icons'
import { PublicNav } from '@/components/PublicNav'
import { PublicFooter } from '@/components/PublicFooter'

const sections = [
  {
    icon: Globe02Icon,
    title: 'Script Installation',
    body: (
      <>
        Your site is protected by a single <strong>&lt;script&gt;</strong> tag — no custom domains, no DNS changes.
        Copy the script tag from the <strong>Install</strong> page and paste it in your site's{' '}
        <span className="font-mono text-xs bg-neutral-800 px-1 rounded">&lt;head&gt;</span>.
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

const tutorialSteps = [
  {
    title: 'Create your account',
    steps: [
      <>Sign up with your email and confirm the verification link we send you — accounts have to be verified before you can log in.</>,
    ],
  },
  {
    title: 'Install the script',
    steps: [
      <>Open <strong>Install</strong> and copy the script tag VeriClick generates for you.</>,
      <>Paste it inside the <strong>&lt;head&gt;</strong> of your website and deploy your changes.</>,
      <>The script starts collecting visitor signals immediately — no further configuration needed.</>,
    ],
  },
  {
    title: 'Test it',
    steps: [
      <>Visit your site in a normal browser — you should see your pages load as usual.</>,
      <>Open the <strong>Dashboard</strong> to confirm traffic is being captured in real time.</>,
      <>Try accessing your site with a known bot tool — it should be flagged and shown a challenge page.</>,
    ],
  },
  {
    title: 'Configure protection',
    steps: [
      <>Under <strong>IP Rules</strong>, add allow/deny rules for specific addresses as needed.</>,
      <>Adjust challenge and rate-limit settings to match your traffic patterns.</>,
      <>Review blocked IPs regularly and whitelist trusted sources.</>,
    ],
  },
  {
    title: 'Watch the dashboard',
    steps: [
      <>Your traffic chart, activity feed, and blocked-bot count update automatically.</>,
      <>Review blocked IPs and add allow/deny rules under <strong>IP Rules</strong> so good visitors keep flowing.</>,
    ],
  },
]

export default function HelpPublicPage() {
  return (
    <div className="bg-black text-white selection:bg-white selection:text-black">
      <PublicNav featuresHref="/#features" />

      <section className="relative px-6 overflow-hidden">
        <div className="absolute inset-0 hero-grid-bg opacity-30" />
        <div className="max-w-4xl mx-auto text-center py-20 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-700/50 bg-neutral-900/60 text-xs font-bold text-neutral-300 uppercase tracking-wider mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse-dot" />
            Help & Docs
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">Everything you need to get started</h1>
          <p className="mt-5 text-lg text-neutral-400 max-w-2xl mx-auto">
            How VeriClick protects your website, step by step.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 pb-24 relative z-10">
        <div className="grid md:grid-cols-2 gap-4">
          {sections.map((section) => (
            <div key={section.title} className="bg-neutral-900/60 rounded-2xl border border-neutral-800 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center">
                  <HugeiconsIcon icon={section.icon} className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">{section.title}</h2>
              </div>
              <p className="text-sm text-neutral-300 leading-relaxed">{section.body}</p>
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

        <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 mt-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <HugeiconsIcon icon={PlayCircle02Icon} className="w-5 h-5" />
            Tutorial — your first protected site
          </h2>
          <div className="space-y-6">
            {tutorialSteps.map((step, i) => (
              <div key={step.title} className="flex gap-4">
                <div className="flex flex-col items-center shrink-0">
                  <span className="w-8 h-8 rounded-full bg-white text-black text-sm font-extrabold flex items-center justify-center">{i + 1}</span>
                  {i < tutorialSteps.length - 1 && <span className="w-px flex-1 bg-neutral-700 mt-2" />}
                </div>
                <div className="pt-1.5">
                  <h3 className="text-base font-bold text-white mb-2">{step.title}</h3>
                  <ul className="space-y-1.5 text-sm text-neutral-300 leading-relaxed">
                    {step.steps.map((s, j) => (
                      <li key={j} className="flex gap-2">
                        <span className="text-neutral-500 mt-2">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Still stuck?</h2>
            <p className="text-sm text-neutral-400">Ask the assistant (the chat bubble in the bottom-right corner) or reach a human.</p>
          </div>
          <Link
            to="/contact"
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-neutral-200 text-black px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0"
          >
            <HugeiconsIcon icon={Mail01Icon} className="w-4 h-4" />
            Contact us
          </Link>
        </div>
      </div>

      <PublicFooter />
    </div>
  )
}
