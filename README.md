# Digital Mirror — a scroll tracker

A self-tracking tool built for an MSc Computer Science project at the
University of Roehampton (module CMP-L050-0). It records when TikTok and
Instagram are used, and sets that against sleep and self-reported wellbeing.

The question behind it is about *timing* rather than volume: does scrolling in
the first hour after waking, or in the hour before sleep, go together with
worse sleep and lower mood? Screen Time already reports how long apps are used.
It does not say when, relative to waking and going to bed, and it does not sit
next to how the day felt.

This is a single-participant study. The author is the only user, and nothing
here generalises beyond her.

---

## How it works

```
iPhone Shortcuts  ──POST──▶  Express API on Vercel  ──▶  MySQL on Aiven
                                     │
                             analysis on request
                                     │
                             React dashboard (PWA)
```

Nothing is precomputed and stored. Every figure the dashboard shows is derived
from the raw events each time it is asked for, so a threshold can be changed
and the whole history re-read under the new rule. That is what makes the
sensitivity analysis in the report possible.

### Collection

There is no tracking library and no screen-time API. Six automations in the
iOS Shortcuts app send a timestamped event:

| Trigger | Event |
|---|---|
| Instagram opened / closed | `open` / `close`, app `instagram` |
| TikTok opened / closed | `open` / `close`, app `tiktok` |
| Wind Down begins | `sleep_on` |
| Wake Up, or any alarm stopped | `sleep_off` |

Three more Shortcuts collect check-ins: in the morning (sleep quality,
difficulty falling asleep), in the afternoon and in the evening (mood, anxiety,
energy). Every rating is optional. A skipped rating is stored as `NULL` and
left out of averages — it is never counted as a zero.

Each event carries the UTC timestamp and the local offset that was in force,
so local time is recovered without guessing about British Summer Time.

### Processing

The rules live in `server/src/analysis.js` as pure functions, with every
threshold as a setting rather than a constant in the code.

- **Sessions.** `open` and `close` are paired. A missing `close` is the common
  failure of Shortcuts, so the session is closed at the next event or capped at
  30 minutes and flagged `estimated` rather than dropped. Anything shorter than
  5 seconds is treated as noise.
- **Episodes.** Sessions less than 120 seconds apart become one episode of
  scrolling — leaving the app to answer a message and coming back is one
  stretch, not two. Switching from Instagram to TikTok within the gap is also
  one episode. Merging changes the number of episodes, never the total time.
- **Logical days.** A day runs from one wake marker to the next, so scrolling
  at two in the morning belongs to the day that is ending. Days with no wake
  marker fall back to a boundary at 07:00 local.
- **Windows.** Morning use is scrolling within 60 minutes of waking. Pre-sleep
  use is within 60 minutes before `sleep_on`; anything after it counts as in
  bed.
- **Retrospective sleep ratings.** Sleep is rated on waking and describes the
  night before, so a day's own scrolling is compared with the *next* morning's
  ratings. Both directions are exposed: `sleepBefore` is the night that
  preceded a day, `sleepAfter` the night that followed it.

### The first month, on paper

A daily paper diary covering 4 August – 7 September 2026 was kept before the
app existed, for reasons unrelated to this project. It is imported with
`scripts/import-journal.js` and marked `source = 'journal'`, so diary days and
automatically recorded days can be analysed separately. Diary days hold daily
totals only, which is why they do not appear in the hourly heatmap.

---

## API

All endpoints require a bearer token. Any threshold can be overridden per
request as a query parameter (`?mergeGapSec=300`), which is how the sensitivity
analysis is run.

| Endpoint | Purpose |
|---|---|
| `POST /api/events` | Record an open, close or sleep marker |
| `POST /api/checkins` | Record a check-in |
| `GET /api/health` | Database connectivity |
| `GET /api/days` | One record per logical day |
| `GET /api/summary` | Averages, capture quality, group comparisons |
| `GET /api/wellbeing` | Days grouped by scrolling, averaged ratings |
| `GET /api/hourly` | Minutes by weekday and local hour |
| `GET /api/export.csv` | One row per day, for the analysis in the report |

---

## The dashboard

A React app installed on the phone's home screen as a web app. Four screens:

- **Today** — the morning, last night, the latest check-in.
- **Patterns** — a heatmap of scrolling by hour and weekday, and daily series
  for the morning and pre-sleep windows.
- **Wellbeing** — days grouped by how much scrolling they contained, with
  average ratings side by side and the number of days behind each average.
- **Data** — what has been collected, how many check-ins were answered, and the
  CSV export.

It reloads when it is brought back to the foreground, which is when the figures
have changed.

---

## Running it

Requires Node.js 20 or later and a MySQL database. `server/db/schema.sql`
holds the table definitions.

```bash
# server
cd server
npm install
cp .env.example .env     # then fill in DB_* and INGEST_TOKEN
npm run dev              # http://localhost:3000

# dashboard, in a second terminal
cd client
npm install
VITE_API_BASE=http://localhost:3000 npm run dev
```

Sign in with the value of `INGEST_TOKEN`.

### Tests

```bash
cd server && npm test
```

Nineteen tests. `tests/analysis.test.js` covers the processing rules directly:
episode merging, capped sessions, wake-to-wake day boundaries, and the
retrospective sleep rating. `tests/api.test.js` drives the real endpoints with
the database replaced by a stub, so it needs no network and no stored rows.

### Scripts

| Script | What it does |
|---|---|
| `scripts/import-journal.js file.csv [--dry-run]` | Import the paper diary |
| `scripts/reset-collection.js [--confirm]` | Clear recorded events, keep the diary |
| `scripts/generate-demo.js [days]` | Synthetic data in a separate local database, for the screencast only |

`generate-demo.js` refuses to run against anything but a local host. Its output
is never used in the analysis.

---

## Privacy

The data is a record of one person's sleep, mood and anxiety, so it is treated
accordingly. The database is private, every endpoint is behind a token, and the
dashboard is password-protected. Credentials live in environment variables and
are not committed. The imported diary file is excluded from version control.
No data is sent to any third party; there is no analytics and no advertising
identifier anywhere in the stack.
