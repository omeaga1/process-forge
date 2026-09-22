# Cloud API (Cloudflare Worker + D1)

`packages/community-library-api` is the only server ProcessForge has. It serves
the community unit-op library and cloud project storage at
`https://process-forge-community-library.vprescenzi.workers.dev/api`.

## Who is who

There is one way to become a user: a Google sign-in that **the worker
verifies itself** (RS256 signature against Google's keys, issuer, audience,
expiry). The worker then issues its own 30-day session token, HMAC-signed with
`SESSION_SECRET`. Every project route takes the owner from that token and
nothing else.

| Route | Access |
|---|---|
| `GET /api/health`, `GET /api/unitops`, `GET /api/unitops/:id` | public |
| `POST /api/auth/google` (web: GIS credential) | public, verified |
| `POST /api/auth/google/code` (desktop: loopback code + PKCE) | public, verified |
| `GET /api/auth/me`, `POST /api/unitops/publish` | session |
| `GET/POST /api/projects`, `GET/DELETE /api/projects/:id` | session, owner only |

Email/password accounts are **local profiles**: stored and checked in the
browser, never sent to a server, and they cannot use the cloud.

### History

Until 2026-09-22 the worker read no credentials at all: `?userId=` listed
anyone's projects, `GET /api/projects/:id` returned anyone's flowsheet, `POST`
overwrote any project by id, `DELETE` removed any project, and
`/api/auth/session` upserted any profile. The app decoded Google tokens without
checking the signature. The web test suite also saved projects through the
production API on every run; all 117 rows in `simulation_projects` at the time
were test data owned by `usr_github_*` ids that can no longer authenticate.

## Configuration

| Name | Kind | Where |
|---|---|---|
| `GOOGLE_CLIENT_IDS` | var (public) | `wrangler.toml`: web OAuth client ID(s), comma-separated |
| `SESSION_SECRET` | secret | `wrangler secret put SESSION_SECRET`; 32+ random characters |
| `GOOGLE_DESKTOP_CLIENT_ID` | var (public) | `wrangler.toml`, once the desktop client exists |
| `GOOGLE_DESKTOP_CLIENT_SECRET` | secret | `wrangler secret put GOOGLE_DESKTOP_CLIENT_SECRET` |

The worker refuses to issue sessions without a `SESSION_SECRET` of at least 32
characters. Rotating it signs everyone out.

## Deploying

```
cd packages/community-library-api
pnpm test                 # real SQLite, real SQL, forged-token cases
pnpm db:migrate           # wrangler d1 migrations apply ... --remote
npx wrangler deploy
```

Deploy the worker **before** the web app when a change touches both: the app
calls the new routes as soon as it is live.

## Desktop Google sign-in

Google rejects `http://tauri.localhost` as a web origin, so the desktop app uses
the installed-app flow (RFC 8252): system browser, a one-shot listener on
`127.0.0.1`, PKCE. The worker does the code exchange so the desktop client
secret is not shipped in the installer.

One-time setup:

1. Google Cloud Console → APIs & Services → Credentials → **Create credentials
   → OAuth client ID → Application type: Desktop app**. No redirect URIs are
   needed; loopback redirects are allowed for desktop clients.
2. Put the client ID in `apps/web/.env.production` as
   `VITE_GOOGLE_DESKTOP_CLIENT_ID=...` and in `wrangler.toml` as
   `GOOGLE_DESKTOP_CLIENT_ID = "..."`.
3. `npx wrangler secret put GOOGLE_DESKTOP_CLIENT_SECRET` and paste the secret
   at the prompt.
4. Deploy the worker, then tag a desktop release.

Until then the desktop app says Google sign-in is not set up and works without
an account.
