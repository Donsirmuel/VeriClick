import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Globe02Icon, LinkSquare02Icon, ShieldIcon, DashboardSquare01Icon, ArrowRight02Icon, Mail01Icon, PlayCircle02Icon, UserIcon } from '@hugeicons/core-free-icons'
import { PublicNav } from '@/components/PublicNav'
import { PublicFooter } from '@/components/PublicFooter'

const sections = [
  {
    icon: ShieldIcon,
    title: 'What VeriClick does',
    body: (
      <>
        VeriClick has two halves that share one bot-detection engine. The <strong>anti-bot script</strong> protects
        pages on your own site. <strong>Smart redirect links</strong> are short links on your domain that check a
        visitor before forwarding them to wherever you are sending them. Use either on its own, or both — a single
        verified domain covers the two.
      </>
    ),
  },
  {
    icon: Globe02Icon,
    title: 'Adding a domain',
    body: (
      <>
        Everything starts with a domain you own. Add it in <strong>Domains</strong> and verify it, either by pasting
        a meta tag into your site's{' '}
        <span className="font-mono text-xs bg-neutral-800 px-1 rounded">&lt;head&gt;</span> or by adding a DNS record —
        whichever is easier for you. Verification is what proves the domain is yours, so nobody else can protect it or
        build links on it.
      </>
    ),
  },
  {
    icon: LinkSquare02Icon,
    title: 'The anti-bot script',
    body: (
      <>
        One <strong>&lt;script&gt;</strong> tag, pasted into your site's{' '}
        <span className="font-mono text-xs bg-neutral-800 px-1 rounded">&lt;head&gt;</span>. It reads signals from each
        visitor — the browser they claim to be, how the page is being used, where the request came from — and decides
        whether it is a person. You choose what happens to the ones that are not: block them, quietly send them to a
        safe page of your choosing, or record them and let them through while you watch.
      </>
    ),
  },
  {
    icon: ArrowRight02Icon,
    title: 'Smart redirect links',
    body: (
      <>
        A redirect link lives on a subdomain of yours — something like{' '}
        <span className="font-mono text-xs bg-neutral-800 px-1 rounded">go.yoursite.com/promo</span> — and points
        wherever you want. Pointing that subdomain at us takes one CNAME record, which we show you when you create the
        link. Every click is checked before it is forwarded, so the traffic that reaches your destination is traffic
        worth having.
      </>
    ),
  },
  {
    icon: ShieldIcon,
    title: 'IP and country rules',
    body: (
      <>
        Every device on the internet has an address called an <strong>IP address</strong>. IP rules let you allow or
        block specific ones by hand. <strong>Allow</strong> rules are checked first and always win, so an address you
        trust is never flagged again. <strong>Deny</strong> rules come next, then automatic bot detection and rate
        limits. Country rules work the same way for whole regions.
      </>
    ),
  },
  {
    icon: DashboardSquare01Icon,
    title: 'Dashboard',
    body: 'One view over both halves: visits to your protected pages and clicks on your links, how many were bots, where they came from, and what was decided about each one. It fills in as traffic arrives — usually within a minute.',
  },
  {
    icon: UserIcon,
    title: 'Plans and your account',
    body: (
      <>
        Plans are one-time payments for a fixed stretch of access — 7 or 30 days — with no subscription and no automatic
        renewal. We email you before your access runs out; when it does, protection pauses and links stop forwarding
        until you renew, and nothing is deleted. Days you have not used carry over when you buy again. You can close
        your account any time in <strong>Settings → Account</strong>; it removes your workspace, domains, links and
        traffic data permanently, and asks you to type DELETE so it cannot happen by accident.
      </>
    ),
  },
]

const tutorialSteps = [
  {
    title: 'Create your account',
    steps: [
      <>Sign up with your email, or with Google.</>,
      <>Confirm the verification link we send you — accounts have to be verified before you can log in.</>,
    ],
  },
  {
    title: 'Choose a plan',
    steps: [
      <>Pick a tier by how many domains you need to cover; every tier has the same features.</>,
      <>Choose 7 or 30 days and pay once — by card, bank transfer, mobile money or crypto.</>,
      <>Access starts as soon as the payment clears. Nothing renews on its own.</>,
    ],
  },
  {
    title: 'Add and verify your domain',
    steps: [
      <>Open <strong>Domains</strong> and add the domain you want to cover.</>,
      <>Verify it with the meta tag or the DNS record we give you — whichever suits your setup.</>,
      <>Once it is verified, that one domain can run the anti-bot script and back your redirect links.</>,
    ],
  },
  {
    title: 'Install the script',
    steps: [
      <>Open <strong>Anti-Bot</strong> and copy the script tag generated for your site.</>,
      <>Paste it inside the <strong>&lt;head&gt;</strong> of your site and deploy. There are step-by-step guides for WordPress, Shopify, Wix, Squarespace and Webflow.</>,
      <>Visit your own site once, then check the <strong>Dashboard</strong> — your visit should appear within a minute.</>,
    ],
  },
  {
    title: 'Create a redirect link',
    steps: [
      <>Open <strong>Redirects</strong> and choose your verified domain, a short slug, and the destination.</>,
      <>Add the CNAME record we show you at your DNS provider — this is what points the subdomain at us.</>,
      <>Open the finished link yourself to confirm it forwards, then share it.</>,
    ],
  },
  {
    title: 'Tune it, then watch it',
    steps: [
      <>In <strong>Anti-Bot</strong>, decide what happens to bots: block, send to a safe page, or log only.</>,
      <>In <strong>Traffic Rules</strong>, add IP or country rules, and allow anything you know is friendly.</>,
      <>Check the dashboard as traffic builds — the activity feed shows what was decided about each visitor and why.</>,
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
