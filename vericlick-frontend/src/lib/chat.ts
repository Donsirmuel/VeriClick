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
  'How do I point my domain at VeriClick?',
  'How do I delete my account?',
  'How much does it cost?',
  'How can I contact support?',
]

const TOPICS: ChatTopic[] = [
  {
    id: 'what-is',
    keywords: ['what is', 'whats', "what's", 'vericlick', 'about', 'product', 'do you do', 'purpose', 'tool'],
    answer: `VeriClick is a link protector. You create a short tracked link for any destination URL, and every click on it is checked before it reaches your page: IP allow/deny rules first, then bot detection, then rate limits. Humans are routed through; suspicious requests are sent to your page for blocked visitors instead. Every decision is recorded and explained in plain language on your dashboard.`,
  },
  {
    id: 'how-it-works',
    keywords: ['how', 'works', 'work', 'function', 'mechanism', 'process', 'flow', 'what happens', 'step by step'],
    answer: `Here's the flow: 1) Create a tracked link pointing at your destination. 2) Share the short link. 3) When someone clicks it, VeriClick checks the request against your IP rules, bot signatures, and rate limits. 4) Real visitors are redirected to your destination; flagged requests are sent to your page for blocked visitors (or a built-in protected page). You see all of it — clicks, verdicts, and reasons — on the dashboard.`,
  },
  {
    id: 'create-link',
    keywords: ['create link', 'create a link', 'add link', 'new link', 'make link', 'tracking link', 'short link', 'shorten', 'destination', 'slug', 'link'],
    answer: `Go to Links in your workspace and click "Create Link". Paste the destination URL, optionally pick a domain, and VeriClick generates a short slug (or you can set your own). Once created you'll get a tracked URL to share. Any visitor clicking it is verified before being redirected.`,
  },
  {
    id: 'domains',
    keywords: ['domain', 'domain health', 'register domain', 'add domain', 'tracking domain', 'resolves', 'healthy', 'degraded'],
    answer: `A domain is the web address your tracked links live on. Register it under Domains and it's authorized instantly — no DNS proof needed. One quick step remains before your links use your own brand: point the domain at VeriClick (add one short CNAME record that the app shows you). The Domains page walks you through it with copy buttons. Until that step is done your links still work — they just use the VeriClick URL instead of your own brand.`,
  },
  {
    id: 'verify-domain',
    keywords: ['verify', 'verification', 'ownership', 'txt', 'dns', 'verification record', 'prove', 'verified badge', 'point', 'instant'],
    answer: `Ownership is instant with VeriClick: the moment you register a domain from your account it's authorized — there's no TXT record to add anymore. The only remaining step is to point the domain at VeriClick so your links use your own brand: add one short CNAME record shown on the Domains page, then press "Check again". Your links work either way — before pointing they just use the VeriClick URL.`,
  },
  {
    id: 'ip-rules',
    keywords: ['ip rule', 'ip rules', 'allow', 'deny', 'whitelist', 'blacklist', 'cidr', 'address', 'block ip', 'allowlist', 'denylist', 'rule', 'traffic rules', 'country', 'device'],
    answer: `Traffic Rules is where you control which audiences reach your links, in three tabs. IP Addresses: Allow rules always win — those IPs are never flagged; Deny rules block matching IPs/CIDR blocks, and can be set to expire. Countries: deny or allow entire countries. Devices: allow only certain device types (mobile/tablet/desktop) or block certain operating systems. Rules are checked IP allow → IP deny → country → device/OS, and you can whitelist an IP straight from the blocked-IPs review queue.`,
  },
  {
    id: 'point-domain',
    keywords: ['point', 'pointing', 'a record', 'cname', 'name servers', 'nameserver', 'branded url', 'own url', 'custom url', 'dns setup'],
    answer: `Pointing your domain at VeriClick is the second (and final) step to use your own brand on links. In the Domains page, open the domain and press "Set up DNS" — VeriClick shows you one short record (an A or CNAME record) with the exact Name and Value to add, plus copy buttons. Add it at your domain provider, save, then press "Check again". It can take a few minutes to a few hours to spread. Until it's done, your links still work — they just use the VeriClick URL.`,
  },
  {
    id: 'blocked-ips',
    keywords: ['blocked', 'blocked ip', 'blocked ip address', 'review', 'queue', 'whitelist', 'why blocked', 'why was', 'reason'],
    answer: `The Blocked IPs page is a review queue of requests VeriClick stopped. Each entry shows the IP, location, the link it hit, and a plain-language reason (for example "Request looked automated" or "Blocked by a deny rule you created"). If a block looks wrong, you can whitelist that IP in one click.`,
  },
  {
    id: 'safe-destination',
    keywords: ['safe', 'destination', 'safe destination', 'safe page', 'divert', 'redirect', 'suspicious', 'protected page', 'neutral page'],
    answer: `When VeriClick flags a request it never sends it to your real page and never returns a 403 — it redirects to the "page for blocked visitors" you set in Settings (Workspace). Leave it blank and VeriClick uses its own built-in "This link is protected" page instead. This keeps bots away from your real content while humans are unaffected.`,
  },
  {
    id: 'dashboard',
    keywords: ['dashboard', 'stats', 'statistics', 'activity', 'traffic', 'chart', 'analytics', 'metrics', 'click', 'clicks'],
    answer: `The dashboard shows your last 24 hours of clicks, how many were blocked as bots, human click counts, active link count, domain health, a daily human/bot traffic chart, a live activity feed, and the blocked-IP review queue. Every entry explains why a request was let through or blocked.`,
  },
  {
    id: 'pricing',
    keywords: ['price', 'pricing', 'cost', 'free', 'paid', 'plan', 'money', 'charge', 'billing', 'subscription', 'upgrade', 'premium', 'trial'],
    answer: `Every new account starts with a free 7-day trial — 1 domain and 1 link, no credit card required. After that you'll need a plan to keep creating links and domains; your existing tracked links keep working. Plans are Basic (5 domains), Plus (10), and Pro (20) — all from just $25/month. Head to the Pricing page to compare, and to Billing to upgrade.`,
  },
  {
    id: 'site-script',
    keywords: ['script', 'site script', 'tracker', 'javascript', 'embed', 'install', 'snippet', 'browser signals', 'tracker.js'],
    answer: `The site script is an optional snippet you can add to pages you own to send extra browser signals to VeriClick. The link tracker works fine without it. You'll find the copy-ready snippet under Settings → Site script. Keep the data-token value private — anyone with it can send events to your workspace.`,
  },
  {
    id: 'get-started',
    keywords: ['start', 'get started', 'begin', 'setup', 'onboarding', 'first', 'beginner', 'tutorial', 'guide', 'quick start'],
    answer: `To get started: 1) Create an account (free, no card). 2) Add a domain under Domains. 3) Verify you own it (add a text/TXT record) then point it at VeriClick (one short record — the app walks you through both). 4) Create your first tracked link under Links. 5) Share the link and watch your dashboard. Your dashboard has a step-by-step onboarding checklist that walks you through all of it.`,
  },
  {
    id: 'account',
    keywords: ['account', 'login', 'sign in', 'signin', 'sign up', 'signup', 'register', 'password', 'reset', 'forgot', 'oauth', 'google', 'profile'],
    answer: `Accounts are created in seconds with an email and password (or Google sign-in). You'll be logged into your workspace automatically. Forgot your password? Use "Forgot password" on the sign-in page to get a reset token. You can see your login email under Settings → Account, and close your account there too — it types DELETE to confirm and removes everything permanently.`,
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

const FALLBACK_ANSWER = `I'm not sure I can answer that one yet. I'm best with questions about links, domains, verification, pointing a domain at VeriClick, IP rules, blocked traffic, the dashboard, pricing, and your account. For anything else, use the Contact page (link in the footer) or open the Help page in your dashboard.`

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
