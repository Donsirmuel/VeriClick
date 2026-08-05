export interface ChatTopic {
  id: string
  keywords: string[]
  answer: string
}

export interface ChatAnswer {
  text: string
  suggestions?: string[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  text: string
  suggestions?: string[]
}

export const QUICK_QUESTIONS = [
  'How does VeriClick work?',
  'How do I create a link?',
  'How do I verify my domain?',
  'What is an IP rule?',
  'How much does it cost?',
  'How can I contact support?',
]

const TOPICS: ChatTopic[] = [
  {
    id: 'what-is',
    keywords: ['what is', 'whats', "what's", 'vericlick', 'about', 'product', 'do you do', 'purpose', 'tool'],
    answer: `VeriClick is a link protector. You create a short tracked link for any destination URL, and every click on it is checked before it reaches your page: IP allow/deny rules first, then bot detection, then rate limits. Humans are routed through; suspicious requests are diverted to a safe page instead. Every decision is recorded and explained in plain language on your dashboard.`,
  },
  {
    id: 'how-it-works',
    keywords: ['how', 'works', 'work', 'function', 'mechanism', 'process', 'flow', 'what happens', 'step by step'],
    answer: `Here's the flow: 1) Create a tracked link pointing at your destination. 2) Share the short link. 3) When someone clicks it, VeriClick checks the request against your IP rules, bot signatures, and rate limits. 4) Real visitors are redirected to your destination; flagged requests are diverted to your safe destination (or a built-in neutral page). You see all of it — clicks, verdicts, and reasons — on the dashboard.`,
  },
  {
    id: 'create-link',
    keywords: ['create link', 'create a link', 'add link', 'new link', 'make link', 'tracking link', 'short link', 'shorten', 'destination', 'slug', 'link'],
    answer: `Go to Links in your workspace and click "Create Link". Paste the destination URL, optionally pick a domain, and VeriClick generates a short slug (or you can set your own). Once created you'll get a tracked URL to share. Any visitor clicking it is verified before being redirected.`,
  },
  {
    id: 'domains',
    keywords: ['domain', 'domain health', 'register domain', 'add domain', 'tracking domain', 'resolves', 'healthy', 'degraded'],
    answer: `A domain is the web address your tracked links live on. Register it under Domains and VeriClick health-checks it automatically (it confirms the domain resolves to a server). A domain can show Healthy, Degraded, or Blacklisted. Health checks run from inside the app — you don't need to set up any external scheduler.`,
  },
  {
    id: 'verify-domain',
    keywords: ['verify', 'verification', 'ownership', 'txt', 'dns', 'verification record', 'prove', 'verified badge'],
    answer: `Verification proves you own the domain, which is separate from health. VeriClick gives you a DNS TXT record like vericlick-verify=<token>. Publish that record with your DNS provider, then click "Verify ownership" on the domain. Once the record is found, the domain gets the Verified badge. Health (resolves) and ownership (verified) are tracked separately.`,
  },
  {
    id: 'ip-rules',
    keywords: ['ip rule', 'ip rules', 'allow', 'deny', 'whitelist', 'blacklist', 'cidr', 'address', 'block ip', 'allowlist', 'denylist', 'rule'],
    answer: `IP rules let you control which addresses can reach your links. An Allow rule always wins — those IPs are never flagged. A Deny rule blocks matching IPs/CIDR blocks. Rules can be set to expire, and you can whitelist an IP straight from the blocked-IPs review queue.`,
  },
  {
    id: 'blocked-ips',
    keywords: ['blocked', 'blocked ip', 'blocked ip address', 'review', 'queue', 'whitelist', 'why blocked', 'why was', 'reason'],
    answer: `The Blocked IPs page is a review queue of requests VeriClick stopped. Each entry shows the IP, location, the link it hit, and a plain-language reason (for example "Request looked automated" or "Blocked by a deny rule you created"). If a block looks wrong, you can whitelist that IP in one click.`,
  },
  {
    id: 'safe-destination',
    keywords: ['safe', 'destination', 'safe destination', 'safe page', 'divert', 'redirect', 'suspicious', 'protected page', 'neutral page'],
    answer: `When VeriClick flags a request it never sends it to your real page and never returns a 403 — it redirects to a safe destination you configure in Settings. Leave it blank and VeriClick uses its own neutral "This link is protected" page instead. This keeps bots away from your real content while humans are unaffected.`,
  },
  {
    id: 'dashboard',
    keywords: ['dashboard', 'stats', 'statistics', 'activity', 'traffic', 'chart', 'analytics', 'metrics', 'click', 'clicks'],
    answer: `The dashboard shows your last 24 hours of clicks, how many were blocked as bots, human click counts, active link count, domain health, a daily human/bot traffic chart, a live activity feed, and the blocked-IP review queue. Every entry explains why a request was let through or blocked.`,
  },
  {
    id: 'pricing',
    keywords: ['price', 'pricing', 'cost', 'free', 'paid', 'plan', 'money', 'charge', 'billing', 'subscription', 'upgrade', 'premium'],
    answer: `VeriClick is free while it's in beta — no credit card required, and every feature is included. Paid plans are planned for the future but aren't available yet. When pricing launches you'll be able to see it on the Pricing page.`,
  },
  {
    id: 'site-script',
    keywords: ['script', 'site script', 'tracker', 'javascript', 'embed', 'install', 'snippet', 'browser signals', 'tracker.js'],
    answer: `The site script is an optional snippet you can add to pages you own to send extra browser signals to VeriClick. The link tracker works fine without it. You'll find the copy-ready snippet under Settings → Site script. Keep the data-token value private — anyone with it can send events to your workspace.`,
  },
  {
    id: 'get-started',
    keywords: ['start', 'get started', 'begin', 'setup', 'onboarding', 'first', 'beginner', 'tutorial', 'guide', 'quick start'],
    answer: `To get started: 1) Create an account (free, no card). 2) Add a domain under Domains and verify ownership with a DNS TXT record. 3) Create your first tracked link under Links. 4) Share the short URL and watch your dashboard. Your dashboard has a 5-step onboarding checklist that walks you through all of it.`,
  },
  {
    id: 'account',
    keywords: ['account', 'login', 'sign in', 'signin', 'sign up', 'signup', 'register', 'password', 'reset', 'forgot', 'oauth', 'google', 'profile'],
    answer: `Accounts are created in seconds with an email and password (or Google sign-in). You'll be logged into your workspace automatically. Forgot your password? Use "Forgot password" on the sign-in page to get a reset token.`,
  },
  {
    id: 'contact',
    keywords: ['contact', 'support', 'help me', 'email', 'reach', 'reach out', 'talk', 'human', 'report', 'issue', 'bug', 'problem', 'helpdesk'],
    answer: `You can reach a human through the Contact page on the site (link in the footer, or the "Contact" link at the top of this widget). For instant answers, I can help right here — just ask about links, domains, IP rules, blocked traffic, or pricing.`,
  },
  {
    id: 'data-privacy',
    keywords: ['privacy', 'data', 'gdpr', 'collect', 'tracking', 'information', 'stored', 'ip address', 'user agent', 'personal data'],
    answer: `VeriClick stores what it needs to protect your links: account details (username/email), and for each click the IP address, user agent, and location where available. This data powers the bot detection and your dashboard analytics. Your links and their destinations are only visible to you.`,
  },
  {
    id: 'technical',
    keywords: ['api', 'integration', 'developers', 'webhook', 'http', 'endpoint', 'docs', 'documentation'],
    answer: `VeriClick exposes a REST API (JWT-authenticated) for links, domains, IP rules, dashboard data, and the public redirect + tracker endpoints. The full endpoint list is in the project's HANDOFF.md and README. If you need developer help, use the contact page.`,
  },
]

const FALLBACK_ANSWER = `I'm not sure I can answer that one yet. I'm best with questions about links, domains, verification, IP rules, blocked traffic, the dashboard, pricing, and account setup. For anything else, use the Contact page (link in the footer) or open the Help page in your dashboard.`

function tokenize(text: string): Set<string> {
  return new Set(text.split(' ').filter(Boolean))
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true
  const stripS = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)
  return stripS(a) === stripS(b)
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function answerQuestion(question: string): ChatAnswer {
  const query = normalize(question)
  if (!query) return { text: FALLBACK_ANSWER }

  const queryTokens = tokenize(query)

  let best: ChatTopic | null = null
  let bestScore = 0

  for (const topic of TOPICS) {
    let score = 0
    for (const keyword of topic.keywords) {
      const keywordTokens = tokenize(keyword)
      const exactPhrase = query.includes(keyword)
      if (exactPhrase) {
        score += keywordTokens.size * 3
        continue
      }
      for (const kw of keywordTokens) {
        for (const qt of queryTokens) {
          if (tokensMatch(qt, kw)) {
            score += 1
            break
          }
        }
      }
    }
    if (score > bestScore) {
      best = topic
      bestScore = score
    }
  }

  if (best) {
    return { text: best.answer, suggestions: QUICK_QUESTIONS }
  }

  return { text: FALLBACK_ANSWER, suggestions: QUICK_QUESTIONS }
}

export function initialBotMessage(): ChatMessage {
  return {
    id: 'welcome',
    role: 'bot',
    text: `Hi! I'm the VeriClick assistant. Ask me about links, domains, IP rules, blocked traffic, pricing, or how to get started. If I can't help, I'll point you to the Contact page.`,
    suggestions: QUICK_QUESTIONS,
  }
}

export function contactMessage(): string {
  return `You can reach a human through the Contact page on the site — the link is in the footer or at the top of this widget.`
}
