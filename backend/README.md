# UL Scanner Backend (NestJS)

Secure-by-default NestJS API for an AI-powered web application penetration testing tool.

## Security posture

- JWT access token auth + rotating refresh tokens
- Refresh token stored in `HttpOnly` cookie
- CSRF protection via `csurf`
- Password hashing via `bcrypt`
- RBAC with `admin` and `tester` roles
- Broken access control prevention:
  - Global JWT guard
  - Role guard
  - Scan ownership checks in service layer
- Global DTO validation and payload sanitization
- `helmet` for security headers
- `hpp` for HTTP parameter pollution defense
- Global rate limiting via Nest Throttler
- Prisma ORM only (no raw SQL)
- Audit log tracking user and scan actions
- Scan scope/domain allowlist enforcement

## Modules

- `auth`: register/login/refresh/logout/csrf-token
- `users`: profile and admin user management
- `scan`: trigger/list/detail/findings
- `scan`: trigger/list/detail/findings/report-download
- `admin`: admin dashboard metrics and audit visibility
- `crawler`: Playwright-based crawler
- `scanner`: XSS detection logic
- `audit`: audit trail persistence
- `prisma`: DB client + models

## Quick start

1. Copy env:

```bash
cp .env.example .env
```

2. Install deps:

```bash
npm install
```

3. Generate Prisma client and migrate:

```bash
npm run prisma:generate
npm run prisma:migrate
```

4. Run dev server:

```bash
npm run start:dev
```

## CSRF + auth flow


1. `GET /auth/csrf-token` (public) to obtain CSRF token.
2. Include token in `x-csrf-token` header for mutating requests (`POST`, `PATCH`, `DELETE`).
3. Login/register endpoints return access token and set refresh cookie.
4. Use `POST /auth/refresh` to rotate tokens when access token expires.

## API summary

- `GET /auth/csrf-token` (public)
- `POST /auth/register` (public)
- `POST /auth/login` (public)
- `POST /auth/refresh` (public)
- `POST /auth/logout` (auth)
- `GET /users/me` (auth)
- `GET /users` (admin)
- `POST /users` (admin)
- `POST /scans` (admin|tester)
- `GET /scans` (admin|tester)
- `GET /scans/:scanId` (owner or admin)
- `GET /scans/:scanId/findings` (owner or admin)
- `GET /scans/:scanId/report?format=md|json` (owner or admin, downloadable)
- `GET /admin/dashboard` (admin)

## Admin bootstrap

- The first registered account becomes `admin`.
- All subsequent self-registered accounts are `tester`.
- Admins can create additional users via `POST /users`.
- If needed, promote an existing user:
  - `npm run user:promote-admin -- user@example.com`

## Downloadable reports

You can generate ready-to-download scan documentation:
- Markdown: `GET /scans/:scanId/report?format=md`
- JSON: `GET /scans/:scanId/report?format=json`

The response is returned with `Content-Disposition: attachment`.

## Network identity / egress

- Direct IP or MAC spoofing is not supported.
- For authorized network routing, configure `OUTBOUND_PROXY_URL` in `.env`.
- All scan actions are auditable through `AuditLog`.

## HTTPS deployment

Use the production deployment assets in:
- `../deployment/docker-compose.yml`
- `../deployment/Caddyfile`
