# Project Handoff (2026-03-27)

## Current Status

- Frontend and backend are connected.
- Product rebranded from `SentinelAI` to `VulNexa` across UI pages.
- Custom logo added: `vulnexa-logo.svg` and wired into all page headers.
- Frontend switched from Tailwind CDN to local Tailwind CLI build:
  - `tailwind.config.js`
  - `tailwind.input.css`
  - generated `tailwind.css`
- Login reliability hardening added:
  - Frontend `app.js` now defaults API calls to same-origin `/api` (with optional manual `localStorage.apiBase` override for debugging).
  - Frontend `vercel.json` rewrite now points `/api/*` to backend Vercel domain (`https://backend-digitalichies-projects.vercel.app/*`) for Vercel-domain operation.
  - Backend CORS in `main.ts` now supports comma-separated `FRONTEND_ORIGIN` values.
- Authentication and scan flow are wired in UI and API.
- Downloadable scan reports implemented:
  - `GET /scans/:scanId/report?format=md|json`
  - Scan Results page has a download button.
- Admin dashboard implemented:
  - Admin page: `admin.html`
  - API: `GET /admin/dashboard`
  - Protected by admin role.
- HTTPS-ready deployment scaffold added:
  - `deployment/docker-compose.yml`
  - `deployment/Caddyfile`
  - `deployment/README.md`
  - `deployment/docker-compose.yml` now mounts `tailwind.css` for static serving.
- Authorized outbound proxy support added for scanner egress:
  - `OUTBOUND_PROXY_URL` in env/config.
- Playwright browser path configured for local runtime:
  - `PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers` in env files.
- Backend Vercel deployment support added:
  - `backend/vercel.json`
  - `backend/api/index.js`
  - `backend/src/serverless.ts`
- Backend Vercel runtime hardening completed:
  - `backend/vercel.json` now runs `prisma generate` during build and includes `prisma/**` files in function bundle.
  - `backend/src/serverless.ts` now prepares writable SQLite runtime DB by copying bundled `prisma/dev.db` to `/tmp/vulnexa.db` on cold start.

## Security Policy Notes

- IP/MAC spoofing or concealment is not implemented and should not be added.
- Use authorized proxy/egress controls for compliant testing instead.

## Validation Completed

- Backend build passes (`npm run build`).
- Report endpoint tested and returns attachment successfully.
- Admin route access control verified (non-admin forbidden).
- API activation re-verified locally: `GET http://localhost:4000/auth/csrf-token` returns `200`.
- Password credentials are hashed with bcrypt:
  - `auth.service.ts` hashes user passwords and refresh tokens.
  - login and refresh compare bcrypt hashes.
- Admin login path re-verified end to end:
  - register user
  - promote role via `npm run user:promote-admin -- user@example.com`
  - login user
  - access `GET /admin/dashboard` successfully
- Full live API flow test re-run:
  - login (`secopsai20@gmail.com`) OK
  - create scan OK
  - findings/report/admin endpoints OK
  - scan execution currently fails on this machine when Playwright browser download is unavailable
- Backend deployed to Vercel project:
  - Project: `digitalichies-projects/backend`
  - Latest production URL: `https://backend-jwsn91khy-digitalichies-projects.vercel.app`
  - Stable alias: `https://backend-digitalichies-projects.vercel.app`
  - Production env updated for Vercel-domain flow:
    - `APP_URL=https://backend-digitalichies-projects.vercel.app`
    - `FRONTEND_ORIGIN` includes `vulnexa-web.vercel.app` aliases and `vulnexa.com` domains
- Custom API domain attached in Vercel:
  - `api.vulnexa.com` -> project `backend`
  - Pending DNS verification at Cloudflare:
    - Add `A` record: `api.vulnexa.com` -> `76.76.21.21`
- Live backend smoke test (via protected deployment URL + bypass header) passes for:
  - register/login
  - create scan / status / findings / report download
  - admin login / admin dashboard
  - scan execution currently ends as `failed` in runtime test flow
- Frontend deployed to Vercel project:
  - Project: `digitalichies-projects/vulnexa-web`
  - Latest production URL: `https://vulnexa-ae0viwppk-digitalichies-projects.vercel.app`
  - Alias: `https://vulnexa-web.vercel.app`
- Deployment protection disabled on Vercel projects:
  - `backend`: `ssoProtection=null`, `passwordProtection=null`
  - `vulnexa-web`: `ssoProtection=null`, `passwordProtection=null`
  - Public checks now pass without bypass headers:
    - `https://vulnexa-web.vercel.app` -> `200`
    - `https://backend-digitalichies-projects.vercel.app/auth/csrf-token` -> `200`
    - `https://vulnexa-web.vercel.app/api/auth/csrf-token` -> `200`
- Custom frontend domains attached in Vercel:
  - `vulnexa.com` -> project `vulnexa-web`
  - `www.vulnexa.com` -> project `vulnexa-web`
  - Pending DNS verification at Cloudflare:
    - Add `A` record: `vulnexa.com` -> `76.76.21.21`
    - Add `A` record: `www.vulnexa.com` -> `76.76.21.21`
- Vercel DNS zone prepared (for nameserver-switch path):
  - `@ A 76.76.21.21`
  - `www A 76.76.21.21`
  - `api A 76.76.21.21`
  - Note: these only become authoritative if domain nameservers are changed to Vercel.

## Next Session: Start Here

1. Complete DNS cutover for VulNexa domains in Cloudflare:
   - `A` record: `vulnexa.com` -> `76.76.21.21`
   - `A` record: `www.vulnexa.com` -> `76.76.21.21`
   - `A` record: `api.vulnexa.com` -> `76.76.21.21`
   - Wait for Vercel domain verification.
2. Keep backend production env aligned:
   - `backend/.env`
   - `backend/.env.production.example`
3. Ensure admin account exists:
   - First registered user is admin, or
   - `npm run user:promote-admin -- user@example.com`
4. Run full UAT on live HTTPS:
   - Register/login
   - Create scan
   - View findings/report
   - Download report
   - Verify admin dashboard
5. If scan execution fails with missing browser binary:
   - Run `npx playwright install chromium`
   - If network is restricted, allow `cdn.playwright.dev` and `storage.googleapis.com` egress.
