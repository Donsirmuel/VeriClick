import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle02Icon, ArrowRight01Icon, Mail01Icon, ZapIcon, ShieldIcon, Globe02Icon, LockIcon, Chart03Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons'
import { PublicNav } from '@/components/PublicNav'
import { PublicFooter } from '@/components/PublicFooter'
import { contactMailto, CONTACT_EMAIL } from '@/lib/site'

const INCLUDED = [
  'Unlimited tracked links',
  'Bot detection and rate limiting on every click',
  'IP allow/deny rules with whitelisting',
  'Domain health checks (automatic, in-app)',
  'DNS TXT domain ownership verification',
  'Dashboard with traffic chart and activity feed',
  'Blocked-IP review queue with plain-language reasons',
  'Safe destination routing for flagged traffic',
  'Email support',
]

const HIGHLIGHTS = [
  { icon: LinkSquare02Icon, title: 'Tracked links', desc: 'Short links for any destination, with a human/bot breakdown for every click.' },
  { icon: ShieldIcon, title: 'Click verification', desc: 'Every request is checked against IP rules, bot signatures, and rate limits before it reaches your page.' },
  { icon: Globe02Icon, title: 'Domain health + ownership', desc: 'Domains are health-checked automatically and ownership is proven with a DNS TXT record.' },
  { icon: Chart03Icon, title: 'Live dashboard', desc: 'Traffic chart, activity feed, domain health, and a blocked-IP review queue — all explained in plain language.' },
]

export default function Pricing() {
  return (
    <div className="bg-black text-white selection:bg-white selection:text-black">
      <PublicNav featuresHref="/#features" />

      {/* Hero */}
      <section className="relative px-6 overflow-hidden">
        <div className="absolute inset-0 hero-grid-bg opacity-30" />
        <div className="max-w-4xl mx-auto text-center py-24 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-700/50 bg-neutral-900/60 text-xs font-bold text-neutral-300 uppercase tracking-wider mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse-dot" />
            Pricing
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Free while it's<br />in beta
          </h1>
          <p className="text-lg text-neutral-400 max-w-2xl mx-auto mb-4 leading-relaxed">
            VeriClick is an MVP in active development, and it's free. No credit card, no trial clock,
            no feature gates — everything below is included.
          </p>
        </div>
      </section>

      {/* Plan card */}
      <section className="px-6 pb-20">
        <div className="max-w-3xl mx-auto">
          <div className="bg-neutral-950 border border-neutral-800 rounded-3xl p-8 md:p-10 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-white/20 to-transparent" />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-2xl font-bold">Free</h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-black bg-white px-2 py-1 rounded-full">Beta</span>
                </div>
                <div className="text-4xl font-bold mb-1">
                  $0<span className="text-base text-neutral-500 font-normal">/month</span>
                </div>
                <p className="text-sm text-neutral-400">Everything included while VeriClick is in beta.</p>
              </div>
              <Link
                to="/auth/register"
                className="inline-flex items-center justify-center gap-2 bg-white hover:bg-neutral-200 text-black px-8 py-4 rounded-xl text-lg font-bold transition-all group self-start"
              >
                Get started free
                <HugeiconsIcon icon={ArrowRight01Icon} className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3 border-t border-neutral-800 pt-8">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-neutral-300">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4 text-neutral-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 bg-neutral-900/40 border border-neutral-800/60 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-10 h-10 bg-neutral-800 rounded-xl flex items-center justify-center shrink-0">
              <HugeiconsIcon icon={LockIcon} className="w-5 h-5 text-neutral-300" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold mb-1">Paid plans are coming later</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                We're focused on making VeriClick reliable before charging for it. When paid plans launch,
                they'll be announced on this page and to existing users first.
              </p>
            </div>
            <a href={contactMailto('Question about VeriClick pricing')} className="inline-flex items-center gap-2 text-sm font-bold text-white border border-neutral-700 hover:border-neutral-500 px-4 py-2.5 rounded-xl transition-colors shrink-0">
              <HugeiconsIcon icon={Mail01Icon} className="w-4 h-4" />
              Ask us
            </a>
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="px-6 pb-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything free includes</h2>
            <p className="text-neutral-400 max-w-2xl mx-auto">The full VeriClick product, with no limits during beta.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HIGHLIGHTS.map((f) => (
              <div key={f.title} className="bg-neutral-950 border border-neutral-800/80 p-6 rounded-2xl">
                <div className="w-10 h-10 bg-neutral-800/70 rounded-xl flex items-center justify-center mb-4">
                  <HugeiconsIcon icon={f.icon} className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-neutral-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-28">
        <div className="max-w-4xl mx-auto text-center bg-neutral-950 border border-neutral-800 rounded-3xl p-10 md:p-16 relative overflow-hidden">
          <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/1 rounded-full blur-[100px] pointer-events-none" />
          <HugeiconsIcon icon={ZapIcon} className="w-8 h-8 mx-auto mb-6" />
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Set up your first tracked link in minutes</h2>
          <p className="text-neutral-400 text-lg mb-8 max-w-xl mx-auto">
            Create a free account, add your domain, and start protecting your links today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth/register" className="bg-white hover:bg-neutral-200 text-black px-8 py-4 rounded-xl text-lg font-bold transition-all">
              Get started free
            </Link>
            <a href={contactMailto()} className="inline-flex items-center gap-2 border border-neutral-700 hover:border-neutral-500 px-8 py-4 rounded-xl text-lg font-bold transition-colors">
              <HugeiconsIcon icon={Mail01Icon} className="w-5 h-5" />
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
