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
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
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
function parseRating(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 10 ? number : undefined;
}

const app = express();
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
    return res.status(400).json({ error: 'client_ts must be an ISO 8601 date with a UTC offset' });
  }

  const ratings = {};
  for (const field of RATINGS) {
    ratings[field] = parseRating(body[field]);
    if (!ratings[field]) {
      return res.status(400).json({ error: `${field} is required and must be a whole number from 1 to 10` });
    }
  }

  // Sleep is rated once a day, in the morning check-in only.
  for (const field of SLEEP_RATINGS) {
    ratings[field] = kind === 'morning' ? parseRating(body[field]) : null;
    if (ratings[field] === undefined) {
      return res.status(400).json({ error: `${field} must be a whole number from 1 to 10` });
    }
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