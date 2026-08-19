import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Shield02Icon,
  DashboardSquare02Icon,
  Globe02Icon,
  LinkSquare02Icon,
  ShieldIcon,
  ArrowRight01Icon,
  ArrowLeft02Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'

const TOUR_KEY = 'vericlick_tour_completed'

interface TourStep {
  title: string
  body: string
  icon: typeof Shield02Icon
}

const STEPS: TourStep[] = [
  {
    title: 'Welcome to VeriClick',
    body: 'VeriClick protects your website from bots and suspicious traffic. Every visit is verified before it reaches your page.',
    icon: Shield02Icon,
  },
  {
    title: 'Your Dashboard',
    body: "This is where you'll see traffic, blocked visitors, and protection status at a glance.",
    icon: DashboardSquare02Icon,
  },
  {
    title: 'Add Your Domain',
    body: 'Register the domain you want to protect. Your plan covers a set number of domains — add it here first.',
    icon: Globe02Icon,
  },
  {
    title: 'Install the Script',
    body: 'Paste a single script tag on your site. VeriClick starts protecting your website immediately.',
    icon: LinkSquare02Icon,
  },
  {
    title: 'Configure Your Shield',
    body: 'Set your protection mode — strict, balanced, or monitor. Your rules, your site.',
    icon: ShieldIcon,
  },
  {
    title: 'Traffic Rules',
    body: 'Set IP allow/deny rules, block countries, and configure device policies.',
    icon: ShieldIcon,
  },
]

interface ProductTourProps {
  onComplete: () => void
}

export function ProductTour({ onComplete }: ProductTourProps) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  const skip = () => {
    localStorage.setItem(TOUR_KEY, '1')
    onComplete()
  }

  const next = () => {
    if (isLast) {
      localStorage.setItem(TOUR_KEY, '1')
      onComplete()
    } else {
      setStep(step + 1)
    }
  }

  const prev = () => {
    if (step > 0) setStep(step - 1)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip()
      if (e.key === 'Enter') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full mx-4 p-8 sm:p-10">
        {/* Close */}
        <button
          onClick={skip}
          className="absolute top-4 right-4 p-1 text-neutral-400 hover:text-neutral-700 transition-colors"
          aria-label="Skip tour"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5" />
        </button>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-black' : i < step ? 'w-2 bg-black/40' : 'w-2 bg-neutral-200'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 flex items-center justify-center shrink-0">
            <HugeiconsIcon icon={Icon} className="w-6 h-6 text-slate-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">{current.title}</h3>
            <p className="text-sm text-neutral-500 leading-relaxed">{current.body}</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={prev}
            disabled={step === 0}
            className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={skip}
              className="text-sm text-neutral-400 hover:text-neutral-700 transition-colors"
            >
              Skip tour
            </button>
            <button
              onClick={next}
              className="flex items-center gap-1.5 bg-black hover:bg-neutral-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
            >
              {isLast ? 'Get started' : 'Next'}
              {!isLast && <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* On last step, link to pricing */}
        {isLast && (
          <Link
            to="/pricing"
            onClick={skip}
            className="mt-4 block text-center text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            Or browse plans on the Pricing page
          </Link>
        )}
      </div>
    </div>
  )
}

export function hasCompletedTour(): boolean {
  return localStorage.getItem(TOUR_KEY) === '1'
}
