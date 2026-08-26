import { PublicNav } from '@/components/PublicNav'
import { PublicFooter } from '@/components/PublicFooter'

const SECTIONS = [
  {
    title: 'The service',
    body: 'VeriClick is a traffic-protection service with two parts. An anti-bot script, added to pages you own, detects automated visitors and can divert them to a safe page. Smart redirect links route clicks through our edge network, applying the same checks before forwarding a visitor to your destination. Both report into a dashboard. It is a product of MAILIONDEV TECHNOLOGY LTD (RC 9233525), referred to below as "VeriClick".',
  },
  {
    title: 'Accounts',
    body: 'You must provide accurate account information and keep your credentials secure. You are responsible for everything that happens under your account, including any sites you protect and the pages they point to. One free workspace is created per account.',
  },
  {
    title: 'Plans and payment',
    body: 'A paid plan is required to protect a site or run a redirect link. Plans are sold as one-time payments for a fixed period of access — 7 days or 30 days, whichever you choose at checkout. There is no automatic renewal and no recurring charge: nothing is taken from you again unless you buy another period yourself. Payments are made in cryptocurrency and are handled by our payment provider, who receives the details needed to process them.',
  },
  {
    title: 'When a period ends',
    body: 'Access lasts exactly as long as the period you paid for. When it ends, bot protection stops and redirect links stop forwarding visitors — there is no grace period beyond the paid date. We email you before the period ends and again when it does. Nothing is deleted: your domains, links, settings and traffic history remain, and buying another period restores them on the same links your visitors already have. Time you have not used is never taken away — if you buy again before your current period ends, the new period is added to the days you have left.',
  },
  {
    title: 'Acceptable use',
    body: 'You agree not to use VeriClick to break laws, send malware or phishing content, distribute harmful material, abuse other services, or otherwise use it in a way that harms others. The protection script must be installed only on pages you own and control. You may not use VeriClick to protect pages that violate any applicable law or third-party rights. We may suspend accounts, disable protection, and report abuse to hosting providers and law enforcement without prior notice.',
  },
  {
    title: 'Content responsibility',
    body: 'You are solely responsible for the content on every protected page. VeriClick does not monitor, review, or endorse content on protected pages. You warrant that you have all rights and permissions necessary to use each protected page and that its content does not infringe any third-party intellectual property, privacy, or other rights.',
  },
  {
    title: 'Takedowns and enforcement',
    body: 'We reserve the right to immediately disable protection or suspend any workspace that we reasonably believe is being used for phishing, malware distribution, fraud, or other abuse. We may cooperate with hosting providers, payment processors, and law-enforcement agencies in connection with abuse investigations. No refund is guaranteed for accounts suspended due to abuse.',
  },
  {
    title: 'Indemnification',
    body: 'You agree to indemnify, defend, and hold harmless VeriClick, MAILIONDEV TECHNOLOGY LTD, and their officers, directors, employees, and agents from any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising from or related to your use of the service, your violation of these Terms, or your violation of any law or third-party right.',
  },
  {
    title: 'No warranty',
    body: 'The service is provided "as is" and "as available". To the maximum extent permitted by law, VeriClick makes no warranties of any kind about the service, including that it will be uninterrupted, error-free, or fit for a particular purpose.',
  },
  {
    title: 'Limitation of liability',
    body: 'To the maximum extent permitted by law, VeriClick and MAILIONDEV TECHNOLOGY LTD are not liable for any indirect, incidental, or consequential damages arising from your use of the service, including but not limited to loss of data, revenue, or business.',
  },
  {
    title: 'Changes & contact',
    body: 'We may update these terms as the product evolves. Material changes will be announced via email. Questions or abuse reports can be sent through the contact button below or to Getvericlick18@gmail.com.',
  },
]

export default function TermsOfService() {
  return (
    <div className="bg-black text-white selection:bg-white selection:text-black">
      <PublicNav featuresHref="/#features" />
      <section className="max-w-3xl mx-auto px-6 py-20">
        <div className="mb-12">
          <div className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">Last updated: August 2026</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Terms of Service</h1>
          <p className="text-neutral-400 text-lg leading-relaxed">
            The short version: use VeriClick for its intended purpose, keep your account secure,
            and understand the paid plan requirements.
          </p>
        </div>

        <div className="space-y-10">
          {SECTIONS.map((section, i) => (
            <div key={section.title}>
              <h2 className="text-xl font-bold mb-3">{i + 1}. {section.title}</h2>
              <p className="text-neutral-300 leading-relaxed text-[15px]">{section.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 bg-neutral-950 border border-neutral-800 rounded-2xl p-6">
          <p className="text-sm text-neutral-400 leading-relaxed">
            Questions about these terms? Use the contact button below.
          </p>
        </div>
      </section>
      <PublicFooter />
    </div>
  )
}
