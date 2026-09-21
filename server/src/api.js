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

// ?since=YYYY-MM-DD keeps only the logical days from that date on. The date
// comes from the phone, so "the last 14 days" follows the user's own calendar.
function sinceDay(query) {
  return /^\d{4}-\d{2}-\d{2}$/.test(query.since || '') ? query.since : null;
}

function localDayOf(session) {
  return new Date(session.startAt.getTime() + session.offsetMin * 60000).toISOString().slice(0, 10);
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
    firstScrollAfterWakeAt: day.firstScrollAfterWakeAt,
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

// Spreads each session across the local hours it covers, so a session running
// from 23:50 to 00:20 adds ten minutes to one hour and twenty to the next.
// Rows are weekdays (Monday first) and columns are hours of the local clock.
function hourlyGrid(sessions) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));

  for (const session of sessions) {
    let at = session.startAt.getTime() + session.offsetMin * 60000;
    const end = session.endAt.getTime() + session.offsetMin * 60000;

    while (at < end) {
      const local = new Date(at);
      const nextHour = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
        local.getUTCHours() + 1,
      );
      const sliceEnd = Math.min(end, nextHour);
      const weekday = (local.getUTCDay() + 6) % 7; // Monday = 0
      grid[weekday][local.getUTCHours()] += (sliceEnd - at) / 60000;
      at = sliceEnd;
    }
  }

  return grid;
}

// Groups days by how much scrolling they contained and averages the ratings in
// each group. Days with no rating are left out of an average rather than
// counted as zero, so every figure carries the number of days behind it.
function groupAverages(days, groups, pick) {
  return groups.map((group) => {
    const members = days.filter(group.test);
    const average = (get) => {
      const values = members.map(get).filter((value) => value !== null && value !== undefined);
      if (!values.length) return null;
      return round(values.reduce((sum, value) => sum + value, 0) / values.length);
    };
    return { label: group.label, days: members.length, ...pick(average) };
  });
}

// Scrolling that belongs to the night: the hour before the sleep marker plus
// anything after it, which is scrolling in bed.
function nightMinutes(day) {
  return (day.preSleepMinutes || 0) + (day.inBedMinutes || 0);
}

module.exports = (requireToken) => {
  const router = express.Router();

  // One record per logical day, which is what most dashboard screens draw.
  router.get('/api/days', requireToken, async (req, res) => {
    const config = readConfig(req.query);
    const data = await loadData(req.query);
    const built = buildDays(data, config);
    const since = sinceDay(req.query);
    const days = since ? built.days.filter((day) => day.day >= since) : built.days;
    const { sessions, episodes, dropped } = built;
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
    // A window can only be measured on a day that has its marker. Days without
    // one are left out, so that a missing marker is never read as no scrolling.
    const woke = days.filter((day) => day.wakeAt);
    const slept = days.filter((day) => day.sleepOnAt);

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
        morningMinutes: round(mean(withValue(woke, (day) => day.morningMinutes))),
        preSleepMinutes: round(mean(withValue(slept, (day) => day.preSleepMinutes))),
        inBedMinutes: round(mean(withValue(slept, (day) => day.inBedMinutes))),
        minutesToFirstScroll: round(mean(withValue(days, (day) => day.minutesToFirstScroll))),
      },
      checkinsCompleted: checkinCounts,
      comparisons: {
        // Morning scrolling against how the day felt.
        morningScroll: {
          moodEvening: compareDays(woke, scrolledInMorning, 'moodEvening'),
          anxietyEvening: compareDays(woke, scrolledInMorning, 'anxietyEvening'),
          energyEvening: compareDays(woke, scrolledInMorning, 'energyEvening'),
        },
        // Evening scrolling against the night that followed it. The sleep
        // ratings are given the next morning, which is why sleepAfter is used.
        eveningScroll: {
          sleepQuality: compareDays(slept, scrolledBeforeSleep, 'sleepAfterQuality'),
          sleepOnsetDifficulty: compareDays(slept, scrolledBeforeSleep, 'sleepAfterOnset'),
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

  // Minutes of scrolling by weekday and hour, for the heatmap. Days are counted
  // per weekday so the dashboard can show an average rather than a total.
  router.get('/api/hourly', requireToken, async (req, res) => {
    const config = readConfig(req.query);
    const data = await loadData(req.query);
    const built = buildDays(data, config);
    const since = sinceDay(req.query);
    const sessions = since
      ? built.sessions.filter((session) => localDayOf(session) >= since)
      : built.sessions;

    // Only automatically recorded days have hourly detail; diary days hold
    // window totals and would dilute the averages if they were counted.
    const observedDays = new Array(7).fill(0);
    for (const day of built.days) {
      if (day.source !== 'app' || (since && day.day < since)) continue;
      const weekday = (new Date(day.day + 'T12:00:00Z').getUTCDay() + 6) % 7;
      observedDays[weekday] += 1;
    }

    const totals = hourlyGrid(sessions);
    res.json({
      config,
      since,
      weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      observedDays,
      minutes: totals.map((row) => row.map((value) => round(value))),
      // Minutes in an hour on an average day of that weekday within the period.
      average: totals.map((row, weekday) =>
        row.map((value) => (observedDays[weekday] ? round(value / observedDays[weekday]) : null))),
    });
  });

  // How days with and without scrolling compare. Morning scrolling is set
  // against how the day itself felt; night scrolling against the sleep that
  // followed it, which is rated the next morning (sleepAfter).
  router.get('/api/wellbeing', requireToken, async (req, res) => {
    const config = readConfig(req.query);
    const data = await loadData(req.query);
    const { days } = buildDays(data, config);

    const morningGroups = [
      { label: 'No morning scrolling', test: (day) => day.wakeAt && !day.morningMinutes },
      { label: 'Under 20 min', test: (day) => day.wakeAt && day.morningMinutes > 0 && day.morningMinutes < 20 },
      { label: '20+ min', test: (day) => day.wakeAt && day.morningMinutes >= 20 },
    ];

    const nightGroups = [
      { label: 'No night scrolling', test: (day) => day.sleepOnAt && !nightMinutes(day) },
      { label: 'Under 30 min', test: (day) => day.sleepOnAt && nightMinutes(day) > 0 && nightMinutes(day) < 30 },
      { label: '30+ min', test: (day) => day.sleepOnAt && nightMinutes(day) >= 30 },
    ];

    res.json({
      config,
      totalDays: days.length,
      // Reported so the screen can say how many days could not be grouped.
      daysWithoutWake: days.filter((day) => !day.wakeAt).length,
      daysWithoutSleepMarker: days.filter((day) => !day.sleepOnAt).length,
      morning: groupAverages(days, morningGroups, (average) => ({
        daytime: {
          mood: average((day) => day.ratings.daytime && day.ratings.daytime.mood),
          anxiety: average((day) => day.ratings.daytime && day.ratings.daytime.anxiety),
          energy: average((day) => day.ratings.daytime && day.ratings.daytime.energy),
        },
        evening: {
          mood: average((day) => day.ratings.evening && day.ratings.evening.mood),
          anxiety: average((day) => day.ratings.evening && day.ratings.evening.anxiety),
          energy: average((day) => day.ratings.evening && day.ratings.evening.energy),
        },
      })),
      night: groupAverages(days, nightGroups, (average) => ({
        sleepQuality: average((day) => day.sleepAfter.quality),
        sleepOnsetDifficulty: average((day) => day.sleepAfter.onsetDifficulty),
      })),
    });
  });

  return router;
};
