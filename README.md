# Qattan AI (قطان AI)

> **AI Architectural Visualization Platform** — production-ready at **[www.qattan-ai.com](https://www.qattan-ai.com)**
> Bilingual (Arabic RTL / English LTR) platform that turns sketches, photos, and plans into photorealistic architectural renders, presentation boards, and CAD exports.

Qattan AI ships a public marketing site, a unified browser studio with **8 live AI tools**, Supabase-backed Google authentication, an atomic daily-credit engine aligned to Cairo midnight, and an Egyptian InstaPay top-up system with manual admin approval. Every push to `main` auto-deploys to Vercel production.

- **Canonical origin:** `https://www.qattan-ai.com` (via `lib/site.ts`)
- **Repository:** [`yusef47/egyptian-ai-facade-center`](https://github.com/yusef47/egyptian-ai-facade-center), branch `main`
- **Status:** production — authenticated, credit-gated, payment-enabled

---

## 1. System & Tech Stack Overview

| Layer | Technology | Role |
| --- | --- | --- |
| Framework | **Next.js 15 (App Router, Node.js runtime)** | Marketing routes, studio route, metadata, server route handlers |
| Language | **TypeScript** (strict, `tsc --noEmit` in CI path) | Typed route boundaries, server contracts, content dictionaries |
| Styling | **Tailwind CSS v4** + authored CSS | Design tokens, RTL/LTR presentation, light/dark themes, responsive layout |
| UI runtime | **React 19**, Radix primitives, Framer Motion, Lucide icons | Interactive marketing, studio, modals, exports |
| Database / Auth | **Supabase PostgreSQL** | Google OAuth, Row Level Security, profiles, credit RPCs, top-up tables |
| AI engine | **OpenRouter upstream** (branded *Qattan Vision v4.2* / *Qattan Architectural Engine*) | Multimodal image generation behind a server-only gateway |
| Image processing | **Sharp** (server) + canvas/Potrace-WASM (browser) | Response compression; local raster→DXF vectorization |
| CAD export | ASCII DXF AC1009/R12 + **JSZip** | AutoCAD-compatible DXF and ZIP downloads |
| Testing | **Vitest + React Testing Library** | 359 tests across 45 suites: unit, contract, route, component, migration-parity |
| Hosting | **Vercel** | Auto-deploy from `main`, serverless API execution (60s max on the engine route) |

### Architectural flow

```text
Browser (/ /ar /en /studio /admin)
  │
  ├── Google Sign-In (Supabase OAuth) → /auth/callback → session
  │
  ├── Studio → /api/restore  ── Bearer token ──▶ credit gate (deduct 1)
  │                                              │
  │                                              ▼
  │                                    lib/openrouter-engine.ts
  │                                    shared 45s abort deadline,
  │                                    ≤2 upstream attempts w/ fallback model
  │
  ├── Header badge ◀── /api/user/credits (service-role read + Cairo refresh)
  │
  └── Top-up modal → /api/topup/request (receipt validation + SHA-256 dedup)
                          │
                          ▼
                    /admin queue → /api/admin/topup/approve
                          │  atomic approve_topup() RPC
                          ▼
                    credits granted, header badge live-updates
```

The OpenRouter key is read only by server-side code. The browser sends an image data URL, prompt, and tool mode to `/api/restore` and never sees any provider credential. All credit mutations happen server-side through the service-role client — the client-claimed balance is never trusted.

---

## 2. The Atomic Daily Credit Engine

Every authenticated user receives **10 free credits per day**, replenished at Cairo midnight. The engine is designed so that credits are deducted exactly once per generation, refunded on failure, and can never be silently destroyed or double-granted.

### Cairo midnight rollover

- Replenishment fires when the profile's `last_credit_reset` falls on an **earlier Cairo calendar date** than today — a strict `YYYY-MM-DD` string comparison via `Intl` with `timeZone: 'Africa/Cairo'`, immune to hours, minutes, seconds, and DST drift (UTC+2 EET / UTC+3 EEST).
- Generating at 23:59 Cairo and again at 00:01 yields a fresh allowance; generating twice in one afternoon never re-gifts.

### Floor, never a ceiling

- All balance writes use `greatest(credits, 10)` semantics: balances **below** the allowance (0, 5, 9) are topped up to 10, balances **at or above** it (19, 50, 100 — purchased packs) are preserved in full and only the reset timestamp moves.
- This holds in every layer that writes the allowance: `lib/credits.ts` (`Math.max(currentCredits, DAILY_CREDITS)`) and both the `refresh_daily_credit` RPC and the migration's bulk-alignment UPDATE (`greatest(credits, 10)`).

### Primary authority: the `refresh_daily_credit` RPC

- The application calls `admin.rpc("refresh_daily_credit", { user_id })` **first**. The Postgres function (`SECURITY DEFINER`) performs the entire refresh — Cairo calendar-day guard + floor write — in **one guarded atomic UPDATE** and returns the authoritative balance, which is returned immediately when numeric.
- The RPC runs with elevated privileges, so it is immune to PostgREST RLS restrictions and cannot be raced by concurrent requests.
- A JS fallback in `lib/credits.ts` (same Cairo rule, read-then-write) covers databases where the RPC is absent or errors, entered via `[REFRESH_RPC_FALLBACK]` logs.

### Route gate: `/api/user/credits`

- `GET /api/user/credits` authenticates the bearer token, triggers the refresh (RPC-first), and returns the authoritative balance for the header badge.
- The fallback is **non-locking**: on any transient database write error it logs `[REFRESH_UPDATE_ERROR]` and returns the optimistic `newBalance` instead of the stale read, so a failed write can never lock a user out of the allowance they are entitled to on a new Cairo day.

### Atomic deduction and uncapped refund

- `deduct_credit(user_id uuid, p_amount integer default 1)` — executes **before** the upstream engine call; checks `credits > 0`, decrements by exactly 1, increments `generations_used`, and returns the new balance. Failure aborts generation with no upstream call.
- `refund_credit(user_id uuid)` — uncapped `credits = credits + 1`, so a failed render refunds correctly even for a user holding 100 purchased credits (the old `least(credits + 1, 10)` cap that vaporized paid balances was removed).
- Exactly **one** API request and **one** credit are consumed per Generate click regardless of output presentation mode (single image, 3-gallery sheet, triptych board) — presentation only changes the prompt, never the call count.

### New-user provisioning

- The `on_auth_user_created` trigger on `auth.users` inserts a `profiles` row with `credits = 10` and a fresh `last_credit_reset` at signup.
- Race-safe belt-and-braces: if the refresh read returns no profile (e.g. pre-trigger legacy signup), `provisionProfileCredits()` performs an `ignoreDuplicates` upsert + authoritative re-read on first use instead of answering 429 — no user is ever permanently locked out.

### Observability

Every decision point logs a structured line traceable in Vercel runtime logs: `[REFRESH_RPC]`, `[REFRESH_RPC_FALLBACK]`, `[REFRESH_CHECK]`, `[REFRESH_GRANTED]` (with `oldCredits`/`newCredits`), `[REFRESH_UPDATE_ERROR]`, `[REFRESH_PROFILE_MISSING]`, and deduction/refund confirmations.

---

## 3. Egypt Top-up & Payment Review System

### Manual admin approval workflow — zero automatic granting

Every InstaPay transfer receipt submitted by any user stays in `status: 'pending'` until an authorized admin reviews the uploaded receipt in the `/admin` dashboard, cross-references the phone/InstaPay bank notification, and clicks **Approve**. No code path grants credits automatically — the request API always responds with `autoApproved: false`.

### User submission flow

1. **Top-Up modal** (`components/qattan/TopUpModal.tsx`) — credit packs (10 / 50 / 100 credits) plus a custom slider (10–500 at 5 EGP/credit), InstaPay direct link `https://ipn.eg/S/ahmedelqattan78/instapay/9RkGnD` and handle `ahmedelqattan78@instapay` with copy buttons and a scannable QR (`public/instapay-qr.svg`), and an auto-generated reference code (`REF-XXXXXX`).
2. **Receipt upload** — the image is validated server-side (MIME + magic-byte sniffing: JPEG/PNG/WebP, 10 KB–10 MB) and persisted as a data URL in `topup_requests.receipt_url`.
3. **Anti-replay deduplication** — a SHA-256 hash of the receipt image is stored and checked; resubmitting a previously used receipt is rejected.
4. **Pending queue** — the submission is inserted with `status: 'pending'` and the API returns `ok / autoApproved: false / requestId / refCode / message` (bilingual).

> **Payment rails:** InstaPay is the exclusive Egyptian payment rail. The API rejects every other payment method, and no mobile-wallet rails exist anywhere in the product.

### Atomic approval via `approve_topup`

- `approve_topup(p_request_id uuid)` (`SECURITY DEFINER`, called only by the admin API route) validates the request is still pending, sets `status = 'approved'` with `reviewed_by` / `reviewed_at`, and increments `profiles.credits` by the requested amount in one transaction.
- Rejection marks the request `rejected` with reviewer attribution.
- On approval the new balance flows back through the `qattan:credits` event so the header badge updates instantly.

### Admin dashboard & hardening

- `/admin` renders pending top-up requests (user name/email, credits + EGP amount, reference code, receipt preview modal) with gold **Approve** / muted **Reject** actions and platform statistics.
- Authorization is **server-side** (`lib/admin.ts`): the owner (`yusefelshater979@gmail.com`), the co-admin (`archkattan78@gmail.com`), and any emails in `ADMIN_EMAILS` — enforced on `/admin`, `/api/admin/stats`, and `/api/admin/topup/approve`.
- The stats RPCs `admin_platform_stats()` and `admin_recent_profiles(integer)` are `SECURITY DEFINER` and **locked down**: `EXECUTE` is revoked from `public`, `anon`, and `authenticated` and granted strictly to `service_role`, so the browser-shipped anon key cannot dump user data.

### Security layers on `/api/restore`

| Layer | Control |
| --- | --- |
| Auth | Mandatory Supabase bearer token; unauthenticated requests fail closed with 401 |
| CSRF | Origin allowlist (apex + www + Vercel deployments) |
| Rate limit | In-memory limiter (15 req/min/user) with a friendly bilingual 429 |
| Dedup | Concurrent duplicate guard per user |
| Input | Image data-URL validation (magic bytes, size bounds) |
| Credits | Pre-deduction before any upstream call; refund on failure |

---

## 4. Database Migrations & SQL Setup

All database objects live in idempotent SQL migrations under `supabase/migrations/`. **Run them in the Supabase SQL editor in order** (each file is safe to re-run):

| File | Contents |
| --- | --- |
| `20260910_qattan_profiles.sql` | `profiles` table (`credits`, `last_credit_reset`, `generations_used`), the credit RPCs `refresh_daily_credit`, `deduct_credit`, `refund_credit` with `greatest(credits, 10)` floor semantics, the `on_auth_user_created` trigger granting 10 credits at signup, and a bulk alignment UPDATE for existing rows |
| `20260910_qattan_admin.sql` | Admin stats RPCs `admin_platform_stats()` and `admin_recent_profiles(integer)`, RLS policies on `profiles` (`select_own` / `insert_own`), and the **service-role lockdown**: `revoke execute … from public, anon, authenticated` + `grant execute … to service_role` |
| `20260914_qattan_topups.sql` | `topup_requests` and `promo_codes` tables, RLS (`topup_requests_select_own`), `approve_topup(p_request_id uuid)` atomic approval RPC, promo redemption RPC |

### Service-role & RLS notes

- **Service role (`SUPABASE_SERVICE_ROLE_KEY`)** bypasses RLS and is the only client permitted to call the credit and admin RPCs. It is used exclusively by server-side code (`lib/credits.ts`, `lib/topups.ts`, `lib/admin.ts`) — never imported into client bundles, never prefixed `NEXT_PUBLIC_`.
- **Anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)** ships to the browser for OAuth sessions and reads the user's own profile under the `select_own` RLS policy. Users can read their own credits but can never write them — all writes flow through `SECURITY DEFINER` RPCs invoked server-side.
- Credit balances are therefore server-authoritative end to end: the client displays values but cannot mutate them.
- `promo_codes` and other users' `topup_requests` rows are invisible to the anon role by RLS.

---

## 5. Required Environment Variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL (browser OAuth client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon key (browser session client, own-profile reads) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Service-role client for credit RPCs, top-up approval, admin stats — must never reach the browser |
| `OPENROUTER_API_KEY` | **Server only** | Upstream AI engine credential; never rendered into client code |
| `ADMIN_EMAILS` | Server | Comma-separated admin allowlist extending `lib/admin.ts` beyond the two hardcoded owner emails |

Optional: `NEXT_PUBLIC_SITE_URL` overrides the canonical origin (`https://www.qattan-ai.com` by default) for preview/staging deployments.

Copy the template and fill in real values locally:

```bash
cp .env.example .env
```

Never commit `.env` or real keys. Do not add a `NEXT_PUBLIC_` prefix to server-only variables. In Vercel, configure all variables under Project Settings → Environment Variables for Preview and Production.

---

## 6. Build, Test & Deployment Sequence

### Local verification

```bash
npm ci                    # exact lockfile install
npm run typecheck         # tsc --noEmit — must report 0 errors
npm test                  # Vitest suite — 359 tests across 45 suites
npm run build             # Next.js production build
npm run start             # serve the production build locally
```

The suite covers the generation route contract, engine request construction and retry budget, credit refresh/deduct/refund cycles (including Cairo calendar-day boundaries and balance preservation), top-up submission and manual-approval contracts, admin authorization, bilingual locale rendering, marketing components, CAD/DXF export, and **migration source-parity** (the SQL files are asserted against so app and database behavior cannot drift).

### Deployment

The project auto-deploys to **Vercel production on every push to `main`**, served at `https://www.qattan-ai.com`. The root `vercel.json` selects the Next.js framework, pins `npm ci`, and sets the engine route's 60-second maximum duration:

```json
{
  "framework": "nextjs",
  "installCommand": "npm ci",
  "buildCommand": "npm run build",
  "functions": { "app/api/restore/route.ts": { "maxDuration": 60 } }
}
```

The engine's shared **45-second abort deadline** (`ENGINE_FETCH_BUDGET_MS`) bounds all upstream attempts within that window, leaving headroom for the refund round-trip so a credit is never consumed without an image or a refund.

A release sequence:

```bash
npm ci && npm run typecheck && npm test && npm run build
git push origin main      # Vercel auto-deploys — confirm the build in Vercel logs
```

Do not treat a successful Git push as proof the deployment completed; verify in Vercel's build/deployment logs. After changing any SQL migration, re-run the corresponding file in the Supabase SQL editor — migrations are idempotent and deploy-time only (Vercel does not run them).

---

## Studio workflows

### 8 live AI tools (`tools/registry.ts`)

| # | Tool | Purpose |
| --- | --- | --- |
| 1 | **Exterior AI** (`exterior`) | Facade redesign, materials, and lighting transformation |
| 2 | **Interior AI** (`interior`) | Interior atmosphere, finishes, and furnishing studies |
| 3 | **Sketch to Image** (`sketch`) | Hand-drawn concepts into photorealistic renders |
| 4 | **Masterplan AI** (`masterplan`) | Site and urban design aerial studies |
| 5 | **Landscape AI** (`landscape`) | Gardens, pools, and outdoor realm visualization |
| 6 | **Virtual Staging** (`staging`) | Furnishing empty rooms for presentation |
| 7 | **Render Enhancer** (`enhancer`) | Draft renders into ultra-detailed 8K output |
| 8 | **Floor Plan to CAD** (`floorplan`) | Plan/Elevation/Section/Perspective sheet + local DXF vectorization |

All tools enforce **100% structural fidelity** to the uploaded image's geometry (proportions, openings, structural elements preserved) and produce **zero-watermark** presentation output. Each generation costs exactly 1 credit.

### Specialized outputs

- **Facade Restoration triptych:** one request returns an ultra-wide board of three coordinated style variations (Khedivial Classic, Hashami/Biophilic, Islamic Mashrabiya) preserving the source massing and floor rhythm.
- **Floor Plan to CAD:** one request produces the 2×2 sheet; the browser then crops, upscales, thresholds, vectorizes (Potrace-WASM), and exports editable ASCII DXF files / ZIP locally — downloads never re-bill.

> **Professional-use notice:** AI images and raster-derived DXF files are conceptual studies, not measured surveys or construction documents. A licensed architect or engineer must verify dimensions, wall thicknesses, openings, structure, materials, code compliance, and permissions before professional use.

---

## Routes

| Route | Purpose | Access |
| --- | --- | --- |
| `/` | Default Arabic marketing page | Public |
| `/ar/`, `/en/` | Explicit locale marketing pages | Public |
| `/studio` | Unified 8-tool workspace | Auth-gated at generation |
| `/admin` | Admin dashboard: stats + top-up approval queue | Admin allowlist only |
| `/privacy`, `/terms` | Legal pages (OAuth publishing requirements) | Public |
| `/auth/callback` | Supabase OAuth code exchange | Public |
| `POST /api/restore` | Credit-gated generation endpoint | Bearer token |
| `GET /api/user/credits` | Authoritative balance (triggers Cairo refresh) | Bearer token |
| `POST /api/topup/request` | Submit InstaPay top-up with receipt | Bearer token |
| `POST /api/topup/promo` | Promo-code redemption | Bearer token |
| `POST /api/admin/topup/approve` | Approve/reject top-up requests | Admin only |
| `GET /api/admin/stats` | Platform statistics | Admin only |
| `/robots.txt`, `/sitemap.xml` | Crawler policy; canonical URLs with `en`/`ar` alternates | Public |

All absolute URLs — `metadataBase`, canonical tags, `hreflang` alternates, OpenGraph/Twitter cards, robots, sitemap — resolve through `lib/site.ts`.

---

## Key source locations

```text
app/api/restore/route.ts            # Generation endpoint: auth → credit gate → engine
app/api/user/credits/route.ts       # Balance endpoint (service-role, Cairo refresh)
app/api/topup/request/route.ts      # Receipt validation, SHA-256 dedup, pending insert
app/api/topup/promo/route.ts        # Promo redemption
app/api/admin/stats/route.ts        # Admin-only statistics
app/api/admin/topup/approve/route.ts# Admin approval / rejection
app/admin/page.tsx                  # Admin dashboard (stats + top-up queue)
app/auth/callback/route.ts          # OAuth code exchange
lib/credits.ts                      # Credit authority: RPC-first refresh, deduct/refund, provisioning
lib/openrouter-engine.ts            # Engine prompts, 45s deadline, ≤2 attempts, fallback model
lib/topups.ts                       # Top-up submission, pricing, promo redemption
lib/admin.ts                        # Server-side admin authorization
lib/supabase.ts                     # Supabase clients + DAILY_CREDITS constant
lib/request-guards.ts               # Rate limiting + dedup guards
lib/image-validation.ts             # MIME + magic-byte validation
lib/site.ts                         # Canonical origin
components/qattan/*                 # Marketing, studio, modals, AuthButton, TopUpModal
tools/registry.ts                   # The 8-tool registry, prompts, help guides
client/src/lib/restore.ts           # Browser API client: token refresh, credit events
supabase/migrations/                # Idempotent SQL schema + RPCs (see §4)
tests/                              # Vitest suites (359 tests, 45 files)
```

## Security, reliability, and product boundaries

- Server-only secrets: `SUPABASE_SERVICE_ROLE_KEY` and `OPENROUTER_API_KEY` are never rendered into client code.
- All credit mutations are server-side RPCs; client-claimed balances are never trusted.
- Endpoints fail closed on unauthenticated or missing-token requests (401) and on overdrawn balances (429 with a bilingual message).
- The in-memory rate limiter is instance-local; a multi-instance deployment should move to an external store.
- Session history is React state only; generated images live in the session, not in persistent storage.
- All AI outputs require human architectural review before professional, regulatory, construction, or heritage use.

## License

See [LICENSE](LICENSE) for the repository's license terms.
