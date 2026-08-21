import { PublicNav } from '@/components/PublicNav'
import { PublicFooter } from '@/components/PublicFooter'

const SECTIONS = [
  {
    title: 'What VeriClick collects',
    body: [
      'Account information: your username and email address, plus the password you choose (stored as a secure hash). If you sign in with Google, we store the email Google provides.',
      'Workspace data: your workspace name, the sites you protect, and their protected pages.',
      'Click logs: for every visit to a protected page we record the IP address, user agent, device type, and (where available) the country/region/city. This data powers bot detection and the dashboard analytics.',
      'Redirect click logs: when someone clicks one of your smart redirect links, our edge network records the same details before forwarding them to your destination. Visitors are not tracked after they arrive there.',
      'Tracker events (optional): if you install the protection script on pages you own, it sends browser signals (language, timezone, screen size, engagement) back to VeriClick.',
      'IP rules: the allow/deny rules and blocked-IP review records you create in your workspace.',
    ],
  },
  {
    title: 'How your data is used',
    body: [
      'To provide the service: detecting bots, protecting your site, and showing your dashboard statistics.',
      'To improve the product: aggregated, non-identifying patterns help us make detection more accurate.',
      'To support you: we may use your contact details to respond to support requests.',
    ],
  },
  {
    title: 'What we do not do',
    body: [
      'We do not sell your personal data.',
      'We do not see or store your card details. Payments are processed by our payment provider, who receives your email address and the plan you bought in order to take the payment and issue a receipt.',
      'We do not run third-party advertising or analytics trackers on the VeriClick site.',
      'Your protected sites and their traffic data are visible only to you and your workspace.',
    ],
  },
  {
    title: 'Data retention & deletion',
    body: [
      'We keep your data for as long as your account is active.',
      'You can delete your account yourself at any time, from Settings. Doing so removes your account and everything in your workspace — protected sites, redirect links, rules, settings, traffic logs and billing history — and it cannot be undone. Redirect links stop working within a minute of deletion.',
      'If you would rather we did it for you, or you want a copy of your data first, contact us.',
    ],
  },
  {
    title: 'Contact',
    body: [
      'Questions about this policy or your data can be sent through the contact button below.',
    ],
  },
]

export default function PrivacyPolicy() {
  return (
    <div className="bg-black text-white selection:bg-white selection:text-black">
      <PublicNav featuresHref="/#features" />
      <section className="max-w-3xl mx-auto px-6 py-20">
        <div className="mb-12">
          <div className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">Last updated: August 2026</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Privacy Policy</h1>
          <p className="text-neutral-400 text-lg leading-relaxed">
            A plain-language description of what VeriClick stores, why, and how you can control it.
          </p>
        </div>

        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="text-2xl font-bold mb-4">{section.title}</h2>
              <ul className="space-y-3">
                {section.body.map((item) => (
                  <li key={item} className="text-neutral-300 leading-relaxed text-[15px] flex gap-3">
                    <span className="text-neutral-600 select-none">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 bg-neutral-950 border border-neutral-800 rounded-2xl p-6">
          <p className="text-sm text-neutral-400 leading-relaxed">
            Anything this page doesn't answer, use the contact button below.
          </p>
        </div>
      </section>
      <PublicFooter />
    </div>
  )
}
