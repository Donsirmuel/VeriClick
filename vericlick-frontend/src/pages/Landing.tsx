import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon, ShieldIcon, ZapIcon, Globe02Icon, Chart03Icon, LockIcon, Copy01Icon,
  Activity01Icon, ServerStackIcon, EyeIcon, FingerPrintIcon, Tick02Icon, UserGroupIcon, TradeUpIcon,
} from '@hugeicons/core-free-icons'
import { Logo } from '@/components/Logo'
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

function useCountUp(end: number, duration = 2000) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const hasAnimated = useRef(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true
          const startTime = performance.now()
          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setCount(Math.floor(eased * end))
            if (progress < 1) requestAnimationFrame(animate)
          }
          requestAnimationFrame(animate)
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [end, duration])
  return { count, ref }
}

const VERIFICATION_LINES = [
  { text: '> Connecting to VeriClick relay...', delay: 0 },
  { text: '> Fingerprint acquired: b07f1a2c', delay: 800 },
  { text: '> Evaluating 15 fraud signals...', delay: 1600 },
  { text: '  ├─ headless_browser: true', delay: 2000 },
  { text: '  ├─ vpn_detected: true', delay: 2200 },
  { text: '  └─ datacenter_ip: true', delay: 2400 },
  { text: '> Risk score: 98/100', delay: 2800 },
  { text: '> Verdict: BOT', delay: 3200 },
  { text: '> Action: Redirected to safe page', delay: 3600 },
  { text: '> Complete in 34ms', delay: 4000 },
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
        <span className="text-[10px] font-mono text-neutral-500 ml-2">vericlick-relay</span>
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
              color: line.text.includes('Verdict:') || line.text.includes('Risk score:')
                ? '#EF4444'
                : line.text.includes('Complete')
                  ? '#ffffff'
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

const FEATURES = [
  { icon: FingerPrintIcon, title: 'Browser Fingerprinting', desc: 'Generate unique device fingerprints from 50+ signals to identify return visitors and botnets.' },
  { icon: ShieldIcon, title: 'Real-time Scoring', desc: 'Score every click against 15+ fraud signals in under 50ms with zero impact on user experience.' },
  { icon: Globe02Icon, title: 'Domain Rotation', desc: 'Automatically rotate across 850+ clean domains to maintain sender reputation and deliverability.' },
  { icon: EyeIcon, title: 'Traffic Classification', desc: 'Instantly classify visitors as human, bot, crawler, or VPN/proxy with 99.2% accuracy.' },
  { icon: ServerStackIcon, title: 'Safe Page Routing', desc: 'Silently redirect suspicious traffic to compliant safe pages while humans reach your destination.' },
  { icon: Activity01Icon, title: 'Live Monitoring', desc: 'Watch traffic flow in real-time. Get instant alerts on bot spikes, domain blacklists, and anomalies.' },
]

const STEPS = [
  { step: 1, title: 'Link Created', desc: 'Generate a short link mapped to our rotating infrastructure. Zero setup required — just paste your destination URL.', icon: Globe02Icon },
  { step: 2, title: 'Traffic Intercepted', desc: 'Our engine builds a unique fingerprint and scores 15+ fraud signals in real-time as each click arrives.', icon: ZapIcon },
  { step: 3, title: 'Human Routed', desc: 'Humans reach your destination. Bots and crawlers are quietly routed to a safe page. Decision in <50ms.', icon: ShieldIcon },
]

const USE_CASES = [
  { title: 'Cold Email Outreach', desc: 'Shield your sender reputation from security gateway crawls and automated link analysis tools that flag cold campaigns.', icon: UserGroupIcon },
  { title: 'Paid Advertising', desc: 'Ensure your ad pixel only fires for real human conversions. Stop paying for bot activity inflating your CPA.', icon: TradeUpIcon },
  { title: 'SMS & Messaging', desc: 'Serve dynamic link previews to scrapers while keeping the real destination for actual users on messaging platforms.', icon: ZapIcon },
  { title: 'Affiliate Tracking', desc: 'Protect your commission rates from non-human traffic and automated bot farms designed to steal attribution.', icon: LockIcon },
]

export default function Landing() {
  const [demoUrl, setDemoUrl] = useState('')
  const heroStats = useInView(0.2)

  const humans = useCountUp(14, 2000)
  const bots = useCountUp(2, 2000)
  const domains = useCountUp(850, 2000)

  return (
    <div className="bg-black text-white selection:bg-white selection:text-black">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto border-b border-neutral-800/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <Logo variant="dark" className="w-5 h-5 text-black" />
          </div>
          <span className="text-xl font-bold tracking-tight">VeriClick</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-400">
          <Link to="/" className="hover:text-white transition-colors">Home</Link>
          <Link to="/app/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#" className="hover:text-white transition-colors">Pricing</a>
          <a href="#" className="hover:text-white transition-colors">Docs</a>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/auth/login" className="hidden sm:block text-sm font-medium text-neutral-400 hover:text-white transition-colors">Log in</Link>
          <Link to="/auth/login" className="bg-white hover:bg-neutral-200 text-black px-4 py-2 rounded-lg text-sm font-semibold transition-all">
            Get Started
          </Link>
        </div>
      </nav>

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
                Real-time traffic verification
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-[5.5rem] font-bold tracking-tight mb-8 leading-[0.95] opacity-0" style={{ animation: 'fade-in-up 0.7s ease-out 0.2s forwards' }}>
                Every click,<br />
                <span className="text-gradient">verified.</span>
              </h1>

              <p className="text-lg md:text-xl text-neutral-400 mb-10 leading-relaxed max-w-lg opacity-0" style={{ animation: 'fade-in-up 0.6s ease-out 0.35s forwards' }}>
                Real-time traffic interception and domain rotation for elite operators.
                Verify every click in &lt;50ms. Shield your sender reputation. Maximize your ROI.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 mb-14 opacity-0" style={{ animation: 'fade-in-up 0.6s ease-out 0.45s forwards' }}>
                <Link to="/auth/login" className="w-full sm:w-auto bg-white hover:bg-neutral-200 text-black px-8 py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-2 transition-all group shadow-lg shadow-white/5">
                  Start protecting now
                  <HugeiconsIcon icon={ArrowRight01Icon} className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link to="/app/dashboard" className="w-full sm:w-auto bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700/50 px-8 py-4 rounded-xl text-lg font-bold transition-all text-center">
                  See dashboard
                </Link>
              </div>

              <div ref={heroStats.ref} className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 border-t border-neutral-800/60 pt-10 opacity-0" style={{ animation: 'fade-in-up 0.6s ease-out 0.55s forwards' }}>
                <div ref={humans.ref}>
                  <div className="text-3xl md:text-4xl font-bold text-white mb-1 tabular-nums">{humans.count}M+</div>
                  <div className="text-[11px] text-neutral-500 uppercase tracking-wider font-medium">Humans Verified</div>
                </div>
                <div ref={bots.ref}>
                  <div className="text-3xl md:text-4xl font-bold text-white mb-1 tabular-nums">{bots.count}.8M+</div>
                  <div className="text-[11px] text-neutral-500 uppercase tracking-wider font-medium">Bots Intercepted</div>
                </div>
                <div ref={domains.ref}>
                  <div className="text-3xl md:text-4xl font-bold text-white mb-1 tabular-nums">{domains.count}+</div>
                  <div className="text-[11px] text-neutral-500 uppercase tracking-wider font-medium">Domains Rotated</div>
                </div>
                <div>
                  <div className="text-3xl md:text-4xl font-bold text-white mb-1">&lt;50<span className="text-base text-neutral-500 font-normal">ms</span></div>
                  <div className="text-[11px] text-neutral-500 uppercase tracking-wider font-medium">Avg Latency</div>
                </div>
              </div>
            </div>

            <div className="opacity-0 hidden lg:block" style={{ animation: 'slide-in-right 0.8s ease-out 0.4s forwards' }}>
              <LiveTerminal />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Trust Bar ─── */}
      <div className="border-y border-neutral-800/50 bg-neutral-950/40">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Trusted by operators running</p>
              <div className="flex items-center gap-10 text-neutral-500">
              <div className="flex items-center gap-2 text-sm font-medium"><HugeiconsIcon icon={Tick02Icon} className="w-4 h-4 text-white/40" /> SOC 2 Compliant</div>
              <div className="flex items-center gap-2 text-sm font-medium"><HugeiconsIcon icon={Tick02Icon} className="w-4 h-4 text-white/40" /> 99.98% Uptime</div>
              <div className="flex items-center gap-2 text-sm font-medium"><HugeiconsIcon icon={Tick02Icon} className="w-4 h-4 text-white/40" /> GDPR Ready</div>
              <div className="hidden sm:flex items-center gap-2 text-sm font-medium"><HugeiconsIcon icon={Tick02Icon} className="w-4 h-4 text-white/40" /> ISO 27001</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Live Demo ─── */}
      <section className="py-28 px-6 bg-neutral-950/50">
        <div className="max-w-4xl mx-auto text-center">
          <AnimatedBlock>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800/60 border border-neutral-700/40 text-neutral-300 text-xs font-bold uppercase tracking-wider mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse-dot" />
              Live Demo
            </div>
          </AnimatedBlock>
          <AnimatedBlock delay={80}>
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Test your traffic source</h2>
          </AnimatedBlock>
          <AnimatedBlock delay={160}>
            <p className="text-neutral-400 mb-10 text-lg max-w-2xl mx-auto">
              Paste any tracking URL to see how our fingerprinting engine classifies the request in real-time.
            </p>
          </AnimatedBlock>
          <AnimatedBlock delay={240}>
            <div className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto">
              <input
                type="text"
                placeholder="https://your-link.com/slug"
                className="flex-1 bg-black border border-neutral-800 rounded-xl px-6 py-4 focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/10 transition-all text-white placeholder:text-neutral-600 font-mono text-sm"
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
              />
              <button className="bg-white hover:bg-neutral-200 text-black px-8 py-4 rounded-xl font-bold transition-all whitespace-nowrap flex items-center justify-center gap-2 group">
                Verify Link
                <HugeiconsIcon icon={ZapIcon} className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
            </div>
          </AnimatedBlock>
        </div>
      </section>

      {/* ─── Features Grid ─── */}
      <section id="features" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <AnimatedBlock>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800/50 border border-neutral-700/40 text-white text-xs font-bold uppercase tracking-wider mb-6">
                Capabilities
              </div>
            </AnimatedBlock>
            <AnimatedBlock delay={80}>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">Built to protect every click</h2>
            </AnimatedBlock>
            <AnimatedBlock delay={160}>
              <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
                A full-stack traffic verification engine. From fingerprinting to domain rotation, every component is engineered for speed and accuracy.
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
      <section className="py-32 px-6 bg-neutral-950/30">
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
                VeriClick sits between your traffic source and your destination, making a split-second decision for every single visitor.
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

      {/* ─── Use Cases + Code Block ─── */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <AnimatedBlock>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800/50 border border-neutral-700/40 text-white text-xs font-bold uppercase tracking-wider mb-6">
                  Use Cases
                </div>
              </AnimatedBlock>
              <AnimatedBlock delay={60}>
                <h2 className="text-4xl md:text-5xl font-bold mb-10 leading-tight">Built for high-stakes traffic operations.</h2>
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
                  <div className="text-xs font-mono text-neutral-500">POST /api/click → 200 OK</div>
                </div>
                <pre className="font-mono text-[13px] leading-relaxed overflow-x-auto px-6 py-5 relative z-10">
                  <code className="text-neutral-300">
{`{
  "click_id": `}<span className="text-white">"1140655...d00d"</span>{`,
  "verdict": `}<span className="text-error">"BOT"</span>{`,
  "risk_score": `}<span className="text-error">98</span>{`,
  "signals": {
    "headless": true,
    "vpn_proxy": true,
    "datacenter": true
  },
  "action": `}<span className="text-white">"REDIRECT_TO_SAFE_PAGE"</span>{`,
  "latency_ms": `}<span className="text-neutral-500">34</span>{`
}`}
                  </code>
                </pre>
                <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-800/60 bg-neutral-900/10">
                  <div className="text-xs text-neutral-500 font-mono">Fingerprint: b07f1a2c...74a</div>
                  <button className="text-neutral-500 hover:text-white transition-colors">
                    <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </AnimatedBlock>
          </div>
        </div>
      </section>

      {/* ─── Stats Bar ─── */}
      <section className="py-20 px-6 border-y border-neutral-800/50 bg-neutral-950/40">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
            {[
              { value: '99.2%', label: 'Detection Accuracy' },
              { value: '<50ms', label: 'Average Decision Time' },
              { value: '2.8M+', label: 'Bots Blocked Monthly' },
              { value: '14.2M+', label: 'Humans Verified' },
            ].map((stat, i) => (
              <AnimatedBlock key={stat.label} delay={i * 80}>
                <div className="text-3xl md:text-4xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-sm text-neutral-500 font-medium">{stat.label}</div>
              </AnimatedBlock>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <AnimatedBlock>
            <h2 className="text-4xl md:text-6xl font-bold mb-8 leading-tight">
              Ready to eliminate<br />bot traffic?
            </h2>
          </AnimatedBlock>
          <AnimatedBlock delay={100}>
            <p className="text-neutral-400 text-lg mb-12 max-w-xl mx-auto">
              Join 850+ operators who protect their traffic with VeriClick. Setup takes less than 2 minutes — no credit card required.
            </p>
          </AnimatedBlock>
          <AnimatedBlock delay={200}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/auth/login" className="bg-white hover:bg-neutral-200 text-black px-10 py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-2 transition-all group shadow-lg shadow-white/5">
                Get started free
                <HugeiconsIcon icon={ArrowRight01Icon} className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/app/dashboard" className="border border-neutral-700 hover:border-neutral-500 hover:bg-neutral-900/50 px-10 py-4 rounded-xl text-lg font-bold transition-all text-center">
                View live dashboard
              </Link>
            </div>
          </AnimatedBlock>
        </div>
      </section>

      {/* ─── Footer ─── */}
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
              <p className="text-neutral-400 leading-relaxed mb-8 text-sm">
                The standard in link protection and traffic routing.
                Built for those who demand total control over their traffic.
              </p>
              <div className="flex gap-3">
                {[Globe02Icon, Chart03Icon, LockIcon].map((icon, i) => (
                  <div key={i} className="w-9 h-9 rounded-full bg-neutral-800/50 border border-neutral-700/40 flex items-center justify-center hover:bg-neutral-700 cursor-pointer transition-colors">
                    <HugeiconsIcon icon={icon} className="w-4 h-4 text-neutral-400" />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-12">
              <div>
                <h5 className="font-bold text-white mb-5 text-sm">Product</h5>
                <ul className="space-y-3 text-sm text-neutral-400">
                  <li><Link to="/app/dashboard" className="hover:text-white transition-colors">Dashboard</Link></li>
                  <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">API Reference</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Changelog</a></li>
                </ul>
              </div>
              <div>
                <h5 className="font-bold text-white mb-5 text-sm">Company</h5>
                <ul className="space-y-3 text-sm text-neutral-400">
                  <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                </ul>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <h5 className="font-bold text-white mb-5 text-sm">Stay Updated</h5>
                <p className="text-xs text-neutral-500 mb-4">Product updates and traffic security insights.</p>
                <div className="flex gap-2">
                  <input type="email" placeholder="you@company.com" className="bg-neutral-800/50 border border-neutral-700/40 rounded-lg px-3 py-2 text-xs w-full focus:outline-none focus:border-white/40 transition-colors placeholder:text-neutral-600" />
                  <button className="bg-white hover:bg-neutral-200 text-black px-3 py-2 rounded-lg text-xs font-bold transition-colors shrink-0">Join</button>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 pt-8 border-t border-neutral-800/40 gap-4">
            <span>&copy; 2026 VeriClick. All rights reserved.</span>
            <div className="flex gap-6">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-white transition-colors">Security</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
