# VeriClick — Project Handoff

## Overview

VeriClick is a link protection & traffic routing platform. It detects and blocks bot traffic in real time, monitors domain health (RBL/blacklist checks), and provides analytics via a dashboard. The frontend is a React 19 + Vite + TypeScript SPA; the backend is a Django 6.0 + DRF REST API.

---

## Backend (`vericlick-backend/`)

### Stack
- **Python 3.13**, Django 6.0.7, Django REST Framework 3.17.1
- `djangorestframework-simplejwt` for JWT auth
- `django-cors-headers` for CORS
- `django-filter` for query filtering
- `python-decouple` for env-driven config

### Project structure
```
Vericlick_project/
├── Vericlick_project/
│   ├── settings.py          # env-driven config, SimpleJWT, CORS, throttling
│   └── urls.py              # root URL config (includes vericlick.urls)
├── vericlick/
│   ├── models.py            # Workspace, DomainRegistry, TrackingLink, ClickLog
│   ├── serializers.py       # camelCase JSON serializers
│   ├── views.py             # all API views
│   ├── urls.py              # API routes
│   ├── utils.py             # CamelCaseJSON renderer/parser, custom exception handler
│   └── tests.py             # 65 tests (models, serializers, views, idempotency)
├── manage.py
└── db.sqlite3
```

### Models

| Model | Key Fields | Notes |
|---|---|---|
| `Workspace` | `id` (UUID), `name`, `owner` (FK→User), `created_at` | Auto-created via `post_save` signal on `User` |
| `DomainRegistry` | `id` (UUID), `workspace` (FK), `domain` (unique), `health_status`, `last_checked` | Statuses: `healthy`, `degraded`, `blacklisted` |
| `TrackingLink` | `id` (UUID), `workspace` (FK), `domain` (FK→DomainRegistry, nullable), `slug` (unique), `destination_url`, `status`, `total_clicks`, `bot_clicks` | Statuses: `active`, `paused`, `disabled` |
| `ClickLog` | `id` (UUID), `link` (FK), `ip`, `country`, `device`, `user_agent`, `is_bot`, `reason` | |

All models use UUID primary keys and are scoped to a `Workspace` for data isolation.

### API Endpoints

#### Auth (all `AllowAny` except `/auth/me/`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register/` | Create user (username, email, password) |
| `POST` | `/api/auth/login/` | JWT login (username, password) → `{access, refresh}` |
| `POST` | `/api/auth/refresh/` | Refresh JWT token |
| `GET` | `/api/auth/me/` | Get current user (requires auth) |
| `POST` | `/api/auth/google/` | Google OAuth sign-in/sign-up — accepts `{id_token}`, verifies via Google's tokeninfo endpoint, creates user if new, returns `{access, refresh}` |
| `POST` | `/api/auth/password-reset/` | Request password reset — returns `{token, uid}` (dev mode, no email) |
| `POST` | `/api/auth/password-reset/confirm/` | Confirm password reset (uid, token, password) |

#### Dashboard (all require auth, workspace-scoped)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/dashboard/stats/` | 24h click stats, bot %, active links, domain health counts |
| `GET` | `/api/dashboard/traffic/?range=7d` | Daily aggregated traffic (human/bot), ranges: `7d`, `30d`, `90d` |
| `GET` | `/api/dashboard/activity/` | Last 50 clicks with metadata |

#### Links (ViewSet, require auth, workspace-scoped)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/links/` | List (paginated, searchable by slug/destination_url) |
| `POST` | `/api/links/` | Create |
| `GET` | `/api/links/{id}/` | Retrieve |
| `PATCH` | `/api/links/{id}/` | Partial update |
| `DELETE` | `/api/links/{id}/` | Delete |

#### Domains (ViewSet, require auth, workspace-scoped)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/domains/` | List |
| `POST` | `/api/domains/` | Create |
| `GET` | `/api/domains/{id}/` | Retrieve |
| `PATCH` | `/api/domains/{id}/` | Partial update |
| `DELETE` | `/api/domains/{id}/` | Delete |
| `POST` | `/api/domains/{id}/recheck/` | Trigger domain health recheck |

### Security & Error Handling
- All errors normalized to `{"errors": [{"field": ..., "detail": ...}]}` via custom exception handler (`vericlick.utils.custom_exception_handler`)
- Throttling: anonymous 100 req/hr, authenticated 1000 req/hr
- Production security headers when `DEBUG=False`: HSTS (1 year), SSL redirect, secure cookies, nosniff
- CORS locked to configured origins (default: `localhost:5173,localhost:4173`)
- Password validation: Django defaults (min length, not common, not similar to user attributes)
- Bot detection placeholder: `ClickLog.is_bot` can be set; scoring logic TBD

### Google OAuth
- `POST /api/auth/google/` accepts a Google ID token (JWT from Google Identity Services)
- Verifies token via `https://oauth2.googleapis.com/tokeninfo?id_token=...`
- Validates `aud` matches `GOOGLE_CLIENT_ID` (if set in `.env`)
- Validates `email_verified` flag
- Creates a new user if email doesn't exist, otherwise logs in existing user
- Username derived from email prefix (with dedup suffix if taken); password set to random string
- Returns JWT `{access, refresh}` tokens
- Requires `GOOGLE_CLIENT_ID` in both backend `.env` and frontend `.env` (commented out by default)

### Testing
- 65 tests in `vericlick/tests.py`
- Run: `python manage.py test vericlick`
- Covers: models (creation, ordering), serializers (camelCase conversion, validation), endpoints (CRUD, auth, auth_required, edge cases), dashboard (stats zero-state, traffic ranges, activity)

---

## Frontend (`vericlick-frontend/`)

### Stack
- **React 19**, Vite 8, TypeScript, Tailwind CSS 4
- `@tanstack/react-query` v5 (server state management)
- `axios` (HTTP client with interceptor-based token refresh)
- `react-router-dom` v7 (client-side routing)
- `react-hot-toast` (notifications)
- `@hugeicons/react` + `@hugeicons/core-free-icons` (icons)

### Project structure (key files)
```
src/
├── api/
│   ├── client.ts        # axios instance, token refresh interceptor, 401/429 handling
│   ├── mock.ts          # mock data helper (returns static data)
│   ├── auth.ts          # login, register, refreshToken, forgotPassword, resetPassword, fetchMe, googleLogin
│   ├── links.ts         # fetchLinks, createLink, updateLink, deleteLink
│   ├── domains.ts       # fetchDomains, createDomain, updateDomain, deleteDomain, recheckDomain
│   └── dashboard.ts     # fetchDashboardStats, fetchTrafficData, fetchActivity
├── components/
│   ├── auth/
│   │   └── GoogleSignInButton.tsx   # Google OAuth button (GIS library)
│   ├── layout/
│   │   ├── DashboardLayout.tsx      # Auth guard, sidebar + topbar layout
│   │   ├── Sidebar.tsx
│   │   └── TopBar.tsx               # User dropdown with fetchMe()
│   ├── dashboard/
│   │   ├── StatCard.tsx
│   │   ├── TrafficChart.tsx
│   │   ├── ActivityFeed.tsx
│   │   └── DomainHealthWidget.tsx
│   ├── domains/
│   │   └── AddDomainDialog.tsx      # Modal form with loading state
│   ├── ErrorBoundary.tsx            # Class component with retry button
│   └── Logo.tsx
├── lib/
│   ├── errors.ts         # parseApiError, showErrorToast
│   └── queryClient.ts    # React Query client with global error handlers
│   └── utils.ts          # formatRelativeTime
├── pages/
│   ├── Login.tsx              # Email/password + Google sign-in
│   ├── Register.tsx           # Username/email/password + Google sign-in
│   ├── ForgotPassword.tsx
│   ├── ResetPassword.tsx
│   ├── Dashboard.tsx          # Stats, traffic chart, activity feed, domain health
│   ├── Links.tsx              # CRUD table with create/edit/delete modals
│   └── Domains.tsx            # CRUD table, inline edit, recheck, add dialog
├── types/
│   └── index.ts               # TrackingLink, DomainRegistry, DashboardStats, etc.
├── App.tsx                    # Route definitions
└── main.tsx                   # Entry point with providers
```

### Routing
| Path | Page | Notes |
|---|---|---|
| `/` | Root | Static landing |
| `/auth/login` | Login | |
| `/auth/register` | Register | |
| `/auth/forgot-password` | ForgotPassword | |
| `/auth/reset-password` | ResetPassword | |
| `/app/dashboard` | Dashboard | Protected (auth guard) |
| `/app/links` | Links | Protected |
| `/app/domains` | Domains | Protected |

### Auth Flow
1. User signs in via email/password or Google
2. JWT `access` + `refresh` stored in `localStorage`
3. `axios` interceptor automatically adds `Bearer` header
4. On 401, interceptor attempts token refresh; if refresh fails, clears storage and redirects to `/auth/login`
5. `DashboardLayout` checks for token on mount; redirects to login if missing
6. `TopBar` fetches `/auth/me/` to display user info

### Error Handling
- `apiClient` interceptor: 401 → token refresh queue, 429 → pass through, network error → pass
- `parseApiError()`: extracts user-friendly message from `{"errors": [...]}` or `{"error": "..."}` responses; handles 429, 5xx, and network errors
- Global `QueryCache`/`MutationCache` onError handlers call `showErrorToast()`, so individual components don't need per-mutation error handling
- `ErrorBoundary` catches render errors with a retry button

### Google OAuth (Frontend)
- `GoogleSignInButton` always renders a visible button (never hidden)
- When `VITE_GOOGLE_CLIENT_ID` is **configured**: loads `https://accounts.google.com/gsi/client` dynamically, initializes GIS, renders the official Google-branded sign-in button via `google.accounts.id.renderButton()`
- When `VITE_GOOGLE_CLIENT_ID` is **not configured**: renders a fallback button with inline Google logo SVG; clicking shows a toast directing the dev to set the env var
- On credential response: sends ID token to `POST /api/auth/google/`, stores JWT, redirects to dashboard
- Shows loading overlay during authentication
- Present on both Login and Register pages

### Mock Mode
- Set `VITE_MOCK_MODE=false` in `.env` to use real API
- Any value other than `false` (or unset) enables mock mode — all API calls return static data via `mockFetch()`
- Default in `.env` is `VITE_MOCK_MODE=false`

### Chunk Size Note
The production build produces a single JS chunk ~970 KB (due to `@hugeicons/react`). For production, add `build.rolldownOptions.output.codeSplitting: true` to `vite.config.ts` or lazy-load icon sets.

---

## Setup & Configuration

### Backend
```bash
cd vericlick-backend/Vericlick_project
cp Vericlick_project/.env.example Vericlick_project/.env  # or edit existing
../.vericlick-venv/Scripts/python.exe manage.py migrate
../.vericlick-venv/Scripts/python.exe manage.py runserver
```

Environment variables (`.env`):
```
SECRET_KEY=<django secret key>
DEBUG=True
ALLOWED_HOSTS=*
DATABASE_URL=sqlite:///db.sqlite3
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173
# GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### Frontend
```bash
cd vericlick-frontend
npm install
npm run dev
```

Environment variables (`.env`):
```
VITE_MOCK_MODE=false
VITE_API_BASE_URL=http://localhost:8000/api
# VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select existing
3. Enable **Credentials** → **Create OAuth 2.0 Client ID** (Web application)
4. Add `http://localhost:5173` to Authorized JavaScript origins
5. Copy the Client ID
6. Set `GOOGLE_CLIENT_ID` in backend `.env`
7. Set `VITE_GOOGLE_CLIENT_ID` in frontend `.env`

### Production Checklist
- [ ] Set `DEBUG=False` in backend `.env`
- [ ] Set a strong `SECRET_KEY`
- [ ] Set `ALLOWED_HOSTS` to production domain
- [ ] Set `CORS_ALLOWED_ORIGINS` to production frontend URL
- [ ] Configure real email backend for password reset
- [ ] Implement actual bot detection/scoring logic
- [ ] Set up a proper database (PostgreSQL recommended)
- [ ] Run `python manage.py collectstatic`
- [ ] Enable code-splitting in Vite config for chunk size
- [ ] Add `og-image.png` to `vericlick-frontend/public/` for social preview
