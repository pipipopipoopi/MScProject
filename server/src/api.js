// Read endpoints for the dashboard. Raw rows are never changed in the database:
// every figure below is recomputed from the events on each request, so a
// different merge threshold can be tried without touching the stored data.
const express = require('express');
const pool = require('./db');
const { buildDays, compareDays, DEFAULTS } = require('./analysis');

// Thresholds may be overridden per request, which is what the sensitivity
// analysis in the report does.
function readConfig(query) {
  const config = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (query[key] !== undefined && query[key] !== '') {
      const value = Number(query[key]);
      if (Number.isFinite(value)) config[key] = value;
    }
  }
  return config;
}

function dateRange(query) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || '') ? `${query.from} 00:00:00` : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || '') ? `${query.to} 23:59:59` : null;
  return { from, to };
}

async function loadData(query) {
  const { from, to } = dateRange(query);
  const where = [];
  const params = [];
  if (from) { where.push('client_ts >= ?'); params.push(from); }
  if (to) { where.push('client_ts <= ?'); params.push(to); }
  const filter = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  const [events] = await pool.query(
    `SELECT type, app, client_ts, tz_offset_min FROM events${filter} ORDER BY client_ts`, params,
  );
  const [checkins] = await pool.query(
    `SELECT kind, client_ts, tz_offset_min, mood, anxiety, energy,
            sleep_quality, sleep_onset_difficulty, source
       FROM checkins${filter} ORDER BY client_ts`, params,
  );
  const [journalDays] = await pool.query('SELECT * FROM journal_days ORDER BY day');

  return { events, checkins, journalDays };
}

function round(value, places = 1) {
  if (value === null || value === undefined) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function presentDay(day) {
  return {
    day: day.day,
    source: day.source,
    wakeAt: day.wakeAt,
    declaredWake: day.declaredWake,
    sleepOnAt: day.sleepOnAt,
    firstScrollAt: day.firstScrollAt,
    lastScrollAt: day.lastScrollAt,
    minutesToFirstScroll: round(day.minutesToFirstScroll),
    totalMinutes: round(day.totalMinutes),
    morningMinutes: round(day.morningMinutes),
    preSleepMinutes: round(day.preSleepMinutes),
    inBedMinutes: round(day.inBedMinutes),
    perApp: {
      instagram: round(day.perApp.instagram || 0),
      tiktok: round(day.perApp.tiktok || 0),
    },
    episodeCount: day.episodeCount,
    estimatedSessions: day.estimatedSessions,
    ratings: day.ratings,
    sleepBefore: day.sleepBefore,
    sleepAfter: day.sleepAfter,
  };
}

const CSV_COLUMNS = [
  'day', 'source', 'wake_at', 'first_scroll_at', 'minutes_to_first_scroll',
  'total_minutes', 'morning_minutes', 'presleep_minutes', 'in_bed_minutes',
  'instagram_minutes', 'tiktok_minutes', 'episodes', 'estimated_sessions',
  'mood_day', 'anxiety_day', 'energy_day',
  'mood_evening', 'anxiety_evening', 'energy_evening',
  'sleep_quality_after', 'sleep_onset_difficulty_after',
];

function csvRow(day) {
  const daytime = day.ratings.daytime || {};
  const evening = day.ratings.evening || {};
  const values = [
    day.day, day.source,
    day.wakeAt ? day.wakeAt.toISOString() : '',
    day.firstScrollAt ? day.firstScrollAt.toISOString() : '',
    round(day.minutesToFirstScroll) ?? '',
    round(day.totalMinutes) ?? '',
    round(day.morningMinutes) ?? '',
    round(day.preSleepMinutes) ?? '',
    round(day.inBedMinutes) ?? '',
    round(day.perApp.instagram || 0) ?? '',
    round(day.perApp.tiktok || 0) ?? '',
    day.episodeCount, day.estimatedSessions,
    daytime.mood ?? '', daytime.anxiety ?? '', daytime.energy ?? '',
    evening.mood ?? '', evening.anxiety ?? '', evening.energy ?? '',
    day.sleepAfter.quality ?? '', day.sleepAfter.onsetDifficulty ?? '',
  ];
  return values.join(',');
}

module.exports = (requireToken) => {
  const router = express.Router();

  // One record per logical day, which is what most dashboard screens draw.
  router.get('/api/days', requireToken, async (req, res) => {
    const config = readConfig(req.query);
    const data = await loadData(req.query);
    const { days, sessions, episodes, dropped } = buildDays(data, config);
    res.json({
      config,
      counts: {
        days: days.length,
        sessions: sessions.length,
        episodes: episodes.length,
        droppedEvents: dropped.length,
      },
      days: days.map(presentDay),
    });
  });

  // The figures the report needs: how much scrolling, when, and how days with
  // and without it compare. Days without a rating are left out of an average
  // rather than counted as zero, so every average carries its day count.
  router.get('/api/summary', requireToken, async (req, res) => {
    const config = readConfig(req.query);
    const data = await loadData(req.query);
    const { days, sessions, episodes, dropped } = buildDays(data, config);

    const withValue = (list, pick) => list.map(pick).filter((v) => v !== null && v !== undefined);
    const mean = (values) => (values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null);

    const scrolledInMorning = (day) => day.morningMinutes > 0;
    const scrolledBeforeSleep = (day) => day.preSleepMinutes > 0 || day.inBedMinutes > 0;

    const checkinCounts = {
      morning: days.filter((day) => day.sleepBefore.quality !== null).length,
      daytime: days.filter((day) => day.ratings.daytime).length,
      evening: days.filter((day) => day.ratings.evening).length,
    };

    res.json({
      config,
      period: {
        days: days.length,
        first: days[0] ? days[0].day : null,
        last: days.length ? days[days.length - 1].day : null,
        journalDays: days.filter((day) => day.source === 'journal').length,
        appDays: days.filter((day) => day.source === 'app').length,
      },
      capture: {
        sessions: sessions.length,
        episodes: episodes.length,
        estimatedSessions: sessions.filter((s) => s.estimated).length,
        droppedEvents: dropped.length,
        daysWithDeclaredWake: days.filter((day) => day.declaredWake).length,
      },
      averages: {
        totalMinutes: round(mean(withValue(days, (day) => day.totalMinutes))),
        morningMinutes: round(mean(withValue(days, (day) => day.morningMinutes))),
        preSleepMinutes: round(mean(withValue(days, (day) => day.preSleepMinutes))),
        inBedMinutes: round(mean(withValue(days, (day) => day.inBedMinutes))),
        minutesToFirstScroll: round(mean(withValue(days, (day) => day.minutesToFirstScroll))),
      },
      checkinsCompleted: checkinCounts,
      comparisons: {
        // Morning scrolling against how the day felt.
        morningScroll: {
          moodEvening: compareDays(days, scrolledInMorning, 'moodEvening'),
          anxietyEvening: compareDays(days, scrolledInMorning, 'anxietyEvening'),
          energyEvening: compareDays(days, scrolledInMorning, 'energyEvening'),
        },
        // Evening scrolling against the night that followed it. The sleep
        // ratings are given the next morning, which is why sleepAfter is used.
        eveningScroll: {
          sleepQuality: compareDays(days, scrolledBeforeSleep, 'sleepAfterQuality'),
          sleepOnsetDifficulty: compareDays(days, scrolledBeforeSleep, 'sleepAfterOnset'),
        },
      },
    });
  });

  // Everything behind the dashboard, one row per day, for the report's analysis.
  router.get('/api/export.csv', requireToken, async (req, res) => {
    const config = readConfig(req.query);
    const data = await loadData(req.query);
    const { days } = buildDays(data, config);
    const body = [CSV_COLUMNS.join(','), ...days.map(csvRow)].join('\n');
    res.type('text/csv').set('Content-Disposition', 'attachment; filename="scroll-tracker.csv"').send(body);
  });

  return router;
};
