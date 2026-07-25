# VeriClick Frontend

A production-ready React/Vite frontend for **VeriClick** — a link protection and traffic routing engine. This repository contains the complete dashboard, landing page, and CRUD interfaces.

## Features

- **Dark landing page** — marketing/overview page for the VeriClick product
- **Dashboard** — real-time traffic analytics with stacked area charts (human vs bot), KPI cards, live activity feed, and domain health summary
- **Links CRUD** — full create/read/update/delete with search, sort, and pagination
- **Domain Registry** — health monitoring with status indicators (healthy/degraded/blacklisted), last-checked timestamps, and force recheck
- **Auth page** — login form ready for Django session/JWT integration
- **Mock data layer** — runs completely standalone without a backend

## Tech Stack

| Technology | Version |
|---|---|
| React | 19 |
| Vite | 8 |
| TypeScript | 5.x |
| Tailwind CSS | 4 (with `@tailwindcss/vite`) |
| React Router | v7 |
| TanStack Query | v5 |
| Recharts | v3 |
| React Hook Form | v7 |
| Zod | v4 |
| Lucide React | v1 |
| Sonner | v2 |

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build
```

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `VITE_MOCK_MODE` | `true` | Set to `false` to connect to real backend |
| `VITE_API_BASE_URL` | `http://localhost:8000/api` | Django REST backend URL |

## Mock Mode

The app runs in **mock mode** by default. All data is seeded from `/src/api/mock.ts` with realistic shapes that mirror the expected Django API responses.

To switch to real backend:

1. Set `VITE_MOCK_MODE=false` in `.env`
2. Set `VITE_API_BASE_URL` to your Django server URL
3. The API client in `/src/api/client.ts` will route all requests to your backend

## API Contract

The frontend expects the following REST endpoints:

| Method | Endpoint | Response Shape |
|---|---|---|
| `GET` | `/api/dashboard/stats` | `{ totalClicks24h, botTrafficBlocked, botTrafficPercentage, activeLinks, domainsHealthy, domainsDegraded, domainsBlacklisted }` |
| `GET` | `/api/dashboard/traffic?range=7d|30d|90d` | `[{ date, human, bot }]` |
| `GET` | `/api/dashboard/activity` | `[{ id, ip, country, device, reason, time, slug, isBot }]` |
| `GET` | `/api/links?page=1&size=20` | `{ results: [...], count, next, previous }` |
| `POST` | `/api/links` | `{ id, slug, destinationUrl, domain, domainHealth, totalClicks, botClicks, status, createdAt }` |
| `PUT` | `/api/links/:id` | Updated link object |
| `DELETE` | `/api/links/:id` | `204 No Content` |
| `GET` | `/api/domains` | `[{ id, domain, healthStatus, lastChecked, linksCount, createdAt }]` |
| `POST` | `/api/domains` | New domain object |
| `POST` | `/api/domains/:id/recheck` | `200 OK` |
| `POST` | `/auth/login` | `{ token, user }` |
| `POST` | `/auth/register` | `{ token, user }` |

## File Structure

```
src/
├── api/
│   ├── client.ts              # Axios instance with mock mode toggle
│   └── mock.ts                # Seeded mock data
├── components/
│   ├── ui/                    # (placeholder for shadcn primitives)
│   ├── layout/
│   │   ├── DashboardLayout.tsx
│   │   ├── Sidebar.tsx
│   │   └── TopBar.tsx
│   ├── dashboard/
│   │   ├── StatCard.tsx
│   │   ├── TrafficChart.tsx
│   │   ├── ActivityFeed.tsx
│   │   └── DomainHealthWidget.tsx
│   ├── links/
│   │   └── CreateLinkModal.tsx
│   └── domains/
│       └── AddDomainDialog.tsx
├── pages/
│   ├── Landing.tsx            # Dark theme marketing page
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Links.tsx
│   └── Domains.tsx
├── hooks/                     # (placeholder for custom hooks)
├── lib/
│   ├── queryClient.ts         # TanStack Query config
│   └── utils.ts               # cn(), formatters, slug generator
├── types/
│   └── index.ts               # Shared TypeScript interfaces
├── App.tsx                    # Route definitions
├── main.tsx                   # Entry point
└── index.css                  # Tailwind v4 + design tokens
```

## Deployment

The build output is a static bundle in `dist/`. Deploy to any static hosting:

```bash
pnpm build
# dist/ contains the production build
```

Compatible with Vercel, Netlify, Cloudflare Pages, or any static file server.

## Connecting to Django Backend

When the Django/DRF backend is ready:

1. Update `VITE_API_BASE_URL` to point to your Django server
2. Set `VITE_MOCK_MODE=false`
3. Ensure CORS is configured on Django to allow the frontend origin
4. If Django uses JWT instead of session auth, update `/src/api/client.ts` to send the token in the `Authorization` header

## Design System

The design uses CSS custom properties defined in `index.css` via Tailwind v4's `@theme` directive:

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#4F46E5` | CTAs, active nav |
| `--color-highlight` | `#F59E0B` | Key phrase highlights, numbered badges |
| `--color-success` | `#10B981` | Healthy domains, clean traffic |
| `--color-error` | `#EF4444` | Blacklisted domains, bot traffic |
| `--color-warning` | `#F59E0B` | Degraded domains, pending checks |
| `--color-dark-bg` | `#0F172A` | Landing page background |
| `--color-sidebar` | `#1E293B` | Dashboard sidebar |
| `--color-background` | `#F8FAFC` | Dashboard content area |

Typography: **Inter** for UI text, **JetBrains Mono** for machine data (IPs, slugs, ASNs).
