import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { Logo } from '@/components/Logo'
import { CONTACT_EMAIL, COMPANY_NAME, COMPANY_URL, contactMailto } from '@/lib/site'

export function PublicFooter() {
  return (
    <footer className="py-20 px-6 border-t border-neutral-800/50">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between gap-12 mb-16">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                <Logo variant="dark" className="w-5 h-5 text-black" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">VeriClick</span>
            </div>
            <p className="text-neutral-400 leading-relaxed mb-6 text-sm">
              Link protection for real traffic. VeriClick verifies every click on your tracked links,
              blocks bots and suspicious requests, and explains each decision in plain language.
            </p>
            <div className="flex items-center gap-2 text-sm">
              <HugeiconsIcon icon={Mail01Icon} className="w-4 h-4 text-neutral-500" />
              <a href={contactMailto()} className="text-neutral-400 hover:text-white transition-colors">{CONTACT_EMAIL}</a>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-12">
            <div>
              <h5 className="font-bold text-white mb-5 text-sm">Product</h5>
              <ul className="space-y-3 text-sm text-neutral-400">
                <li><Link to="/app/dashboard" className="hover:text-white transition-colors">Dashboard</Link></li>
                <li><a href="/#features" className="hover:text-white transition-colors">Features</a></li>
                <li><Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link to="/app/help" className="hover:text-white transition-colors">Help & Docs</Link></li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold text-white mb-5 text-sm">Company</h5>
              <ul className="space-y-3 text-sm text-neutral-400">
                <li>
                  <a href={COMPANY_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white transition-colors">
                    {COMPANY_NAME} <HugeiconsIcon icon={ArrowUpRight01Icon} className="w-3.5 h-3.5" />
                  </a>
                </li>
                <li><a href={contactMailto('VeriClick contact')} className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <h5 className="font-bold text-white mb-5 text-sm">Support</h5>
              <p className="text-xs text-neutral-500 leading-relaxed mb-4">
                Free during beta. Ask the assistant (bottom-right) or email us — a human from
                {` ${COMPANY_NAME} `} will get back to you.
              </p>
              <a
                href={contactMailto()}
                className="inline-flex items-center gap-2 text-xs font-bold text-black bg-white hover:bg-neutral-200 px-4 py-2.5 rounded-lg transition-colors"
              >
                <HugeiconsIcon icon={Mail01Icon} className="w-4 h-4" />
                Email support
              </a>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 pt-8 border-t border-neutral-800/40 gap-4">
          <span>© 2026 {COMPANY_NAME}. All rights reserved.</span>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
