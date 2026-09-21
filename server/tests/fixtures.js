// Rows the stubbed database returns to the API tests. One full day: awake at
// 08:00, scrolling in the morning, in the hour before the sleep marker, and in
// bed after it, with the night running past midnight.

const OFFSET = 60; // British Summer Time

function ts(local) {
  return new Date(new Date(local + 'Z').getTime() - OFFSET * 60000);
}

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

module.exports = { OFFSET, ts, EVENTS, CHECKINS };
