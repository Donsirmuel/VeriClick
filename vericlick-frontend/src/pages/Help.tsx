import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Globe02Icon, LinkSquare02Icon, ShieldIcon, DashboardSquare01Icon, ArrowRight02Icon, Mail01Icon, UserIcon } from '@hugeicons/core-free-icons'

const sections = [
  {
    icon: ShieldIcon,
    title: 'The two halves',
    searchText: 'script protection smart redirect engine',
    body: (
      <>
        The <strong>anti-bot script</strong> protects pages on your own site. <strong>Smart redirect links</strong> are
        short links on your domain that check a visitor before forwarding them on. Both run through the same detection
        engine, and one verified domain covers the two — use either, or both.
      </>
    ),
  },
  {
    icon: Globe02Icon,
    title: 'Domains',
    searchText: 'domain verify ownership meta tag dns record delete domain',
    body: (
      <>
        Everything starts with a domain you own. Add it under <strong>Domains</strong> and verify it with the meta tag
        or the DNS record — whichever is easier. Verification proves the domain is yours. Deleting a domain frees its
        slot straight away and removes any redirect link on it, so you are asked to confirm first.
      </>
    ),
  },
  {
    icon: LinkSquare02Icon,
    title: 'The anti-bot script',
    searchText: 'script anti bot install head block safe page telemetry',
    body: (
      <>
        One <strong>&lt;script&gt;</strong> tag from the <strong>Anti-Bot</strong> page, pasted into your site's{' '}
        <span className="font-mono text-xs bg-neutral-100 px-1 rounded">&lt;head&gt;</span>. It reads signals from each
        visitor and decides whether it is a person. You choose what happens to the rest: block them, send them quietly
        to a safe page you nominate, or just record them and let them through.
      </>
    ),
  },
  {
    icon: ArrowRight02Icon,
    title: 'Redirect links',
    searchText: 'redirect link cname dns destination click renew',
    body: (
      <>
        A link like <span className="font-mono text-xs bg-neutral-100 px-1 rounded">go.yoursite.com/promo</span> that
        points wherever you choose. Creating one gives you a CNAME record to add at your DNS provider — that is what
        points the subdomain at us. Every click is checked before it is forwarded. Links last as long as your plan
        period, and renewing extends the ones you already have.
      </>
    ),
  },
  {
    icon: ShieldIcon,
    title: 'Traffic rules',
    searchText: 'traffic rules ip allow block country device operating system',
    body: (
      <>
        Every device on the internet has an address called an <strong>IP address</strong>. IP rules let you allow or
        block specific ones. <strong>Allow</strong> rules are checked first and always win, so an address you trust is
        never flagged again. <strong>Deny</strong> rules come next, then automatic detection and rate limits. Country
        and device rules work the same way.
      </>
    ),
  },
  {
    icon: DashboardSquare01Icon,
    title: 'Dashboard',
    searchText: 'dashboard visits clicks countries devices analytics activity',
    body: 'Visits to your protected pages and clicks on your links, together: how many were bots, which countries and devices they came from, and what was decided about each one. New traffic usually appears within a minute.',
  },
  {
    icon: UserIcon,
    title: 'Plan and account',
    searchText: 'plan billing payment subscription account settings delete',
    body: (
      <>
        Plans are one-time payments for 7 or 30 days — no subscription, nothing renews on its own. We email you before
        your access ends; when it does, protection pauses and links stop forwarding until you renew, and nothing is
        deleted. Unused days carry over when you buy again. You can close your account in{' '}
        <strong>Settings → Account</strong>; it removes your workspace, domains, links and traffic data permanently,
        and asks you to type DELETE so it cannot happen by accident.
      </>
    ),
  },
]

export default function HelpPage() {
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const visibleSections = query
    ? sections.filter((section) => `${section.title} ${section.searchText}`.toLowerCase().includes(query))
    : sections

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Help & Docs</h1>
          <p className="text-sm text-muted mt-1">How VeriClick protects your site and your links.</p>
        </div>
      </div>

      <div className="bg-slate-900 rounded-2xl p-5 mb-6">
        <label htmlFor="help-search" className="block text-sm font-bold text-white mb-2">
          Search help
        </label>
        <input
          id="help-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Try domains, script, redirects, billing…"
          className="w-full bg-white text-slate-900 rounded-xl px-4 py-3 text-sm outline-none ring-0 focus:ring-2 focus:ring-white/40"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {visibleSections.map((section) => (
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

      {visibleSections.length === 0 && (
        <div className="bg-white border border-border rounded-2xl p-8 text-center">
          <h2 className="text-base font-bold text-slate-900 mb-1">No matching help topic</h2>
          <p className="text-sm text-muted mb-4">Try a different search or contact support.</p>
          <Link to="/contact" className="inline-flex items-center gap-2 bg-black text-white px-4 py-2.5 rounded-xl text-sm font-bold">
            <HugeiconsIcon icon={Mail01Icon} className="w-4 h-4" />
            Contact support
          </Link>
        </div>
      )}

      <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 mt-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <HugeiconsIcon icon={ArrowRight02Icon} className="w-5 h-5" />
          Getting Started
        </h2>
        <ol className="space-y-3 text-sm text-neutral-300 leading-relaxed">
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center shrink-0">1</span>
            <span>Add your domain under <strong>Domains</strong> and verify it</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <span>Copy the script tag from <strong>Anti-Bot</strong> into your site's <strong>&lt;head&gt;</strong> and deploy</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center shrink-0">3</span>
            <span>Create a link under <strong>Redirects</strong> and add the CNAME record it gives you</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center shrink-0">4</span>
            <span>Visit your own site and open your own link, then check the <strong>Dashboard</strong> — both should show up within a minute</span>
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