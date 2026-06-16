# Creative Lab

A self-hostable creative analysis dashboard for paid social ads. Connect your
own ad account and explore every creative as a card with its real preview
thumbnail and the metrics you choose — built with React + Vite + Tailwind.

Creative Lab pulls **live data** from the ad platforms you connect and presents
it in clean, adjustable reporting grids. It ships with **no data** — it's a
blank slate that fills with your own account on first load.

## Features

- **Creative reporting grids** — every creative as a card with its real preview
  thumbnail and the metrics you choose.
- **Adjustable metrics** — add/remove any metric from a registry of 20+
  (Spend, ROAS, CPA, CTR, CPM, Hook Rate, Hold Rate, Completion, CVR, …).
- **Filters & search** — by format and free-text across ad / campaign / ad set.
- **Date selector** — presets (7/14/30/90 days, this/last month) plus custom range.
- **Format classification** — Static vs UGC vs Motion, with format tabs and a
  dedicated comparison board.
- **Copy performance** — boards that group creatives by primary text and by
  headline, so you can see which copy rides on the best-performing ads.
- **Boards** — saved analysis lenses (Top Creatives, Video Performance, By
  Campaign, …) that reframe grouping, metrics, format filter and sort in one
  click. Create your own and they persist locally.
- **Launch Calendar** — see when ads went live, derived from your own account
  data (no data ships with the app).
- **Group by** ad, format, campaign, ad set or objective. Grid & table views.

## Quick start

```bash
git clone <your-fork-url> creative-lab
cd creative-lab
npm install
cp .env.example .env      # then fill in your Meta token + ad account id
npm run dev
```

The first load for a date range fetches from the
platform and is then cached.

### Credentials

At minimum you need a **Meta Marketing API** access token (`ads_read` scope) and
the **ad account id** you want to analyze:

```
ACCESS_TOKEN=<your Meta Marketing API access token>
AD_ACCOUNT_ID=act_xxxxxxxxxxxxx   # or just the numeric id
```

The token is only ever read **server-side** (by the dev middleware locally, or a
Vercel Function in production) — it is never bundled into the client.

Other platforms (TikTok, Snapchat, Reddit) have adapters scaffolded; they stay
disabled in the UI until their env vars are set. See `.env.example` for the full
list.

## Deploying to Vercel

The data layer runs as a **Vercel Function** (`api/meta/creatives.ts`) in
production and as Vite dev middleware locally — both share
`scripts/meta-creative-api/service.ts`, so the access token only ever lives
server-side.

```bash
npm i -g vercel
vercel link
vercel env add ACCESS_TOKEN production     # paste your Meta token
vercel env add AD_ACCOUNT_ID production
vercel --prod
```

Never commit `.env` (it's gitignored). Meta long-lived tokens expire (~60 days),
so set a rotation reminder.

### Optional: password gate

Creative Lab can require a shared password before the app loads. It's **opt-in**:

- **Leave `APP_PASSWORD` unset** → the app runs open (good for local dev or a
  single-user deployment).
- **Set `APP_PASSWORD`** (env var) → every visitor gets a login page and must
  enter the shared password to get a 30-day session cookie. APIs return 401
  without it.

```bash
vercel env add APP_PASSWORD production
```

Changing or removing `APP_PASSWORD` invalidates all existing sessions. The
password is never stored in code — only the running process reads it.

### Optional: durable cache + cron warmer

The API reads **store-first**: snapshots are served from a durable store and the
ad platform is only called on a miss/stale/explicit-refresh. A **Vercel Cron**
job (`/api/cron/sync`, every 12h) warms the common presets into the store, so
total API volume is fixed and predictable no matter how many people browse.

Without a store provisioned it falls back to a per-instance in-memory map (still
single-flight + serve-stale within a warm instance), which resets on deploys and
cold starts. To make it durable, provision Redis:

1. Create a Redis database (e.g. Vercel Redis / Upstash) and connect it to the
   project. It injects a connection URL (`REDIS_URL`, `KV_URL`, or
   `UPSTASH_REDIS_URL`) — the store auto-detects any of them.
2. Add a cron secret so the warmer can't be triggered by randoms:

   ```bash
   vercel env add CRON_SECRET production   # any long random string
   ```

3. Redeploy.

Tuning knobs: `WARM_PRESETS` and `FRESH_MS` in `service.ts`, the `crons.schedule`
in `vercel.json`, and `TTL_SECONDS` in `store.ts`.

## Marketer toolkit (skills & automations)

Beyond the dashboard, the repo ships agent tooling for common paid-media
workflows. These run in Cursor against **your own** connected accounts — no data
ships with them.

### Skills — [`.cursor/skills/`](./.cursor/skills/)

Cursor auto-discovers these when you open the repo; just describe what you want.

- **[Performance Anomaly Tracker](./.cursor/skills/performance-anomaly-tracker/SKILL.md)**
  — watches an account for meaningful changes (spend spikes, CPA/ROAS drift, CTR
  collapse, creative fatigue, conversion breaks) and returns a prioritized,
  plain-language alert digest with likely cause and next action. Works off the
  Creative Lab data API and/or connected ad-platform MCPs. Pair it with a
  scheduled Automation for a daily/weekly health check.

### Automations — [`automations/`](./automations/)

Paste-and-go [Cursor Automation](https://docs.cursor.com/automations) prompts.

- **[Keyword Gap Finder](./automations/keyword-gap-finder.md)** — mines your
  Google Ads search-terms report (and optional product launches) for high-intent
  terms with no matching active keyword, then returns a prioritized add plan with
  match types, ad-group fit, and search-term evidence. Read-only; you approve
  before anything goes live.

## Architecture

| Layer | Path | Responsibility |
| --- | --- | --- |
| Platforms | `scripts/platforms/*` | Per-platform adapters (`meta`, `tiktok`, `snapchat`, `reddit`) behind one `PlatformAdapter` contract + a registry. Each normalizes its native API into the shared `CreativeResponse` shape. |
| Data layer | `scripts/meta-creative-api/metaApi.ts` | Fetches + normalizes ad/creative/insights from the Graph API into flat, additive base metrics. |
| Service | `scripts/meta-creative-api/service.ts` | Shared query parsing + caching used by both runtimes. |
| Local API | `scripts/meta-creative-api/vitePlugin.ts` | Serves `/api/meta/creatives` from the Vite dev server (token stays server-side). |
| Prod API | `api/meta/creatives.ts` | Vercel Function serving the same endpoint in production. |
| Domain | `src/creative/*` | `types`, `metrics` (registry), `format` (classifier), `aggregate` (grouping), `boards` (lenses), `launches` (calendar), `api` (client). |
| UI | `src/components/creative/*` | Sidebar, controls, FormatTabs, MetricBar, CreativeGrid/Card, CreativeTable, CalendarView. |

### Why metrics are computed client-side

The API returns only **additive** base metrics per ad. Ratio metrics (CPA, ROAS,
hook rate, …) are derived in `src/creative/metrics.ts` from the *summed* base
values, so grouping (by ad, format, campaign, …) stays mathematically correct.

### Extending

- **Add a metric:** append one entry to `METRICS` in `src/creative/metrics.ts`.
- **Add a board:** append to `BOARDS` in `src/creative/boards.ts`.
- **Tune motion detection:** edit `SHORT_VIDEO_MATCH` in `src/creative/format.ts`.
- **Add an ad platform:** implement a `PlatformAdapter` in `scripts/platforms/`
  (return the shared `CreativeResponse` shape) and register it in
  `scripts/platforms/registry.ts`. It then inherits the store, cron warmer, and
  UI automatically.

## License

[Apache License 2.0](./LICENSE).
