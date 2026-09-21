# Digital Mirror

Digital Mirror is the prototype I built for my MSc Computing project at the
University of Roehampton (CMP-L050-0).

The project looks at when I use TikTok and Instagram, rather than only how long
I spend on them. I wanted to compare scrolling shortly after waking and during
Wind Down with my sleep, mood, anxiety and energy.

This is a single-participant self-tracking project. The results describe my own
recorded period and are not intended to represent other people.

## What the project records

I use iPhone Shortcuts to send an event when:

- TikTok or Instagram is opened;
- TikTok or Instagram is closed;
- Wind Down begins;
- my Wake Up time begins or an alarm is stopped.

Separate morning, afternoon and evening Shortcuts collect short check-ins. The
morning check-in asks what time I actually woke up, and covers sleep quality
and difficulty falling asleep. The later
check-ins cover mood, anxiety and energy. A question can be skipped, and missing
answers are left out of averages. Answering the same check-in twice on one day
replaces the earlier answer.

The phone sends each event with its timestamp and UTC offset. This allows the
server to reconstruct local times, including the change between GMT and British
Summer Time.

## How it works

```text
iPhone Shortcuts -> Express API on Vercel -> MySQL database on Aiven
                              |
                              v
                       React dashboard
```

There is no Screen Time API or background tracking library. The project only
uses the events sent by my Shortcuts.

The server turns the raw events into sessions and daily records when the
dashboard requests them:

- An `open` and `close` pair becomes one scrolling session.
- A session without a matching `close` is capped at 30 minutes and marked as
  estimated. Sessions shorter than five seconds are ignored as noise.
- Sessions separated by no more than two minutes are grouped into one scrolling
  episode.
- A logical day runs from one waking to the next. The waking time I report in
  the morning check-in is used first, because an alarm can go off long before
  I actually get up; the phone's own marker is the fallback.
- Scrolling before 05:00 counts as the previous night, and a wake marker before
  05:00 is ignored. If there is no waking time at all, the day starts at 05:00.
- Morning scrolling means sessions that begin within the first hour after
  waking.
- Pre-sleep scrolling starts when the first Wind Down event is recorded and
  continues until the next logical day.
- A day without a waking time or a Wind Down event is left out of that window's
  figures rather than counted as a day without scrolling.
- A sleep rating entered in the morning describes the previous night, so it is
  compared with scrolling from the day before.

The calculations are made from the stored events when an endpoint is requested.
The main thresholds can also be changed through query parameters for sensitivity
checks.

## Earlier diary data

Before building the tracker, I kept a paper diary from 4 August to 7 September
2026. I imported those 35 days, and they provide most of the data analysed in the
report, because automated collection only started in September.

The diary contains daily totals rather than individual app sessions. Imported
days are therefore marked as `journal` and are not included in views that need
hour-by-hour data.

## Dashboard

The mobile dashboard has four sections:

- **Today** shows the latest morning, night and wellbeing information.
- **Patterns** shows daily scrolling and an hourly heatmap.
- **Wellbeing** compares ratings across days with different amounts of
  scrolling.
- **Data** shows collection coverage and provides a CSV export.

## Technology

- React and Vite for the dashboard
- Node.js and Express for the API
- MySQL for storage
- Jest and Supertest for server tests
- ECharts for charts
- Vercel and Aiven for deployment

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/events` | Store an app or sleep event |
| `POST /api/checkins` | Store a morning, afternoon or evening check-in |
| `GET /api/health` | Check the database connection |
| `GET /api/days` | Return the processed daily records |
| `GET /api/summary` | Return averages and collection information |
| `GET /api/wellbeing` | Compare scrolling groups and ratings |
| `GET /api/hourly` | Return scrolling by weekday and hour |
| `GET /api/export.csv` | Download the daily dataset |

The event, check-in and analysis endpoints require a bearer token. The health
endpoint only returns the connection status.

## Running the project locally

The project requires Node.js 20 or later and a MySQL database. Create the tables
using `server/db/schema.sql` before starting the server.

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

Add the database details and an `INGEST_TOKEN` to `server/.env`.

In a second terminal, start the dashboard:

```bash
cd client
npm install
VITE_API_BASE=http://localhost:3000 npm run dev
```

The dashboard sign-in uses the same value as `INGEST_TOKEN`.

## Tests

Run the server tests with:

```bash
cd server
npm test
```

The 40 tests cover session building, episode merging, logical-day boundaries,
reported waking times, sleep-rating alignment, the endpoints, check-in
replacement and the correlation functions used in the report's analysis. The API tests use a stubbed
database, so they do not require a live MySQL connection.

## Scripts

| Script | Purpose |
| --- | --- |
| `server/scripts/import-journal.js` | Import the paper diary |
| `server/scripts/analyse.js` | Compute the statistics reported in Chapter 4 |
| `server/scripts/reset-collection.js` | Clear recorded events and keep the diary |
| `server/scripts/generate-demo.js` | Create synthetic data in a separate local database for the screencast only |

## Privacy and limitations

The database contains personal information about sleep and wellbeing. It is not
included in this repository, and credentials are stored in environment
variables. The deployed API and database use Vercel and Aiven. The project does
not include advertising or analytics tracking.

The main limitation is the study design: it has one participant and depends on
iPhone Shortcut events and self-reported ratings. Missing events, estimated
sessions and diary entries are kept identifiable so they can be considered when
interpreting the results.
