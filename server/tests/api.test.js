// End to end tests for the read endpoints. The database module is replaced by
// a stub, so these exercise the real routing, the real token check and the
// real analysis, with nothing depending on the network or on stored rows.

process.env.INGEST_TOKEN = 'test-token';

jest.mock('../src/db', () => ({
  // Only reads happen here, and each query is recognised by the table it names.
  // The fixtures are required inside the function because jest.mock is hoisted
  // above everything else in the file.
  query: jest.fn(async (sql) => {
    const { EVENTS, CHECKINS } = require('./fixtures');
    if (/FROM events/i.test(sql)) return [EVENTS];
    if (/FROM checkins/i.test(sql)) return [CHECKINS];
    return [[]];
  }),
}));

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
    // The session from 02:46 to 03:10 falls in the small hours of Monday.
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
