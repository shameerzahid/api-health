# Foundation Health Monitor

Separate Next.js app that smoke-checks Foundation APIs, runs PageSpeed on CRM pages, and probes basic security headers. Dark dashboard for Super Admin use. Deploys on Vercel with cron.

No Nest/Express backend — Next.js App Router API routes only.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Vercel Cron for scheduled runs
- Neon Postgres for result storage (v1)
- Google PageSpeed Insights API (not local Chrome Lighthouse)
- Password gate via `DASHBOARD_PASSWORD` and/or Vercel Deployment Protection

## Local setup

```bash
cp .env.example .env.local
# fill in env vars (see below)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Required env

| Variable | Purpose |
| --- | --- |
| `FOUNDATION_API_BASE_URL` | API origin, e.g. `https://api.example.com` (no trailing slash) |
| `FOUNDATION_WEB_BASE_URL` | CRM origin for PSI page checks |
| `FOUNDATION_MONITOR_TOKEN` | Optional static JWT override (prefer dashboard Connect) |
| `PAGESPEED_API_KEY` | Google PSI API key (server-only) |
| `CRON_SECRET` | Shared secret for `/api/run-checks` |
| `DASHBOARD_PASSWORD` | Simple dashboard password gate |
| `DATABASE_URL` | Neon Postgres connection string |

Optional Vercel KV vars are listed in `.env.example` if you prefer KV later.

## Targets

- **API inventory** — generated from `foundation-be` controllers into `config/api-inventory.json` (**303** routes). Regenerate with `npm run generate:api-inventory` (set `FOUNDATION_BE_SRC` if the BE isn’t a sibling checkout).
- **API smoke** — all **GET** routes without path params on tenant/public surfaces (~70). Field/platform and mutating methods are inventory-only (different auth / would change data).
- **Pages** — ~8 CRM routes; each checked mobile + desktop via PSI
- **Security** — HTTPS + headers (HSTS, X-Content-Type-Options, clickjacking/CSP, Referrer-Policy, Permissions-Policy) on API `/health` and web `/` + `/login`; cookie Secure/HttpOnly/SameSite when Set-Cookie is present

Prod Foundation does not expose Swagger (`/api/docs-json`); controller scan is the inventory source.

## Deploy on Vercel

1. Create a new Vercel project from this repo (keep it separate from foundation-be / foundation-crm-internal-fe).
2. Set the env vars above in the Vercel project settings.
3. Add a Neon database and set `DATABASE_URL`.
4. Enable Vercel Deployment Protection **or** rely on `DASHBOARD_PASSWORD`.
5. Add a cron in `vercel.json` (Phase 6) calling `/api/run-checks` with `CRON_SECRET`.

PSI is used because full Lighthouse/Chrome is a poor fit for Vercel serverless.

## Run checks locally

```bash
# requires FOUNDATION_*, PAGESPEED_API_KEY, CRON_SECRET, DATABASE_URL
curl -X POST "http://localhost:3000/api/run-checks" \
  -H "Authorization: Bearer $CRON_SECRET"

curl "http://localhost:3000/api/results" \
  -H "x-dashboard-password: $DASHBOARD_PASSWORD"
```

Store smoke (DB only):

```bash
node --env-file=.env.local --import tsx scripts/check-store.ts
```

## Roadmap

1. ~~Scaffold + targets~~
2. ~~Check runners + Neon store~~
3. ~~`/api/run-checks` + `/api/results`~~
4. Dashboard tables + Run now
5. Vercel cron
6. Stretch: OpenAPI inventory, multi-env, history, alerts

## Security

`PAGESPEED_API_KEY`, `FOUNDATION_MONITOR_TOKEN`, and `CRON_SECRET` must stay server-only. Never expose them to client components or public env (`NEXT_PUBLIC_*`).
