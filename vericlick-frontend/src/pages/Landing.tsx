import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon, ShieldIcon, ZapIcon, Globe02Icon, Chart03Icon, LockIcon,
  Activity01Icon, ServerStackIcon, EyeIcon, FingerPrintIcon, Tick02Icon,
  LinkSquare02Icon, CheckmarkCircle02Icon, UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { PublicNav } from '@/components/PublicNav'
import { PublicFooter } from '@/components/PublicFooter'
import { useState, useEffect, useRef } from 'react'

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.style.opacity = '1'
          node.style.transform = 'translateY(0)'
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])
  return { ref }
}

function AnimatedBlock({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            node.style.opacity = '1'
            node.style.transform = 'translateY(0)'
          }, delay)
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [delay])
  return (
    <div ref={ref} className={className} style={{ opacity: 0, transform: 'translateY(24px)', transition: 'opacity 0.7s ease-out, transform 0.7s ease-out' }}>
      {children}
    </div>
  )
}

const VERIFICATION_LINES = [
  { text: '> POST /api/v1/collect', delay: 0 },
  { text: '> IP rules: checked — no allow/deny match', delay: 700 },
  { text: '> Device signals: canvas + TLS fingerprint', delay: 1400 },
  { text: '  └─ matches known bot signature', delay: 1800 },
  { text: '> Decision: BLOCK (automated request)', delay: 2400 },
  { text: '> Action: bot blocked before page loads', delay: 3000 },
  { text: '> Reason logged: "Request looked automated"', delay: 3600 },
]

function LiveTerminal() {
  const [visibleLines, setVisibleLines] = useState(0)
  const [loopKey, setLoopKey] = useState(0)

  useEffect(() => {
    if (visibleLines < VERIFICATION_LINES.length) {
      const line = VERIFICATION_LINES[visibleLines]
      const nextDelay = visibleLines === 0 ? line.delay : line.delay - VERIFICATION_LINES[visibleLines - 1].delay
      const timer = setTimeout(() => setVisibleLines(prev => prev + 1), nextDelay)
      return () => clearTimeout(timer)
    } else {
      const timer = setTimeout(() => {
        setVisibleLines(0)
        setLoopKey(prev => prev + 1)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [visibleLines, loopKey])

  return (
    <div className="bg-black rounded-2xl border border-neutral-800 overflow-hidden shadow-2xl shadow-white/5">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800/80 bg-neutral-900/30">
        <div className="w-3 h-3 rounded-full bg-neutral-600" />
        <div className="w-3 h-3 rounded-full bg-neutral-600" />
        <div className="w-3 h-3 rounded-full bg-neutral-600" />
        <span className="text-[10px] font-mono text-neutral-500 ml-2">vericlick-shield</span>
        <span className="ml-auto text-[10px] font-mono text-neutral-600">live</span>
      </div>
      <div className="p-5 font-mono text-[11px] leading-loose min-h-70">
        {VERIFICATION_LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={`${loopKey}-${i}`}
            className="whitespace-pre"
            style={{
              animation: 'fade-in-up 0.3s ease-out forwards',
              opacity: 0,
              color: line.text.includes('Decision: BLOCK')
                ? '#EF4444'
                : line.text.startsWith('  ')
                  ? '#525252'
                  : '#737373',
            }}
          >
            {line.text}
          </div>
        ))}
        <span className="terminal-cursor inline-block" />
      </div>
    </div>
  )
}

function HeroVisual() {
  const [failed, setFailed] = useState(false)

  return (
    <div className="bg-black rounded-2xl border border-neutral-800 overflow-hidden shadow-2xl shadow-white/5">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800/80 bg-neutral-900/30">
        <div className="w-3 h-3 rounded-full bg-neutral-600" />
        <div className="w-3 h-3 rounded-full bg-neutral-600" />
        <div className="w-3 h-3 rounded-full bg-neutral-600" />
        <span className="text-[10px] font-mono text-neutral-500 ml-2">vericlick-shield</span>
        <span className="ml-auto text-[10px] font-mono text-neutral-600">live</span>
      </div>
      {failed ? (
        <LiveTerminal />
      ) : (
        <video
          className="w-full h-auto aspect-video object-cover bg-black"
          autoPlay
          muted
          loop
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          preload="auto"
          poster="/hero_poster.jpg"
          onError={() => setFailed(true)}
        >
          <source src="/hero_animation.mp4" type="video/mp4" />
        </video>
      )}
    </div>
  )
}

function FloatingParticles() {
  const particles = useRef(
    Array.from({ length: 25 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 5,
      duration: Math.random() * 4 + 4,
    }))
  ).current

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full bg-white/[0.07]"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animation: `float ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

const HERO_POINTS = [
  { title: 'Simple plans', desc: 'Basic, Plus, and Pro.' },
  { title: 'IP allow/deny rules', desc: 'Allow rules always win.' },
  { title: 'Two ways in', desc: 'A script tag, a redirect link, or both.' },
  { title: 'Every decision explained', desc: 'Plain-language reasons.' },
]

const FEATURES = [
  { icon: LinkSquare02Icon, title: 'Script-based protection', desc: 'Paste one script tag into your site\'s head. Every visitor is verified before your page loads — no DNS changes needed.' },
  { icon: ArrowRight01Icon, title: 'Smart redirect links', desc: 'Short links on your own domain that check every click before forwarding it. Bots are stopped at the link; real people reach your destination.' },
  { icon: FingerPrintIcon, title: 'Device fingerprinting', desc: 'Canvas fingerprinting, mouse trajectory analysis, and TLS fingerprinting identify real users from automated traffic in milliseconds.' },
  { icon: LockIcon, title: 'IP rules', desc: 'Allow trusted addresses through and deny known-bad ones. Allow rules are checked first and always win, so whitelisted IPs are never flagged again.' },
  { icon: Globe02Icon, title: 'Real-time bot detection', desc: 'Every visitor is analyzed in real time against known bot signatures, behavioral patterns, and proof-of-work challenges.' },
  { icon: ServerStackIcon, title: 'Safe routing', desc: 'Suspicious traffic is blocked before your page loads — never a 403, never a broken experience for real visitors.' },
  { icon: Chart03Icon, title: 'Live dashboard', desc: 'Traffic chart, activity feed, visitor breakdown, and a blocked-IP review queue — with a plain-language reason for every decision.' },
]

const STEPS = [
  { step: 1, title: 'Verify your domain', desc: 'Add the domain you want to cover and prove it is yours with a meta tag or a DNS record. One verified domain covers both the script and your links.', icon: Globe02Icon },
  { step: 2, title: 'Add the script, a link, or both', desc: 'Paste the snippet into your site\'s <head> — HTML, WordPress, Shopify, Next.js, anything — or create a short link on your domain and point it wherever you like.', icon: LinkSquare02Icon },
  { step: 3, title: 'Bots stopped, humans through', desc: 'Every visit and every click is checked against your rules, then bot detection, then rate limits. Real visitors never notice; everything else is logged with a reason.', icon: ShieldIcon },
]

const USE_CASES = [
  { title: 'E-commerce stores', desc: 'Protect product pages and checkout flows from scalper bots, credential stuffing, and inventory scrapers.', icon: UserGroupIcon },
  { title: 'Paid traffic and campaigns', desc: 'Send ad clicks through a redirect link so bot traffic is filtered out before it ever reaches your landing page — or your ad budget.', icon: Activity01Icon },
  { title: 'Traffic review', desc: 'Inspect who visits your site, see why anyone was blocked, and whitelist a mistake in one click.', icon: EyeIcon },
  { title: 'Automation bursts', desc: 'Slow and divert bursts of automated requests with rate limiting and proof-of-work challenges so they never reach your page.', icon: ZapIcon },
]

const REASON_LABELS = [
  'Human traffic — let through',
  'Allowed by a trusted-IP rule',
  'Blocked by a deny rule you created',
  'Request looked automated (bot-like browser)',
  'Blocked — too many requests from this address',
  'Blocked by automated detection',
]

const HERO_WORDS = ['Visitor', 'Traffic', 'Session', 'Request']

function RotatingWord() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % HERO_WORDS.length)
    }, 2500)
    return () => clearInterval(timer)
  }, [])

  return (
    <span
      key={index}
      className="inline-block w-auto min-w-[6ch] text-left pr-2"
      style={{ animation: 'word-in 0.5s ease-out forwards' }}
    >
      {HERO_WORDS[index]},
    </span>
  )
}

export default function Landing() {
  const heroStats = useInView(0.2)

  return (
    <div className="bg-black text-white selection:bg-white selection:text-black">
      <PublicNav />

      {/* ─── Hero Section ─── */}
      <section className="relative min-h-[92vh] flex items-center px-6 overflow-hidden">
        <div className="absolute inset-0 hero-grid-bg opacity-40" />
        <div className="scan-line" />
        <FloatingParticles />
        <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-175 h-175 bg-white/1.5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-125 h-125 bg-white/1 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto w-full relative z-10 py-24">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-700/50 bg-neutral-900/60 backdrop-blur-sm text-xs font-bold text-neutral-300 uppercase tracking-wider mb-8 opacity-0" style={{ animation: 'fade-in-up 0.6s ease-out 0.1s forwards' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse-dot" />
                Website protection for real traffic
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[5.5rem] font-bold tracking-tight mb-8 leading-[0.95] opacity-0" style={{ animation: 'fade-in-up 0.7s ease-out 0.2s forwards' }}>
                Every <RotatingWord /><br />
                <span className="text-gradient">verified.</span>
              </h1>

              <p className="text-lg md:text-xl text-neutral-400 mb-10 leading-relaxed max-w-lg opacity-0" style={{ animation: 'fade-in-up 0.6s ease-out 0.35s forwards' }}>
                Bots stopped before they reach your site or your links. Humans never notice.
                From $25 a week.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 mb-14 opacity-0" style={{ animation: 'fade-in-up 0.6s ease-out 0.45s forwards' }}>
                <Link to="/auth/register" className="w-full sm:w-auto bg-white hover:bg-neutral-200 text-black px-8 py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-2 transition-all group shadow-lg shadow-white/5">
                  Get started
                  <HugeiconsIcon icon={ArrowRight01Icon} className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link to="/app/dashboard" className="w-full sm:w-auto bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700/50 px-8 py-4 rounded-xl text-lg font-bold transition-all text-center">
                  See dashboard
                </Link>
              </div>

              <div ref={heroStats.ref} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-8 border-t border-neutral-800/60 pt-10 opacity-0" style={{ animation: 'fade-in-up 0.6s ease-out 0.55s forwards' }}>
                {HERO_POINTS.map((p) => (
                  <div key={p.title}>
                    <div className="flex items-center gap-2 mb-1">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4 text-neutral-400" />
                      <div className="text-sm md:text-base font-bold text-white leading-tight">{p.title}</div>
                    </div>
                    <div className="text-[11px] text-neutral-500 leading-snug">{p.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="opacity-0" style={{ animation: 'slide-in-right 0.8s ease-out 0.4s forwards' }}>
              <HeroVisual />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Trust Bar ─── */}
      <div className="border-y border-neutral-800/50 bg-neutral-950/40">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">What sets VeriClick apart</p>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-neutral-500">
              <div className="flex items-center gap-2 text-sm font-medium"><HugeiconsIcon icon={Tick02Icon} className="w-4 h-4 text-white/40" /> Simple, flat pricing</div>
              <div className="flex items-center gap-2 text-sm font-medium"><HugeiconsIcon icon={Tick02Icon} className="w-4 h-4 text-white/40" /> Your site. Your rules.</div>
              <div className="flex items-center gap-2 text-sm font-medium"><HugeiconsIcon icon={Tick02Icon} className="w-4 h-4 text-white/40" /> Every decision explained</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Features Grid ─── */}
      <section id="features" className="py-16 sm:py-24 lg:py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <AnimatedBlock>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800/50 border border-neutral-700/40 text-white text-xs font-bold uppercase tracking-wider mb-6">
                Capabilities
              </div>
            </AnimatedBlock>
            <AnimatedBlock delay={80}>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">Built to protect every visitor</h2>
            </AnimatedBlock>
            <AnimatedBlock delay={160}>
              <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
                Everything runs inside VeriClick — from device fingerprinting to real-time bot detection — with
                a plain-language explanation for every decision it makes.
              </p>
            </AnimatedBlock>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <AnimatedBlock key={f.title} delay={i * 60}>
                <div className="group bg-neutral-950 border border-neutral-800/80 p-7 rounded-2xl hover:border-neutral-600/60 transition-all duration-300 h-full relative overflow-hidden">
                  <div className="absolute inset-0 bg-linear-to-br from-white/2 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="w-11 h-11 bg-neutral-800/70 rounded-xl flex items-center justify-center mb-5 text-white group-hover:bg-neutral-700/70 group-hover:scale-110 transition-all duration-300">
                    <HugeiconsIcon icon={f.icon} className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                  <p className="text-neutral-400 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </AnimatedBlock>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="py-16 sm:py-24 lg:py-32 px-6 bg-neutral-950/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <AnimatedBlock>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800/50 border border-neutral-700/40 text-white text-xs font-bold uppercase tracking-wider mb-6">
                The Pipeline
              </div>
            </AnimatedBlock>
            <AnimatedBlock delay={80}>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">Three steps to verified traffic</h2>
            </AnimatedBlock>
            <AnimatedBlock delay={160}>
              <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
                VeriClick sits between your visitors and your page, making a split-second decision
                for every single request.
              </p>
            </AnimatedBlock>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-24 left-[16%] right-[16%] h-px bg-linear-to-r from-neutral-700/0 via-neutral-700/50 to-neutral-700/0" />
            {STEPS.map((item, i) => (
              <AnimatedBlock key={item.step} delay={i * 100}>
                <div className="group relative bg-black border border-neutral-800 p-8 rounded-2xl hover:border-neutral-600/60 transition-all duration-500">
                  <div className="absolute -top-4 -left-4 w-10 h-10 bg-white text-black rounded-full flex items-center justify-center font-bold text-lg shadow-lg shadow-white/10">
                    {item.step}
                  </div>
                  <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                    <div className="absolute inset-x-0 h-px bg-linear-to-r from-transparent via-white/15 to-transparent opacity-0 group-hover:opacity-100 group-hover:animate-[scan_2s_ease-in-out_infinite] transition-opacity" />
                  </div>
                  <div className="w-12 h-12 bg-neutral-800/80 rounded-xl flex items-center justify-center mb-6 text-white group-hover:scale-110 group-hover:bg-neutral-700 transition-all duration-300">
                    <HugeiconsIcon icon={item.icon} className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                  <p className="text-neutral-400 leading-relaxed text-sm">{item.desc}</p>
                </div>
              </AnimatedBlock>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Use Cases + Reasons ─── */}
      <section className="py-16 sm:py-24 lg:py-32 px-6">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <AnimatedBlock>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800/50 border border-neutral-700/40 text-white text-xs font-bold uppercase tracking-wider mb-6">
                  Use Cases
                </div>
              </AnimatedBlock>
              <AnimatedBlock delay={60}>
                <h2 className="text-4xl md:text-5xl font-bold mb-10 leading-tight">Where VeriClick fits.</h2>
              </AnimatedBlock>
              <div className="space-y-6">
                {USE_CASES.map((uc, i) => (
                  <AnimatedBlock key={uc.title} delay={120 + i * 60}>
                    <div className="flex gap-4 p-5 rounded-xl border border-transparent hover:border-neutral-800/60 hover:bg-neutral-950/40 transition-all duration-300">
                      <div className="mt-0.5 shrink-0">
                        <div className="w-10 h-10 rounded-xl bg-neutral-800/50 border border-neutral-700/40 flex items-center justify-center">
                          <HugeiconsIcon icon={uc.icon} className="w-5 h-5 text-neutral-300" />
                        </div>
                      </div>
                      <div>
                        <h4 className="text-lg font-bold mb-1.5">{uc.title}</h4>
                        <p className="text-neutral-400 text-sm leading-relaxed">{uc.desc}</p>
                      </div>
                    </div>
                  </AnimatedBlock>
                ))}
              </div>
            </div>

            <AnimatedBlock delay={200}>
              <div className="bg-black rounded-2xl border border-neutral-800 shadow-2xl shadow-white/5 relative overflow-hidden lg:sticky lg:top-24">
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-white/2 rounded-full blur-3xl pointer-events-none" />
                <div className="flex items-center justify-between mb-6 border-b border-neutral-800/80 px-6 py-4 bg-neutral-900/20">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-neutral-600" />
                    <div className="w-3 h-3 rounded-full bg-neutral-600" />
                    <div className="w-3 h-3 rounded-full bg-neutral-600" />
                  </div>
                  <div className="text-xs font-mono text-neutral-500">Every decision, explained</div>
                </div>
                <div className="px-6 py-5 relative z-10 space-y-2.5">
                  {REASON_LABELS.map((label) => (
                    <div
                      key={label}
                      className={`flex items-center gap-3 text-sm font-mono px-4 py-2.5 rounded-lg border ${
                        label.startsWith('Human') || label.startsWith('Allowed')
                          ? 'text-neutral-200 border-neutral-800 bg-neutral-900/40'
                          : 'text-neutral-400 border-neutral-800/70 bg-neutral-950/60'
                      }`}
                    >
                      <HugeiconsIcon
                        icon={label.startsWith('Human') || label.startsWith('Allowed') ? CheckmarkCircle02Icon : Tick02Icon}
                        className={`w-4 h-4 shrink-0 ${label.startsWith('Human') || label.startsWith('Allowed') ? 'text-neutral-300' : 'text-neutral-600'}`}
                      />
                      <span className="text-xs">{label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-800/60 bg-neutral-900/10">
                  <div className="text-xs text-neutral-500 font-mono">These are the exact labels your dashboard shows.</div>
                  <Link to="/contact" className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-bold text-neutral-300 hover:border-neutral-500 hover:text-white transition-colors">
                    Contact us
                  </Link>
                </div>
              </div>
            </AnimatedBlock>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-16 sm:py-24 lg:py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <AnimatedBlock>
            <h2 className="text-4xl md:text-6xl font-bold mb-8 leading-tight">
              Keep bots off<br />your site.
            </h2>
          </AnimatedBlock>
          <AnimatedBlock delay={100}>
            <p className="text-neutral-400 text-lg mb-12 max-w-xl mx-auto">
              Pick a plan, paste the script, and start protecting your site today.
            </p>
          </AnimatedBlock>
          <AnimatedBlock delay={200}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/auth/register" className="bg-white hover:bg-neutral-200 text-black px-10 py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-2 transition-all group shadow-lg shadow-white/5">
                Get started
                <HugeiconsIcon icon={ArrowRight01Icon} className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/pricing" className="border border-neutral-700 hover:border-neutral-500 hover:bg-neutral-900/50 px-10 py-4 rounded-xl text-lg font-bold transition-all text-center">
                View pricing
              </Link>
            </div>
            <p className="text-sm text-neutral-500 mt-6">
              Questions? Use the contact button in the footer.
            </p>
          </AnimatedBlock>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
