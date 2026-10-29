# Deploying OAuth Launchpad

Two pieces, two hosts:

- **Backend** (FastAPI + SQLite) → **Fly.io**, for a persistent disk the
  database can live on. GitHub Actions deploys it on every push to `main`
  that touches `backend/`.
- **Frontend** (Next.js) → **Vercel**, via its native GitHub integration
  (no custom Action needed - Vercel deploys on every push itself, with
  preview deployments per PR for free).

Guide share links (`/guides/{id}`) are stable forever once both are set up,
because the guide `id` never changes and the database persists across
deploys via the Fly volume - the only things that can break a link are the
backend going offline or its disk getting wiped, both of which this setup
avoids.

## 1. Push this repo to GitHub

```bash
git remote add origin https://github.com/<you>/oauth-launchpad.git
git push -u origin main
```

## 2. Backend: Fly.io

One-time setup (local machine, needs the `flyctl` CLI - `brew install flyctl` or see fly.io/docs/flyctl/install):

```bash
cd backend
fly auth login
fly launch --no-deploy        # creates the app; decline overwriting fly.toml, or
                               # diff what it changed against the committed one
fly volumes create oauth_launchpad_data --size 1 --region iad
```

If you changed the app name in `fly launch`, update `app = "..."` in
`backend/fly.toml` to match (must be globally unique on Fly) and make sure
`primary_region` matches the volume's region.

Set secrets (these never go in git):

```bash
fly secrets set \
  TAVILY_API_KEY=... \
  TARQA_API_KEY=... \
  TARQA_MODEL=... \
  ALLOWED_ORIGINS=https://<your-vercel-domain>.vercel.app
```

`ALLOWED_ORIGINS` is a comma-separated list - add every frontend origin
that should be allowed to call the API (production domain, and any preview
domains you want to test against). You'll come back and update this once
you know the Vercel domain from step 3.

First deploy by hand to confirm it boots:

```bash
fly deploy --config fly.toml
fly status   # note the public URL, e.g. https://oauth-launchpad-api.fly.dev
```

### Wire up GitHub Actions CD

In the GitHub repo settings → Secrets and variables → Actions, add:

- `FLY_API_TOKEN` - from `fly tokens create deploy` (scoped to this app only)

From here, every push to `main` that touches `backend/` runs the test
suite and deploys automatically via `.github/workflows/deploy-backend.yml`.

## 3. Frontend: Vercel

In the Vercel dashboard: **Add New → Project → Import** this GitHub repo.

- **Root Directory**: `frontend`
- **Environment Variable**: `NEXT_PUBLIC_API_URL` = your Fly backend URL
  (e.g. `https://oauth-launchpad-api.fly.dev`)

That's it - Vercel's GitHub integration *is* the CI/CD: every push to
`main` deploys to production, every PR gets its own preview URL
automatically, no workflow file required.

Once you have the Vercel production domain, go back to Fly and update
`ALLOWED_ORIGINS` to include it:

```bash
fly secrets set ALLOWED_ORIGINS=https://<your-vercel-domain>.vercel.app
```

(Fly secrets trigger a redeploy automatically when changed.)

## 4. Verify

```bash
curl https://<your-fly-app>.fly.dev/api/health
# {"status":"ok"}
```

Open the Vercel URL, generate or open a guide, click Share, and confirm
the copied link loads the same guide in a private/incognito window.

## Notes

- `backend/.github`-triggered deploys only run when `backend/**` changes,
  so a frontend-only PR doesn't redeploy the API.
- The CI workflow (`.github/workflows/ci.yml`) runs backend tests and
  frontend typecheck/lint/build on every push and PR, independent of the
  deploy workflows - it's the thing that should be required to pass
  before merging.
- If you outgrow a single Fly machine (concurrent writers hitting SQLite),
  the next step is Postgres (e.g. Fly Postgres or Supabase) - `database.py`
  is a single small file, so that migration is contained.
