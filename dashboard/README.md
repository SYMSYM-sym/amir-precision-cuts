# IFM Dashboard

Internal Next.js admin UI for **SYMSYM-sym/ifm-rebuild**. It reads and commits YAML/Markdown in that repo via the GitHub API and dispatches GitHub Actions. The PAT never ships to the browser.

**Deploy target:** https://ifm-dashboard.vercel.app

## Run locally

```bash
npm install
cp .env.example .env.local
# Fill GH_TOKEN, DASHBOARD_PASSWORD, SESSION_SECRET (32+ chars)
npm run dev
```

Open http://localhost:3000 — you should be redirected to `/login`.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GH_TOKEN` | Yes | PAT with `repo` + `workflow` for `ifm-rebuild` |
| `GH_OWNER` | Yes | Default `SYMSYM-sym` |
| `GH_REPO` | Yes | Default `ifm-rebuild` |
| `DASHBOARD_PASSWORD` | Yes | Shared login password |
| `SESSION_SECRET` | Yes | iron-session sealing secret |

On Vercel these are set as server-side env vars (not `NEXT_PUBLIC_*`).

## Deploy notes

- Connect the **ifm-dashboard** repository to Vercel (team project).
- Set the env vars above in the Vercel project settings.
- Production URL: https://ifm-dashboard.vercel.app
- After login, exercise `/`, `/queue`, `/prs`, `/workflows`, `/brand`, `/articles`.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build (requires env at build time only for routes that call GitHub during static analysis; dashboard layout uses `force-dynamic`)
- `npm run lint` — ESLint

## Security

All Octokit usage lives under `lib/github.ts` and API route handlers. Client components only call `/api/*`. Do not add `NEXT_PUBLIC_GH_TOKEN` or embed tokens in client code.
