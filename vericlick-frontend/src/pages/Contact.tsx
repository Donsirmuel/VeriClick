import { useState } from 'react'
import { PublicNav } from '@/components/PublicNav'
import { PublicFooter } from '@/components/PublicFooter'
import { contactMailto } from '@/lib/site'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, ArrowRight01Icon, SparklesIcon } from '@hugeicons/core-free-icons'

export default function Contact() {
  const [subject, setSubject] = useState('VeriClick support request')
  const [body, setBody] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    window.location.href = contactMailto(subject.trim() || 'VeriClick support request', body.trim())
  }

  return (
    <div className="bg-black text-white selection:bg-white selection:text-black">
      <PublicNav featuresHref="/#features" />

      <section className="relative px-6 overflow-hidden">
        <div className="absolute inset-0 hero-grid-bg opacity-30" />
        <div className="max-w-4xl mx-auto text-center py-20 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-700/50 bg-neutral-900/60 text-xs font-bold text-neutral-300 uppercase tracking-wider mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse-dot" />
            Contact
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-5 leading-tight">Contact us</h1>
          <p className="text-neutral-400 text-lg leading-relaxed max-w-2xl mx-auto">
            Ask a question, report an issue, or tell us how we can make VeriClick better.
            We usually reply within a day.
          </p>
        </div>
      </section>

      <section className="max-w-xl mx-auto px-6 pb-24">
        <form onSubmit={handleSubmit} className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-5">
          <div>
            <label htmlFor="subject" className="block text-sm font-bold text-neutral-300 mb-2">Subject</label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="How can we help?"
              className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-bold text-neutral-300 mb-2">Message</label>
            <textarea
              id="message"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              required
              placeholder="Describe your question or issue..."
              className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600 transition-colors resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={!body.trim()}
            className="w-full inline-flex items-center justify-center gap-2 bg-white hover:bg-neutral-200 text-black px-6 py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 disabled:hover:bg-white"
          >
            <HugeiconsIcon icon={Mail01Icon} className="w-4 h-4" />
            Send message
            <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4" />
          </button>

          <p className="text-center text-xs text-neutral-500 leading-relaxed">
            This opens your email app with your message ready to send. Prefer to chat?
            Use the assistant bubble in the bottom-right corner for instant answers.
          </p>
        </form>

        <div className="mt-8 flex items-start gap-3 p-5 bg-neutral-950 border border-neutral-800 rounded-2xl">
          <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
            <HugeiconsIcon icon={SparklesIcon} className="w-4 h-4 text-neutral-300" />
          </div>
          <p className="text-sm text-neutral-400 leading-relaxed">
            In a hurry? Open the assistant in the bottom-right corner — it answers questions
            about the script, anti-bot, IP rules, pricing, and blocked traffic instantly.
          </p>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
