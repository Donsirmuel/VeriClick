import { PublicNav } from '@/components/PublicNav'
import { PublicFooter } from '@/components/PublicFooter'

const SECTIONS = [
  {
    title: 'The service',
    body: 'VeriClick is a link-protection service. It creates tracked links, verifies clicks on those links, diverts suspicious traffic to a safe destination, and provides analytics in a dashboard. It is a product of MAILIONDEV TECHNOLOGY LTD (RC 9233525), referred to below as "VeriClick".',
  },
  {
    title: 'Accounts',
    body: 'You must provide accurate account information and keep your credentials secure. You are responsible for everything that happens under your account, including any links you create and the destinations they point to. One free workspace is created per account.',
  },
  {
    title: 'Free trial & plans',
    body: 'New accounts get a free 7-day trial with 1 domain and 1 link. After the trial, a paid plan is required to keep creating links and domains; your existing tracked links continue to work. Paid plans are billed monthly through our payment provider.',
  },
  {
    title: 'Acceptable use',
    body: 'You agree not to use VeriClick to break laws, send malware or phishing content, distribute harmful material, abuse other services, or otherwise use it in a way that harms others. Every tracked link must resolve on a domain you own and control. You may not use VeriClick links to redirect to destinations that violate any applicable law or third-party rights. We may suspend accounts, disable links, and report abuse to hosting providers and law enforcement without prior notice.',
  },
  {
    title: 'Content responsibility',
    body: 'You are solely responsible for the content at every destination URL you use with VeriClick. VeriClick does not monitor, review, or endorse destination content. You warrant that you have all rights and permissions necessary to use each destination URL and that such content does not infringe any third-party intellectual property, privacy, or other rights.',
  },
  {
    title: 'Takedowns and enforcement',
    body: 'We reserve the right to immediately disable any link or suspend any workspace that we reasonably believe is being used for phishing, malware distribution, fraud, or other abuse. We may cooperate with domain registrars, hosting providers, payment processors, and law-enforcement agencies in connection with abuse investigations. No refund is guaranteed for accounts suspended due to abuse.',
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
    body: 'We may update these terms as the product evolves. Material changes will be announced via email. Questions or abuse reports can be sent through the contact button below or to support@donlabs.site.',
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
            and understand the free trial limits and paid plans.
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
