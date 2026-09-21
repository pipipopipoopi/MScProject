#!/bin/bash
# Writes server/scripts/generate-demo.js: synthetic data for the screencast,
# written to a separate local database, never to the real one.
# Run from the repository root:  bash add-demo.sh

set -e

if [ ! -d "server/scripts" ]; then
  echo "No server/scripts folder here. Run this from the MScProject folder."
  exit 1
fi

cat > server/scripts/generate-demo.js << 'EOF'
// Fills a SEPARATE local database with plausible, entirely made-up data, so the
// dashboard can be demonstrated on video before enough real data exists.
//
// It refuses to touch the cloud database. Nothing here is used in the analysis:
// the figures in the report come only from the real events and the journal.
//
//   node scripts/generate-demo.js            21 days into scroll_tracker_demo
//   node scripts/generate-demo.js 30         a different number of days
//
// Connection details come from DEMO_DB_* variables, defaulting to MAMP.
const mysql = require('mysql2/promise');

const HOST = process.env.DEMO_DB_HOST || '127.0.0.1';
const PORT = Number(process.env.DEMO_DB_PORT || 8889);
const USER = process.env.DEMO_DB_USER || 'root';
const PASSWORD = process.env.DEMO_DB_PASSWORD || 'root';
const NAME = process.env.DEMO_DB_NAME || 'scroll_tracker_demo';

if (/aivencloud|\.com$/i.test(HOST)) {
  console.error('This script only writes to a local database. Refusing to run against ' + HOST);
  process.exit(1);
}

const DAYS = Number(process.argv[2]) || 21;
const OFFSET = 60; // British Summer Time
const MINUTE = 60000;

// A small deterministic generator, so re-running gives the same demo and the
// screencast can be re-recorded without the numbers changing underneath.
let seed = 20260921;
function random() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

function between(low, high) {
  return low + random() * (high - low);
}

function pick(low, high) {
  return Math.round(between(low, high));
}

// Local wall-clock time on a given day, converted to the instant stored.
function at(day, hour, minute) {
  const local = new Date(Date.UTC(day.year, day.month, day.date, hour, minute));
  return new Date(local.getTime() - OFFSET * MINUTE);
}

function dayParts(offsetFromToday) {
  const base = new Date();
  base.setDate(base.getDate() - offsetFromToday);
  return { year: base.getFullYear(), month: base.getMonth(), date: base.getDate() };
}

const events = [];
const checkins = [];

function scroll(day, startHour, startMinute, minutes, app) {
  const start = at(day, startHour, startMinute);
  events.push({ type: 'open', app, client_ts: start, tz_offset_min: OFFSET });
  events.push({
    type: 'close',
    app,
    client_ts: new Date(start.getTime() + minutes * MINUTE),
    tz_offset_min: OFFSET,
  });
}

for (let index = DAYS; index >= 1; index -= 1) {
  const day = dayParts(index);
  const weekend = new Date(day.year, day.month, day.date).getDay() % 6 === 0;

  // Waking up: later at the weekend.
  const wakeHour = weekend ? pick(9, 11) : pick(7, 9);
  const wakeMinute = pick(0, 59);
  events.push({ type: 'sleep_off', app: null, client_ts: at(day, wakeHour, wakeMinute), tz_offset_min: OFFSET });

  // Morning scrolling: on most days, but not all.
  const morningMinutes = random() < 0.25 ? 0 : pick(4, 38);
  if (morningMinutes) {
    scroll(day, wakeHour, Math.min(wakeMinute + pick(1, 12), 58), morningMinutes,
      random() < 0.5 ? 'instagram' : 'tiktok');
  }

  // A couple of stretches during the day.
  for (let n = 0; n < pick(1, 3); n += 1) {
    scroll(day, pick(12, 19), pick(0, 50), pick(5, 25), random() < 0.5 ? 'instagram' : 'tiktok');
  }

  // The evening, and the sleep marker late at night.
  const nightMinutes = pick(0, 55);
  const sleepHour = weekend ? 1 : 23;
  const sleepMinute = pick(0, 50);
  if (nightMinutes > 5) {
    const startHour = sleepHour === 1 ? 0 : 22;
    scroll(day, startHour, pick(5, 40), Math.min(nightMinutes, 40),
      random() < 0.6 ? 'tiktok' : 'instagram');
  }
  events.push({
    type: 'sleep_on',
    app: null,
    client_ts: at(day, sleepHour, sleepMinute),
    tz_offset_min: OFFSET,
  });

  // Scrolling in bed on some nights.
  if (random() < 0.4) {
    scroll(day, sleepHour, Math.min(sleepMinute + 3, 57), pick(6, 30), 'tiktok');
  }

  // Ratings. Sleep is a little worse after a night of scrolling, and mood a
  // little lower after a long morning: enough for the screens to show
  // something, and clearly invented.
  const nightPenalty = nightMinutes > 25 ? 2 : 0;
  const morningPenalty = morningMinutes > 20 ? 1 : 0;

  checkins.push({
    kind: 'daytime',
    client_ts: at(day, 15, 30),
    mood: Math.max(1, pick(5, 9) - morningPenalty),
    anxiety: Math.min(10, pick(2, 6) + morningPenalty),
    energy: Math.max(1, pick(4, 9) - morningPenalty),
    sleep_quality: null,
    sleep_onset_difficulty: null,
  });

  checkins.push({
    kind: 'evening',
    client_ts: at(day, 21, 15),
    mood: Math.max(1, pick(4, 9) - morningPenalty),
    anxiety: Math.min(10, pick(2, 7) + morningPenalty),
    energy: Math.max(1, pick(3, 8) - morningPenalty),
    sleep_quality: null,
    sleep_onset_difficulty: null,
  });

  // The morning check-in rates the night that has just ended.
  const nextDay = dayParts(index - 1);
  checkins.push({
    kind: 'morning',
    client_ts: at(nextDay, 8, 45),
    mood: null,
    anxiety: null,
    energy: null,
    sleep_quality: Math.max(1, pick(5, 9) - nightPenalty),
    sleep_onset_difficulty: Math.min(10, pick(2, 5) + nightPenalty),
  });
}

async function main() {
  const root = await mysql.createConnection({ host: HOST, port: PORT, user: USER, password: PASSWORD });
  await root.query('CREATE DATABASE IF NOT EXISTS `' + NAME + '`');
  await root.end();

  const db = await mysql.createConnection({
    host: HOST, port: PORT, user: USER, password: PASSWORD, database: NAME, timezone: 'Z',
  });

  await db.query(`CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(16) NOT NULL,
    app VARCHAR(32) NULL,
    client_ts DATETIME NOT NULL,
    tz_offset_min INT NOT NULL DEFAULT 0,
    source VARCHAR(16) NOT NULL DEFAULT 'app'
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS checkins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(16) NOT NULL,
    client_ts DATETIME NOT NULL,
    tz_offset_min INT NOT NULL DEFAULT 0,
    mood INT NULL, anxiety INT NULL, energy INT NULL,
    sleep_quality INT NULL, sleep_onset_difficulty INT NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'app'
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS journal_days (
    day DATE PRIMARY KEY,
    wake_ts DATETIME NULL, first_scroll_ts DATETIME NULL, presleep_scroll_ts DATETIME NULL,
    morning_instagram_min INT NULL, morning_tiktok_min INT NULL,
    presleep_instagram_min INT NULL, presleep_tiktok_min INT NULL
  )`);

  await db.query('DELETE FROM events');
  await db.query('DELETE FROM checkins');

  for (const event of events) {
    await db.query(
      'INSERT INTO events (type, app, client_ts, tz_offset_min, source) VALUES (?, ?, ?, ?, ?)',
      [event.type, event.app, event.client_ts, event.tz_offset_min, 'app'],
    );
  }

  for (const checkin of checkins) {
    await db.query(
      `INSERT INTO checkins (kind, client_ts, tz_offset_min, mood, anxiety, energy,
                             sleep_quality, sleep_onset_difficulty, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'app')`,
      [checkin.kind, checkin.client_ts, OFFSET, checkin.mood, checkin.anxiety,
       checkin.energy, checkin.sleep_quality, checkin.sleep_onset_difficulty],
    );
  }

  console.log(`Demo database "${NAME}" filled with ${DAYS} invented days:`);
  console.log(`  ${events.length} events, ${checkins.length} check-ins.`);
  console.log('Nothing was written to the real database.');

  await db.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
EOF

echo "generate-demo.js written."
