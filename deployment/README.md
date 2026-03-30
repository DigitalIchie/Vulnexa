# Vercel Deployment Track (Primary)

Use this track when hosting frontend on Vercel and backend on a separate server.

## 1) Backend host and API domain

Deploy `backend/` to a Node-capable host (Render, Railway, Fly.io, VPS, etc.) and map:
- `api.vulnexa.com` → backend service (the authoritative API)

Backend env should include:
- `NODE_ENV=production`
- `APP_URL=https://api.vulnexa.com` (backend API URL)
- `FRONTEND_ORIGIN=https://vulnexa.com,https://www.vulnexa.com` (frontend origin for CORS)
- strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- real `ALLOWED_SCAN_DOMAINS`

## 2) Vercel frontend setup

The root `vercel.json` is already configured to:
- rewrite `/api/*` to `https://backend-digitalichies-projects.vercel.app/*` (backend domain)
- support clean routes:
  - `/new-scan`
  - `/scan-results`
  - `/report`
  - `/admin`

If your backend URL differs, update `vercel.json` rewrite destination.

## 3) Deploy frontend to Vercel

1. Import this repo in Vercel.
2. Set project root to repository root.
3. Deploy.
4. Attach domains:
   - `vulnexa.com` (frontend)
   - `www.vulnexa.com` (frontend)

## 4) Verify

- Frontend: `https://vulnexa.com`
- Backend API: `https://api.vulnexa.com/auth/csrf-token`
- API via frontend proxy: `https://vulnexa.com/api/auth/csrf-token`

## Notes

- Backend API (`api.vulnexa.com`) has CORS locked to frontend domains (`vulnexa.com`, `www.vulnexa.com`).
- Scan execution requires Playwright browser binaries on backend host (`api.vulnexa.com`).
- Frontend users access backend transparently via frontend domain (`vulnexa.com/api/*` → `api.vulnexa.com/*`).

---

# Docker/Caddy Track (Legacy Optional)

If you still want self-hosted all-in-one deployment, use:
- `deployment/docker-compose.yml`
- `deployment/Caddyfile`
