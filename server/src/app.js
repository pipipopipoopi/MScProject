const express = require('express');
const crypto = require('crypto');
const pool = require('./db');
const { parseClientTimestamp } = require('./time');

const EVENT_TYPES = ['open', 'close', 'sleep_on', 'sleep_off'];
const APPS = ['instagram', 'tiktok'];
const CHECKIN_KINDS = ['morning', 'daytime', 'evening'];
const RATINGS = ['mood', 'anxiety', 'energy'];
const SLEEP_RATINGS = ['sleep_quality', 'sleep_onset_difficulty'];

function requireToken(req, res, next) {
  const header = req.get('Authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    const given = Buffer.from(match ? match[1].trim() : String((req.body && req.body.token) || '').trim());
  const expected = Buffer.from(process.env.INGEST_TOKEN || '');
  const valid = expected.length > 0
    && given.length === expected.length
    && crypto.timingSafeEqual(given, expected);
   
  if (!valid) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
}

// Shortcuts may send numbers as text, so "7" and 7 are both accepted.
// Returns null when the answer was skipped, undefined when it is invalid.
function parseRating(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text === '') return null;
  const number = Number(text);
  return Number.isInteger(number) && number >= 1 && number <= 10 ? number : undefined;
}

const app = express();
app.use((req, res, next) => {
  res.on('finish', () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode}`);
  });
  next();
});
app.use(express.json());

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', database: 'connected' });
});

app.post('/api/events', requireToken, async (req, res) => {
  const body = req.body || {};
  const type = String(body.type || '').toLowerCase();
  if (!EVENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${EVENT_TYPES.join(', ')}` });
  }

  const isAppEvent = type === 'open' || type === 'close';
  const appName = isAppEvent ? String(body.app || '').toLowerCase() : 'none';
  if (isAppEvent && !APPS.includes(appName)) {
    return res.status(400).json({ error: `app must be one of: ${APPS.join(', ')}` });
  }

  const timestamp = parseClientTimestamp(body.client_ts);
  if (!timestamp) {
    return res.status(400).json({ error: 'client_ts must be an ISO 8601 date with a UTC offset' });
  }

  const [result] = await pool.execute(
    `INSERT INTO events (type, app, client_ts, tz_offset_min)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [type, appName, timestamp.utc, timestamp.offsetMin],
  );

  const stored = result.affectedRows === 1;
  res.status(stored ? 201 : 200).json({ stored, duplicate: !stored });
});

app.post('/api/checkins', requireToken, async (req, res) => {
  const body = req.body || {};
  const kind = String(body.kind || '').toLowerCase();
  if (!CHECKIN_KINDS.includes(kind)) {
    return res.status(400).json({ error: `kind must be one of: ${CHECKIN_KINDS.join(', ')}` });
  }

  const timestamp = parseClientTimestamp(body.client_ts);
  if (!timestamp) {
        return res.status(400).json({ error: 'client_ts must be an ISO 8601 date with a UTC offset', received: body.client_ts ?? null });
  }

  // The morning check-in rates last night's sleep; the daytime and evening
  // check-ins rate how the day feels.
  const expected = kind === 'morning' ? SLEEP_RATINGS : RATINGS;

  // Every rating is optional, because a check-in may be answered only in part.
  // Whatever is sent must be a whole number from 1 to 10.
  const ratings = {
    mood: null, anxiety: null, energy: null,
    sleep_quality: null, sleep_onset_difficulty: null,
  };
  let answered = 0;
  for (const field of expected) {
    const value = parseRating(body[field]);
    if (value === undefined) {
      return res.status(400).json({ error: `${field} must be a whole number from 1 to 10` });
    }
    if (value !== null) {
      ratings[field] = value;
      answered += 1;
    }
  }
  if (answered === 0) {
    return res.status(400).json({ error: `at least one of: ${expected.join(', ')}` });
  }
  // A check-in is recorded once per local day, so if two reminders fire the
  // same morning (waking up and stopping the alarm), the second is ignored.
  const localMs = timestamp.utc.getTime() + timestamp.offsetMin * 60000;
  const localDayStart = new Date(localMs);
  localDayStart.setUTCHours(0, 0, 0, 0);
  const dayStartUtc = new Date(localDayStart.getTime() - timestamp.offsetMin * 60000);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);

  const [existing] = await pool.execute(
    'SELECT id FROM checkins WHERE kind = ? AND client_ts >= ? AND client_ts < ? LIMIT 1',
    [kind, dayStartUtc, dayEndUtc],
  );
  if (existing.length > 0) {
    return res.status(200).json({ stored: false, duplicate: true });
  }
  const [result] = await pool.execute(
    `INSERT INTO checkins
       (kind, client_ts, tz_offset_min, mood, anxiety, energy, sleep_quality, sleep_onset_difficulty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      kind, timestamp.utc, timestamp.offsetMin,
      ratings.mood, ratings.anxiety, ratings.energy,
      ratings.sleep_quality, ratings.sleep_onset_difficulty,
    ],
  );

  const stored = result.affectedRows === 1;
  res.status(stored ? 201 : 200).json({ stored, duplicate: !stored });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;