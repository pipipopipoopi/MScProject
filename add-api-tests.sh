#!/bin/bash
# Adds Supertest tests for the read endpoints. The database is replaced by a
# stub, so the tests need no network and no rows in Aiven.
# Run from the repository root:  bash add-api-tests.sh

set -e

if [ ! -f "server/src/app.js" ]; then
  echo "server/src/app.js not found. Run this from the MScProject folder."
  exit 1
fi

cd server
echo "Installing supertest, this takes a moment…"
npm install --save-dev supertest >/dev/null 2>&1
cd ..

cat > server/tests/api.test.js << 'EOF'
// End to end tests for the read endpoints. The database module is replaced by
// a stub that returns a fixed set of events and check-ins, so these tests
// exercise the real routing, the real token check and the real analysis, with
// nothing depending on the network or on what happens to be stored in Aiven.

process.env.INGEST_TOKEN = 'test-token';

const OFFSET = 60; // British Summer Time

function ts(local) {
  return new Date(new Date(local + 'Z').getTime() - OFFSET * 60000);
}

// One full day: awake at 08:00, scrolling in the morning, in the hour before
// the sleep marker, and in bed after it.
const EVENTS = [
  { type: 'sleep_off', app: null, client_ts: ts('2026-09-20T08:00:00'), tz_offset_min: OFFSET },
  { type: 'open', app: 'instagram', client_ts: ts('2026-09-20T08:05:00'), tz_offset_min: OFFSET },
  { type: 'close', app: 'instagram', client_ts: ts('2026-09-20T08:20:00'), tz_offset_min: OFFSET },
  { type: 'open', app: 'tiktok', client_ts: ts('2026-09-21T02:10:00'), tz_offset_min: OFFSET },
  { type: 'close', app: 'tiktok', client_ts: ts('2026-09-21T02:30:00'), tz_offset_min: OFFSET },
  { type: 'sleep_on', app: null, client_ts: ts('2026-09-21T02:45:00'), tz_offset_min: OFFSET },
  { type: 'open', app: 'tiktok', client_ts: ts('2026-09-21T02:46:00'), tz_offset_min: OFFSET },
  { type: 'close', app: 'tiktok', client_ts: ts('2026-09-21T03:10:00'), tz_offset_min: OFFSET },
  { type: 'sleep_off', app: null, client_ts: ts('2026-09-21T11:00:00'), tz_offset_min: OFFSET },
];

const CHECKINS = [
  {
    kind: 'evening',
    client_ts: ts('2026-09-20T21:00:00'),
    tz_offset_min: OFFSET,
    mood: 6,
    anxiety: 3,
    energy: 7,
    sleep_quality: null,
    sleep_onset_difficulty: null,
    source: 'app',
  },
  {
    kind: 'morning',
    client_ts: ts('2026-09-21T11:05:00'),
    tz_offset_min: OFFSET,
    mood: null,
    anxiety: null,
    energy: null,
    sleep_quality: 4,
    sleep_onset_difficulty: 8,
    source: 'app',
  },
];

jest.mock('../src/db', () => ({
  // The routes only read, and each query is recognised by the table it names.
  query: jest.fn(async (sql) => {
    if (/FROM events/i.test(sql)) return [EVENTS_REF.events];
    if (/FROM checkins/i.test(sql)) return [EVENTS_REF.checkins];
    if (/FROM journal_days/i.test(sql)) return [[]];
    return [[]];
  }),
}));

// The mock is hoisted above the constants, so it reaches them through a holder.
const EVENTS_REF = { events: EVENTS, checkins: CHECKINS };

const request = require('supertest');
const app = require('../src/app');

const auth = (path) => request(app).get(path).set('Authorization', 'Bearer test-token');

describe('access', () => {
  test('reading without a token is refused', async () => {
    await request(app).get('/api/days').expect(401);
  });

  test('reading with the wrong token is refused', async () => {
    await request(app).get('/api/days').set('Authorization', 'Bearer nonsense').expect(401);
  });

  test('reading with the right token is allowed', async () => {
    await auth('/api/days').expect(200);
  });
});

describe('GET /api/days', () => {
  test('returns one record per logical day, with the night counted correctly', async () => {
    const response = await auth('/api/days').expect(200);
    const byDay = Object.fromEntries(response.body.days.map((day) => [day.day, day]));
    const day = byDay['2026-09-20'];

    expect(day.morningMinutes).toBeCloseTo(15);
    expect(day.preSleepMinutes).toBeCloseTo(20);
    expect(day.inBedMinutes).toBeCloseTo(24);
    expect(day.declaredWake).toBe(true);
  });

  test('thresholds can be overridden per request, for the sensitivity analysis', async () => {
    const response = await auth('/api/days?mergeGapSec=300').expect(200);
    expect(response.body.config.mergeGapSec).toBe(300);
  });
});

describe('GET /api/summary', () => {
  test('reports averages and how many days each one rests on', async () => {
    const response = await auth('/api/summary').expect(200);

    expect(response.body.period.days).toBeGreaterThan(0);
    expect(response.body.averages.totalMinutes).toBeGreaterThan(0);
    expect(response.body.capture.sessions).toBe(3);
    expect(response.body.comparisons.morningScroll.moodEvening).toHaveProperty('matching');
  });
});

describe('GET /api/wellbeing', () => {
  test('splits days into three groups for morning and for night scrolling', async () => {
    const response = await auth('/api/wellbeing').expect(200);

    expect(response.body.morning).toHaveLength(3);
    expect(response.body.night).toHaveLength(3);
    // Every group carries the number of days behind its averages.
    for (const group of response.body.morning) {
      expect(group).toHaveProperty('days');
    }
  });
});

describe('GET /api/hourly', () => {
  test('returns a full weekday by hour grid', async () => {
    const response = await auth('/api/hourly').expect(200);

    expect(response.body.minutes).toHaveLength(7);
    expect(response.body.minutes[0]).toHaveLength(24);
    // The session from 02:46 to 03:10 lands in the small hours of Monday.
    expect(response.body.minutes[0][2]).toBeGreaterThan(0);
  });
});

describe('GET /api/export.csv', () => {
  test('sends a downloadable file with a header row', async () => {
    const response = await auth('/api/export.csv').expect(200);

    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.headers['content-disposition']).toMatch(/scroll-tracker\.csv/);

    const [header, ...rows] = response.text.trim().split('\n');
    expect(header.split(',')).toContain('morning_minutes');
    expect(rows.length).toBeGreaterThan(0);
  });
});
EOF

echo "API tests written."
