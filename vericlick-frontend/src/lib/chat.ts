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
  'How do I verify my domain?',
  'How do I install the script?',
  'How do redirect links work?',
  'How do I set up traffic rules?',
  'How much does it cost?',
  'How do I delete my account?',
  'How can I contact support?',
]

const TOPICS: ChatTopic[] = [
  {
    id: 'what-is',
    keywords: ['what is', 'whats', "what's", 'about the product', 'do you do', 'purpose', 'tool'],
    answer: `VeriClick keeps bots away from two things: your site and your links. The anti-bot script checks every visitor before they reach one of your pages — IP allow/deny rules first, then bot detection from device signals, then rate limits. Smart redirect links do the same check on every click before forwarding someone to your destination. Real visitors pass through; suspicious ones are stopped or diverted. Every decision is recorded and explained in plain language on your dashboard.`,
  },
  {
    id: 'how-it-works',
    keywords: ['how', 'works', 'work', 'function', 'mechanism', 'process', 'flow', 'what happens', 'step by step'],
    answer: `Here's the flow: 1) Add a domain under Domains and verify you own it. 2) Paste the script from the Anti-Bot page into your site's <head>, create a redirect link under Redirects, or both. 3) On every visit or click, VeriClick checks the request against your IP rules, then bot detection, then rate limits. 4) Real visitors pass through; flagged ones are blocked, diverted to a safe page, or just recorded — your choice. You see all of it — visits, clicks, verdicts and reasons — on the dashboard.`,
  },
  {
    id: 'install-script',
    keywords: ['install', 'script', 'install script', 'add script', 'script tag', 'embed', 'snippet', 'setup', 'getting started', 'first step'],
    answer: `First add your domain under Domains and verify it — either by pasting a meta tag into your site or by adding a DNS record. Then open the Anti-Bot page, copy the script tag, and paste it into the <head> of your site. Once it is live, visit your own site and the visit will show up on your dashboard within a minute.`,
  },
  {
    id: 'configure-shield',
    keywords: ['shield', 'configure', 'configure shield', 'protection mode', 'strict', 'balanced', 'monitor', 'mode'],
    answer: `Open the Anti-Bot page in your dashboard. Protection mode sets how suspicious a visitor has to be: Strict (also stops VPNs and anything borderline), Balanced (stops confirmed bots — the recommended setting), or Monitor (records everything, stops nothing). Separately, bot action decides what happens to the ones it catches: show a block page, quietly send them to a safe page you nominate, or log only. You can change both at any time.`,
  },
  {
    id: 'redirect-links',
    keywords: ['redirect', 'redirect link', 'link', 'links', 'short link', 'shortener', 'slug', 'cname', 'dns', 'subdomain', 'destination', 'smart link'],
    answer: `A smart redirect link is a short link on your own domain — something like go.yoursite.com/promo — that checks each click before forwarding it to your destination. Create one under Redirects: pick a verified domain, choose or generate a slug, and paste the destination. You'll get a CNAME record to add at your DNS provider, which is what points that subdomain at us. Links last as long as your plan period, and renewing extends the ones you already have. Deactivating or deleting a link takes it offline within a minute.`,
  },
  {
    id: 'domains',
    keywords: ['domain', 'domains', 'verify domain', 'verification', 'meta tag', 'txt record', 'add domain', 'limit', 'slot'],
    answer: `Add a domain under Domains and verify you own it, using either a meta tag in your site's <head> or a DNS record. A verified domain can run the anti-bot script and back your redirect links — you only need one. Your plan sets how many you can have; subdomains of a domain you already have count as the same one, so go.yoursite.com does not cost you a second slot. Deleting a domain frees its slot immediately and removes any redirect link on it, which is why it asks you to confirm.`,
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
    answer: `Set bot action to "Redirect to safe page" on the Anti-Bot page and give it a safe destination URL — that is where flagged visitors go instead of your real content. Leave it blank and VeriClick uses its own built-in "This site is protected" page. Either way a bot never reaches your real page, and humans never notice a thing.`,
  },
  {
    id: 'dashboard',
    keywords: ['dashboard', 'stats', 'statistics', 'activity', 'traffic', 'chart', 'analytics', 'metrics', 'click', 'clicks'],
    answer: `The dashboard covers both halves together: the last 24 hours of traffic, how many were bots, a daily people-vs-bots chart over 7, 30 or 90 days, your top countries and devices, and a live activity feed of the most recent visits and clicks. Every entry explains why that request was let through or stopped. Use the domain picker at the top to narrow it to one site or link.`,
  },
  {
    id: 'pricing',
    keywords: ['price', 'pricing', 'cost', 'free', 'paid', 'plan', 'money', 'charge', 'billing', 'subscription', 'upgrade', 'premium', 'trial'],
    answer: `VeriClick is paid from the start — there's no free tier. Pick Basic, Plus or Pro (they differ only by how many domains you can cover) and choose weekly (7 days) or monthly (30 days) access. Weekly starts at $25; monthly starts at $80 and works out cheaper per day. You pay once with crypto and renew when you want. Nothing auto-charges and there is no subscription. When a period ends, protection pauses and links stop forwarding until you renew; nothing is deleted, and any days you have left are added on top when you buy again. See the Pricing page to compare, or Billing & Plan to buy.`,
  },
  {
    id: 'site-script',
    keywords: ['script', 'site script', 'tracker', 'javascript', 'embed', 'install', 'snippet', 'browser signals', 'tracker.js', 'add script', 'script tag'],
    answer: `The VeriClick script is a small tag you add to your site's <head>. You'll find the copy-ready snippet on the Anti-Bot page in your dashboard, with step-by-step guides for WordPress, Shopify, Wix, Squarespace and Webflow. Your domain has to be verified first. Keep your site key private.`,
  },
  {
    id: 'get-started',
    keywords: ['start', 'get started', 'begin', 'setup', 'onboarding', 'first', 'beginner', 'tutorial', 'guide', 'quick start'],
    answer: `To get started: 1) Create an account and click the verification link we email you. 2) Choose a plan on the Billing & Plan page. 3) Add your domain under Domains and verify it. 4) Paste the script from the Anti-Bot page into your site's <head>, and/or create a link under Redirects and add the CNAME record it gives you. 5) Visit your own site and open your own link, then watch them appear on the dashboard. Your dashboard has a checklist that walks you through all of it.`,
  },
  {
    id: 'account',
    keywords: ['account', 'login', 'sign in', 'signin', 'sign up', 'signup', 'register', 'verify', 'verification', 'confirm email', 'password', 'reset', 'forgot', 'oauth', 'google', 'profile'],
    answer: `Accounts are created with an email and password (or Google sign-in — Google has already verified the address, so it logs you in directly). Email sign-ups must confirm their address first: we email a verification link, and once you click it your account is active and you can sign in. Didn't get the email? The sign-up and sign-in pages both have a "Resend verification email" button. Forgot your password? Use "Forgot password" on the sign-in page to get a reset token. You can see your login email under Settings → Account, and close your account there too — it types DELETE to confirm and removes everything permanently.`,
  },
  {
    id: 'contact',
    keywords: ['contact', 'support', 'help me', 'email', 'reach', 'reach out', 'talk', 'human', 'report', 'issue', 'bug', 'problem', 'helpdesk'],
    answer: `You can reach a human through the Contact page on the site (link in the footer, or the "Contact" link at the top of this widget). For instant answers, I can help right here — just ask about domains, the script, redirect links, traffic rules, blocked traffic, or pricing.`,
  },
  {
    id: 'data-privacy',
    keywords: ['privacy', 'data', 'gdpr', 'collect', 'tracking', 'information', 'stored', 'ip address', 'user agent', 'personal data'],
    answer: `VeriClick stores what it needs to protect you: your account details (username and email), and for each visit or click the IP address, user agent, device type and location where available. That data is what the bot detection and your dashboard run on. We never see your card details — payments go through our payment provider. Your configuration and traffic are visible only to you, and closing your account in Settings removes all of it permanently.`,
  },
  {
    id: 'technical',
    keywords: ['api', 'integration', 'developers', 'webhook', 'http', 'endpoint', 'docs', 'documentation'],
    answer: `VeriClick exposes a REST API (JWT-authenticated) for shield configuration, IP rules, dashboard data, and the script verification endpoints. The full endpoint list is in the project's HANDOFF.md and README. If you need developer help, use the contact page.`,
  },
]

const FALLBACK_ANSWER = `I'm not sure I can answer that one yet. I'm best with questions about domains, the anti-bot script, redirect links, traffic rules, blocked traffic, the dashboard, pricing, and your account. For anything else, use the Contact page (link in the footer) or open the Help page in your dashboard.`

function tokenize(text: string): Set<string> {
  const stopWords = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'does', 'how', 'i', 'is', 'it', 'me', 'my', 'of', 'the', 'to', 'what', 'where', 'which', 'with'])
  return new Set(text.split(' ').filter((word) => word && !stopWords.has(word)))
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

  if (best && bestScore >= 2) {
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
