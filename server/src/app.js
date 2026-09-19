const express = require('express');
const crypto = require('crypto');
const pool = require('./db');
const { parseClientTimestamp } = require('./time');

const EVENT_TYPES = ['open', 'close', 'sleep_on', 'sleep_off'];
const APPS = ['instagram', 'tiktok'];

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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
