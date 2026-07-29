# VeriClick: System Overview & Specs

| Attribute | Value |
| :--- | :--- |
| **Project** | VeriClick (Link Protection & Traffic Routing Platform) |
| **Prepared By** | Samuel |
| **Lead Architect** | MailionDev |
| **Document Status** | Approved Technical Blueprint |

---

## 1. The Essence of VeriClick (The Two Core Pillars)

VeriClick is designed to safeguard marketing campaigns, landing pages, and domain infrastructure. It combines two essential defensive capabilities into a single unified platform:

### 1. Deterring Bots, Trackers, & Fake Traffic
Real-time interception of security crawlers, email firewalls, ad-review bots, and automated scrapers. When non-human traffic clicks a campaign link, VeriClick serves a clean, static HTML page. This keeps real campaign pages hidden from scanners and prevents skewed analytics.

### 2. Blacklist Prevention & Spam Shielding
Automated health monitoring for sending and delivery domains. The system continuously audits domain health against global spam blacklists and automatically swaps out burned domains for fresh backup domains before deliverability or inbox rates drop.

---

## 2. Multi-Channel Use Cases

* **Cold Email Campaigns:** Email security scanners crawl links inside incoming emails. VeriClick intercepts these bots with neutral pages, keeping your primary email domains off spam blocklists.
* **Paid Ads (Meta, TikTok, Google):** Blocks ad-review bots and click-farm scrapers from triggering conversion pixels or wasting ad spend.
* **SMS & Chat Apps:** Messaging preview engines (WhatsApp, iMessage) fetch link previews safely without counting as real human visits.
* **Affiliate Tracking:** Filters out non-human clicks so dashboards report pure, verified human engagement.

---

## 3. Backend Architecture (Django & DRF)

Built using **Django and Django REST Framework (DRF)** as the core routing and rule engine:

* **Gatekeeper Middleware:** Evaluates incoming visitors against bot IP subnets, User-Agents, and ASN signatures cached in **Redis** for sub-millisecond lookups.
* **Traffic Routing:** Bots receive an HTTP 200 response with safe static HTML. Real humans receive an immediate HTTP 302 redirect string to the target URL.
* **Automated Rotation (Celery):** Background workers run continuous health checks against domain blacklists. If a domain is flagged, active link slugs are dynamically migrated to healthy backup domains.

---

## 4. Frontend Design (React & Vite)

Built using **React, Vite, and Tailwind CSS** with **React Router** for client-side navigation:

* `/dashboard`: Real-time visual metrics comparing verified human clicks against intercepted bot traffic.
* `/links`: Management studio to create short links, set target URLs, and assign fallback templates.
* `/domains`: Domain hub for connecting custom domains and monitoring real-time health indicators.
* **Color Palette:**
  * Primary Actions: Indigo (`#4F46E5`)
  * Background: Slate (`#F8FAFC`)
  * Healthy Status: Emerald (`#10B981`)
  * Alert Status: Red (`#EF4444`)

---

## 5. Database Setup (In-App PostgreSQL)

VeriClick uses a self-contained, **In-App PostgreSQL database** instance running alongside the application:

| Table Name | Purpose | Relationships |
| :--- | :--- | :--- |
| `Workspace` | Root organizational boundary for accounts and teams. | Parent to `DomainRegistry` and `TrackingLink`. |
| `DomainRegistry` | Stores connected custom domains and tracks health state (Green/Amber/Red). | Linked to `Workspace`. |
| `TrackingLink` | Maps short link slugs to target destination URLs. | Linked to `DomainRegistry`. |
| `ClickLog` | Immutable event ledger storing visitor IP, device metadata, and bot/human classification. | Linked to `TrackingLink` to feed dashboard analytics. |

> **System Flow:** Click received → Query `TrackingLink` & `DomainRegistry` → Check Redis bot cache → Log to `ClickLog` → Route (Bot = Safe Page, Human = Destination URL).
