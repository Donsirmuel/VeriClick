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
  'How do I install the script?',
  'How do I configure my shield?',
  'How do I set up traffic rules?',
  'How do I delete my account?',
  'How much does it cost?',
  'How can I contact support?',
]

const TOPICS: ChatTopic[] = [
  {
    id: 'what-is',
    keywords: ['what is', 'whats', "what's", 'vericlick', 'about', 'product', 'do you do', 'purpose', 'tool'],
    answer: `VeriClick is a website protection tool. You add a single script tag to your site, and every visitor is checked before they reach your page: IP allow/deny rules first, then bot detection via device signals, then rate limits. Real visitors pass through; suspicious requests are sent to a protected page. Every decision is recorded and explained in plain language on your dashboard.`,
  },
  {
    id: 'how-it-works',
    keywords: ['how', 'works', 'work', 'function', 'mechanism', 'process', 'flow', 'what happens', 'step by step'],
    answer: `Here's the flow: 1) Add the VeriClick script tag to your site. 2) Configure your shield (strict, balanced, or monitor mode). 3) When someone visits your site, VeriClick checks the request against your IP rules, bot detection, and rate limits. 4) Real visitors pass through; flagged requests are sent to a protected page. You see all of it — visits, verdicts, and reasons — on the dashboard.`,
  },
  {
    id: 'install-script',
    keywords: ['install', 'script', 'install script', 'add script', 'script tag', 'embed', 'snippet', 'setup', 'getting started', 'first step'],
    answer: `Go to the Install page in your dashboard and copy the script tag. Paste it into the <head> section of your website. That's it — VeriClick starts protecting your site immediately. No domain verification or DNS changes needed.`,
  },
  {
    id: 'configure-shield',
    keywords: ['shield', 'configure', 'configure shield', 'protection mode', 'strict', 'balanced', 'monitor', 'mode'],
    answer: `Open the Shield page in your dashboard. Choose between Strict (block all suspicious traffic), Balanced (challenge suspicious visitors), or Monitor (log only, no blocking). Your rules, your site — you can change this anytime.`,
  },
  {
    id: 'ip-rules',
    keywords: ['ip rule', 'ip rules', 'allow', 'deny', 'whitelist', 'blacklist', 'cidr', 'address', 'block ip', 'allowlist', 'denylist', 'rule', 'traffic rules', 'country', 'device'],
    answer: `Traffic Rules is where you control which visitors reach your site, in three tabs. IP Addresses: Allow rules always win — those IPs are never flagged; Deny rules block matching IPs/CIDR blocks, and can be set to expire. Countries: deny or allow entire countries. Devices: allow only certain device types (mobile/tablet/desktop) or block certain operating systems. Rules are checked IP allow → IP deny → country → device/OS, and you can whitelist an IP straight from the blocked-IPs review queue.`,
  },
  {
    id: 'blocked-ips',
    keywords: ['blocked', 'blocked ip', 'blocked ip address', 'review', 'queue', 'whitelist', 'why blocked', 'why was', 'reason'],
    answer: `The Blocked IPs page is a review queue of requests VeriClick stopped. Each entry shows the IP, location, the page they tried to visit, and a plain-language reason (for example "Request looked automated" or "Blocked by a deny rule you created"). If a block looks wrong, you can whitelist that IP in one click.`,
  },
  {
    id: 'safe-destination',
    keywords: ['safe', 'destination', 'safe destination', 'safe page', 'divert', 'redirect', 'suspicious', 'protected page', 'neutral page'],
    answer: `When VeriClick flags a request it never sends it to your real page and never returns a 403 — it redirects to the "page for blocked visitors" you set in Settings (Workspace). Leave it blank and VeriClick uses its own built-in "This site is protected" page instead. This keeps bots away from your real content while humans are unaffected.`,
  },
  {
    id: 'dashboard',
    keywords: ['dashboard', 'stats', 'statistics', 'activity', 'traffic', 'chart', 'analytics', 'metrics', 'click', 'clicks'],
    answer: `The dashboard shows your last 24 hours of traffic, how many visitors were blocked as bots, human visitor counts, protection status, a daily human/bot traffic chart, a live activity feed, and the blocked-IP review queue. Every entry explains why a request was let through or blocked.`,
  },
  {
    id: 'pricing',
    keywords: ['price', 'pricing', 'cost', 'free', 'paid', 'plan', 'money', 'charge', 'billing', 'subscription', 'upgrade', 'premium', 'trial'],
    answer: `Every new account starts with a free 7-day trial — no credit card required. After that you'll need a plan to keep using VeriClick; your site stays protected. Plans are Basic, Plus, and Pro — all from just $25/month. Head to the Pricing page to compare, and to Billing to upgrade.`,
  },
  {
    id: 'site-script',
    keywords: ['script', 'site script', 'tracker', 'javascript', 'embed', 'install', 'snippet', 'browser signals', 'tracker.js', 'add script', 'script tag'],
    answer: `The VeriClick script is a small tag you add to your site's <head> to start protecting it. You'll find the copy-ready snippet under Install in your dashboard. Paste it on your site and VeriClick handles the rest. Keep your token value private.`,
  },
  {
    id: 'get-started',
    keywords: ['start', 'get started', 'begin', 'setup', 'onboarding', 'first', 'beginner', 'tutorial', 'guide', 'quick start'],
    answer: `To get started: 1) Create an account (free, no card) and click the verification link we email you. 2) Go to Install and copy the script tag. 3) Paste it in your site's <head>. 4) Configure your shield on the Shield page. 5) Watch your dashboard for live traffic. Your dashboard has a step-by-step onboarding checklist that walks you through all of it.`,
  },
  {
    id: 'account',
    keywords: ['account', 'login', 'sign in', 'signin', 'sign up', 'signup', 'register', 'verify', 'verification', 'confirm email', 'password', 'reset', 'forgot', 'oauth', 'google', 'profile'],
    answer: `Accounts are created with an email and password (or Google sign-in — Google has already verified the address, so it logs you in directly). Email sign-ups must confirm their address first: we email a verification link, and once you click it your account is active and you can sign in. Didn't get the email? The sign-up and sign-in pages both have a "Resend verification email" button. Forgot your password? Use "Forgot password" on the sign-in page to get a reset token. You can see your login email under Settings → Account, and close your account there too — it types DELETE to confirm and removes everything permanently.`,
  },
  {
    id: 'contact',
    keywords: ['contact', 'support', 'help me', 'email', 'reach', 'reach out', 'talk', 'human', 'report', 'issue', 'bug', 'problem', 'helpdesk'],
    answer: `You can reach a human through the Contact page on the site (link in the footer, or the "Contact" link at the top of this widget). For instant answers, I can help right here — just ask about the script, shield, IP rules, blocked traffic, or pricing.`,
  },
  {
    id: 'data-privacy',
    keywords: ['privacy', 'data', 'gdpr', 'collect', 'tracking', 'information', 'stored', 'ip address', 'user agent', 'personal data'],
    answer: `VeriClick stores what it needs to protect your site: account details (username/email), and for each visit the IP address, user agent, and location where available. This data powers the bot detection and your dashboard analytics. Your configuration is only visible to you.`,
  },
  {
    id: 'technical',
    keywords: ['api', 'integration', 'developers', 'webhook', 'http', 'endpoint', 'docs', 'documentation'],
    answer: `VeriClick exposes a REST API (JWT-authenticated) for shield configuration, IP rules, dashboard data, and the script verification endpoints. The full endpoint list is in the project's HANDOFF.md and README. If you need developer help, use the contact page.`,
  },
]

const FALLBACK_ANSWER = `I'm not sure I can answer that one yet. I'm best with questions about the script, shield configuration, IP rules, blocked traffic, the dashboard, pricing, and your account. For anything else, use the Contact page (link in the footer) or open the Help page in your dashboard.`

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
    text: `Hi! I'm the VeriClick assistant. Ask me about the script, shield, IP rules, blocked traffic, pricing, or how to get started. If I can't help, I'll point you to the Contact page.`,
    suggestions: QUICK_QUESTIONS,
  }
}

export function contactMessage(): string {
  return `You can reach a human through the Contact page on the site — the link is in the footer or at the top of this widget.`
}
