// Imports the paper journal (one row per day) into the database.
// Usage:  node scripts/import-journal.js journal.csv [--dry-run]
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');

const TZ = 'Europe/London';

const COLUMNS = [
  'date', 'wake_time', 'first_scroll_time',
  'morning_instagram_min', 'morning_tiktok_min',
  'presleep_scroll_time', 'presleep_instagram_min', 'presleep_tiktok_min',
  'sleep_quality', 'sleep_onset_difficulty',
  'mood_day', 'anxiety_day', 'energy_day',
  'mood_evening', 'anxiety_evening', 'energy_evening',
];

// The offset changes with British Summer Time, so it is read from the zone
// itself rather than hardcoded.
function offsetMinutes(year, month, day, hour, minute) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(guess)).reduce((acc, p) => {
    acc[p.type] = p.value; return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return Math.round((asUtc - guess) / 60000);
}

// Turns a local date and time into the UTC instant and the offset in force.
function toUtc(dateText, timeText, addDays = 0) {
  const [y, m, d] = dateText.split('-').map(Number);
  const [hh, mm] = timeText.split(':').map(Number);
  const base = Date.UTC(y, m - 1, d + addDays, hh, mm);
  const offsetMin = offsetMinutes(y, m, d + addDays, hh, mm);
  return { utc: new Date(base - offsetMin * 60000), offsetMin };
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = lines.shift().split(',').map((h) => h.trim());
  for (const name of COLUMNS) {
    if (!header.includes(name)) throw new Error(`the file has no column "${name}"`);
  }
  return lines.map((line, index) => {
    const cells = line.split(',');
    const row = { _line: index + 2 };
    header.forEach((name, i) => { row[name] = (cells[i] || '').trim(); });
    return row;
  });
}

function rating(value, field, line) {
  if (value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 10) {
    throw new Error(`line ${line}: ${field} must be a whole number from 1 to 10, found "${value}"`);
  }
  return number;
}

function minutes(value, field, line) {
  if (value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`line ${line}: ${field} must be a whole number of minutes, found "${value}"`);
  }
  return number;
}

function time(value, field, line) {
  if (value === '') return null;
  if (!/^\d{1,2}:\d{2}$/.test(value)) {
    throw new Error(`line ${line}: ${field} must look like 13:34, found "${value}"`);
  }
  const [hh, mm] = value.split(':').map(Number);
  if (hh > 23 || mm > 59) throw new Error(`line ${line}: ${field} is not a real time ("${value}")`);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function buildDay(row) {
  const line = row._line;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
    throw new Error(`line ${line}: date must look like 2026-08-01, found "${row.date}"`);
  }

  const wake = time(row.wake_time, 'wake_time', line);
  const firstScroll = time(row.first_scroll_time, 'first_scroll_time', line);
  const preSleep = time(row.presleep_scroll_time, 'presleep_scroll_time', line);

  // Scrolling in bed after midnight belongs to the evening of the same journal
  // day, so it is stored on the following calendar date.
  const preSleepNextDay = preSleep !== null && Number(preSleep.split(':')[0]) < 12;

  return {
    day: row.date,
    wake: wake && toUtc(row.date, wake),
    firstScroll: firstScroll && toUtc(row.date, firstScroll),
    preSleep: preSleep && toUtc(row.date, preSleep, preSleepNextDay ? 1 : 0),
    morningInstagram: minutes(row.morning_instagram_min, 'morning_instagram_min', line),
    morningTiktok: minutes(row.morning_tiktok_min, 'morning_tiktok_min', line),
    preSleepInstagram: minutes(row.presleep_instagram_min, 'presleep_instagram_min', line),
    preSleepTiktok: minutes(row.presleep_tiktok_min, 'presleep_tiktok_min', line),
    // Recorded on waking, these describe the night before this date.
    sleepQuality: rating(row.sleep_quality, 'sleep_quality', line),
    sleepOnset: rating(row.sleep_onset_difficulty, 'sleep_onset_difficulty', line),
    moodDay: rating(row.mood_day, 'mood_day', line),
    anxietyDay: rating(row.anxiety_day, 'anxiety_day', line),
    energyDay: rating(row.energy_day, 'energy_day', line),
    moodEvening: rating(row.mood_evening, 'mood_evening', line),
    anxietyEvening: rating(row.anxiety_evening, 'anxiety_evening', line),
    energyEvening: rating(row.energy_evening, 'energy_evening', line),
  };
}

// Check-ins have no recorded time in the journal, so the morning one is placed
// at the wake time and the others at the usual reminder times.
function checkinRows(day) {
  const rows = [];
  if (day.sleepQuality !== null || day.sleepOnset !== null) {
    const at = day.wake || toUtc(day.day, '12:00');
    rows.push(['morning', at, day.sleepQuality, day.sleepOnset, null, null, null]);
  }
  if (day.moodDay !== null || day.anxietyDay !== null || day.energyDay !== null) {
    rows.push(['daytime', toUtc(day.day, '15:30'), null, null, day.moodDay, day.anxietyDay, day.energyDay]);
  }
  if (day.moodEvening !== null || day.anxietyEvening !== null || day.energyEvening !== null) {
    rows.push(['evening', toUtc(day.day, '21:00'), null, null, day.moodEvening, day.anxietyEvening, day.energyEvening]);
  }
  return rows;
}

async function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!file) {
    console.error('Usage: node scripts/import-journal.js journal.csv [--dry-run]');
    process.exit(1);
  }

  const days = parseCsv(fs.readFileSync(path.resolve(file), 'utf8')).map(buildDay);
  console.log(`Read ${days.length} day(s) from ${file}.`);

  if (dryRun) {
    for (const day of days) {
      console.log(
        day.day,
        'wake', day.wake ? day.wake.utc.toISOString() : '-',
        'first scroll', day.firstScroll ? day.firstScroll.utc.toISOString() : '-',
        'pre-sleep', day.preSleep ? day.preSleep.utc.toISOString() : '-',
        'check-ins', checkinRows(day).map((r) => r[0]).join('/') || '-',
      );
    }
    console.log('Dry run: nothing was written to the database.');
    return;
  }

  const pool = require('../src/db');
  let daysWritten = 0;
  let checkinsWritten = 0;

  for (const day of days) {
    await pool.execute(
      `INSERT INTO journal_days
         (day, wake_ts, first_scroll_ts, presleep_scroll_ts, tz_offset_min,
          morning_instagram_min, morning_tiktok_min,
          presleep_instagram_min, presleep_tiktok_min)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         wake_ts = VALUES(wake_ts),
         first_scroll_ts = VALUES(first_scroll_ts),
         presleep_scroll_ts = VALUES(presleep_scroll_ts),
         tz_offset_min = VALUES(tz_offset_min),
         morning_instagram_min = VALUES(morning_instagram_min),
         morning_tiktok_min = VALUES(morning_tiktok_min),
         presleep_instagram_min = VALUES(presleep_instagram_min),
         presleep_tiktok_min = VALUES(presleep_tiktok_min)`,
      [
        day.day,
        day.wake ? day.wake.utc : null,
        day.firstScroll ? day.firstScroll.utc : null,
        day.preSleep ? day.preSleep.utc : null,
        (day.wake || toUtc(day.day, '12:00')).offsetMin,
        day.morningInstagram, day.morningTiktok,
        day.preSleepInstagram, day.preSleepTiktok,
      ],
    );
    daysWritten += 1;

    for (const [kind, at, sleepQuality, sleepOnset, mood, anxiety, energy] of checkinRows(day)) {
      const [result] = await pool.execute(
        `INSERT INTO checkins
           (kind, client_ts, tz_offset_min, mood, anxiety, energy,
            sleep_quality, sleep_onset_difficulty, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'journal')
         ON DUPLICATE KEY UPDATE id = id`,
        [kind, at.utc, at.offsetMin, mood, anxiety, energy, sleepQuality, sleepOnset],
      );
      if (result.affectedRows === 1) checkinsWritten += 1;
    }
  }

  console.log(`Imported ${daysWritten} journal day(s) and ${checkinsWritten} check-in(s).`);
  await pool.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
