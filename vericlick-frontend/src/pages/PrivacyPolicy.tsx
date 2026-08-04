import { PublicNav } from '@/components/PublicNav'
import { PublicFooter } from '@/components/PublicFooter'
import { CONTACT_EMAIL, COMPANY_NAME, contactMailto } from '@/lib/site'

const SECTIONS = [
  {
    title: 'What VeriClick collects',
    body: [
      'Account information: your username and email address, plus the password you choose (stored as a secure hash). If you sign in with Google, we store the email Google provides.',
      'Workspace data: your workspace name, the domains you register, the tracked links you create, and their destination URLs.',
      'Click logs: for every click on a tracked link we record the IP address, user agent, and (where available) the country/region/city. This data powers bot detection and the dashboard analytics.',
      'Tracker events (optional): if you install the optional site script on pages you own, it sends browser signals (language, timezone, screen size, engagement) back to VeriClick.',
      'IP rules: the allow/deny rules and blocked-IP review records you create in your workspace.',
    ],
  },
  {
    title: 'How your data is used',
    body: [
      'To provide the service: routing and verifying clicks, detecting bots, and showing your dashboard statistics.',
      'To improve the product: aggregated, non-identifying patterns help us make detection more accurate.',
      'To support you: we may use your contact details to respond to support requests.',
    ],
  },
  {
    title: 'What we do not do',
    body: [
      'We do not sell your personal data.',
      'We do not run third-party advertising or analytics trackers on the VeriClick site.',
      'Your tracked links and their destinations are visible only to you and your workspace.',
    ],
  },
  {
    title: 'Data retention & deletion',
    body: [
      'We keep your data for as long as your account is active. If you delete your account, we remove your workspace data (links, domains, rules, and click logs) and your account details.',
      'Contact us to request account deletion at any time.',
    ],
  },
  {
    title: 'Contact',
    body: [
      `VeriClick is a product of ${COMPANY_NAME} (donlabs.site). Questions about this policy or your data can be sent to ${CONTACT_EMAIL}.`,
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
            Anything this page doesn't answer, email{' '}
            <a href={contactMailto('Privacy question')} className="text-white hover:text-neutral-300 font-medium">{CONTACT_EMAIL}</a>.
          </p>
        </div>
      </section>
      <PublicFooter />
    </div>
  )
}
