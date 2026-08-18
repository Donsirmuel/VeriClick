import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { Logo } from '@/components/Logo'
import { COMPANY_NAME, COMPANY_URL } from '@/lib/site'

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
              Website protection for real traffic. VeriClick verifies every visitor on your site,
              blocks bots and suspicious requests, and explains each decision in plain language.
            </p>
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:border-neutral-500 hover:bg-neutral-800/50"
            >
              <HugeiconsIcon icon={Mail01Icon} className="w-4 h-4" />
              Contact us
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-12">
            <div>
              <h5 className="font-bold text-white mb-5 text-sm">Product</h5>
              <ul className="space-y-3 text-sm text-neutral-400">
                <li><Link to="/app/dashboard" className="hover:text-white transition-colors">Dashboard</Link></li>
                <li><a href="/#features" className="hover:text-white transition-colors">Features</a></li>
                <li><Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link to="/help" className="hover:text-white transition-colors">Help & Docs</Link></li>
              </ul>
            </div>

            <div>
              <h5 className="font-bold text-white mb-5 text-sm">Company</h5>
              <ul className="space-y-3 text-sm text-neutral-400">
                <li>
                  <a href={COMPANY_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white transition-colors">
                    Built by {COMPANY_NAME} <HugeiconsIcon icon={ArrowUpRight01Icon} className="w-3.5 h-3.5" />
                  </a>
                </li>
              </ul>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <h5 className="font-bold text-white mb-5 text-sm">Support</h5>
              <p className="text-xs text-neutral-500 leading-relaxed mb-4">
                Plans start at a few dollars a month. Ask the assistant in the bottom-right or use the contact button.
              </p>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-xs font-bold text-black transition-colors hover:bg-neutral-200"
              >
                <HugeiconsIcon icon={Mail01Icon} className="w-4 h-4" />
                Contact support
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-neutral-800/40 pt-8 text-xs text-neutral-500">
          <span>© 2026 MAILIONDEV TECHNOLOGY LTD (RC 9233525)</span>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link to="/contact" className="hover:text-white transition-colors">Report Abuse</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
