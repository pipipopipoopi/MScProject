// Pure functions that turn raw events into sessions, scroll episodes and days.
// Nothing here touches the database: the same functions are used by the API,
// by the tests and by the sensitivity analysis, so every threshold is a setting.

const DEFAULTS = {
  // Sessions closer together than this become one scroll episode.
  mergeGapSec: 60,
  // Anything shorter than this is treated as noise, not as scrolling.
  minSessionSec: 5,
  // An open event with no close is closed at the next event or after this.
  orphanCapMin: 30,
  // Used only on days with no wake marker: the logical day starts at this
  // local hour, so scrolling after midnight stays with the previous day.
  dayBoundaryHour: 7,
  // "Morning use" is scrolling within this many minutes of waking.
  morningWindowMin: 60,
  // "Pre-sleep use" is scrolling within this many minutes before the sleep marker.
  preSleepWindowMin: 60,
};

const MS = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 };

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

// Every event carries the offset that was in force when it happened, so local
// time is recovered without guessing about British Summer Time.
function localDate(event) {
  return new Date(toDate(event.client_ts).getTime() + (event.tz_offset_min || 0) * MS.minute);
}

function localDayString(date) {
  return date.toISOString().slice(0, 10);
}

function sortByTime(events) {
  return [...events].sort((a, b) => toDate(a.client_ts) - toDate(b.client_ts));
}

/**
 * Pairs open and close events into sessions.
 * Missing close events are the common failure of iOS Shortcuts, so they are
 * closed at the next event or at the cap and flagged rather than dropped.
 */
function buildSessions(events, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const ordered = sortByTime(events).filter((e) => e.type === 'open' || e.type === 'close');
  const sessions = [];
  const dropped = [];
  const openByApp = new Map();

  const close = (open, endAt, estimated) => {
    const durationSec = (endAt - toDate(open.client_ts)) / MS.second;
    if (durationSec < config.minSessionSec) {
      dropped.push({ reason: 'too short', app: open.app, at: toDate(open.client_ts) });
      return;
    }
    sessions.push({
      app: open.app,
      startAt: toDate(open.client_ts),
      endAt,
      offsetMin: open.tz_offset_min || 0,
      durationSec,
      estimated,
      source: open.source || 'app',
    });
  };

  for (const event of ordered) {
    const at = toDate(event.client_ts);

    if (event.type === 'open') {
      const previous = openByApp.get(event.app);
      if (previous) {
        // Two opens in a row: the first session ends where the second begins.
        const cap = new Date(toDate(previous.client_ts).getTime() + config.orphanCapMin * MS.minute);
        close(previous, at < cap ? at : cap, true);
      }
      openByApp.set(event.app, event);
      continue;
    }

    const open = openByApp.get(event.app);
    if (!open) {
      dropped.push({ reason: 'close without open', app: event.app, at });
      continue;
    }
    openByApp.delete(event.app);
    close(open, at, false);
  }

  // Anything still open at the end of the data is capped and flagged.
  for (const open of openByApp.values()) {
    close(open, new Date(toDate(open.client_ts).getTime() + config.orphanCapMin * MS.minute), true);
  }

  sessions.sort((a, b) => a.startAt - b.startAt);
  return { sessions, dropped };
}

/**
 * Merges nearby sessions into scroll episodes. Switching from Instagram to
 * TikTok is one episode of scrolling, not two, which is what the merge gap is
 * for. Merging changes the number and length of episodes, never the total time.
 */
function buildEpisodes(sessions, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const episodes = [];

  for (const session of sessions) {
    const current = episodes[episodes.length - 1];
    const gapSec = current ? (session.startAt - current.endAt) / MS.second : Infinity;

    if (current && gapSec <= config.mergeGapSec) {
      current.endAt = session.endAt > current.endAt ? session.endAt : current.endAt;
      current.sessions.push(session);
      current.apps.add(session.app);
      current.activeSec += session.durationSec;
      current.estimated = current.estimated || session.estimated;
      continue;
    }

    episodes.push({
      startAt: session.startAt,
      endAt: session.endAt,
      offsetMin: session.offsetMin,
      apps: new Set([session.app]),
      sessions: [session],
      activeSec: session.durationSec,
      estimated: session.estimated,
    });
  }

  return episodes.map((episode) => ({
    ...episode,
    apps: [...episode.apps],
    spanSec: (episode.endAt - episode.startAt) / MS.second,
  }));
}

/**
 * Works out where each logical day begins. A day runs from one wake marker to
 * the next, so scrolling at 2 a.m. belongs to the day that is ending, not to
 * the calendar date. Days without a wake marker fall back to a fixed local hour.
 */
function buildDayBoundaries(events, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const wakes = sortByTime(events.filter((e) => e.type === 'sleep_off'));

  // Only the first wake marker of each morning counts: waking up and stopping
  // an alarm can both fire.
  const anchors = [];
  for (const wake of wakes) {
    const at = toDate(wake.client_ts);
    const last = anchors[anchors.length - 1];
    if (last && at - last.at < 6 * MS.hour) continue;
    anchors.push({ at, offsetMin: wake.tz_offset_min || 0, declared: true });
  }
  return anchors;
}

function fallbackDayStart(date, offsetMin, boundaryHour) {
  const local = new Date(date.getTime() + offsetMin * MS.minute);
  const start = new Date(local);
  start.setUTCHours(boundaryHour, 0, 0, 0);
  if (local < start) start.setUTCDate(start.getUTCDate() - 1);
  return { localStart: start, utcStart: new Date(start.getTime() - offsetMin * MS.minute) };
}

/**
 * Assigns a moment to a logical day and returns that day's key (YYYY-MM-DD of
 * the day it belongs to) together with the wake marker, when there is one.
 */
function assignDay(at, offsetMin, anchors, config) {
  let anchor = null;
  for (const candidate of anchors) {
    if (candidate.at <= at) anchor = candidate; else break;
  }

  const fallback = fallbackDayStart(at, offsetMin, config.dayBoundaryHour);
  // A wake marker only owns the moment if it belongs to the same stretch of
  // time; otherwise the fixed boundary is used.
  if (anchor && at - anchor.at <= 28 * MS.hour && anchor.at >= fallback.utcStart) {
    const localWake = new Date(anchor.at.getTime() + anchor.offsetMin * MS.minute);
    return { day: localDayString(localWake), wakeAt: anchor.at, declaredWake: true };
  }
  return { day: localDayString(fallback.localStart), wakeAt: null, declaredWake: false };
}

/**
 * Builds one record per logical day: when the day started, how much scrolling
 * happened, when it happened relative to waking and to going to bed.
 *
 * Sleep ratings are recorded on waking and describe the night before, so a
 * day's own scrolling is related to the NEXT morning's sleep ratings. That is
 * what `sleepAfter` holds; `sleepBefore` is the night that preceded the day.
 */
function buildDays({ events = [], checkins = [], journalDays = [] }, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const anchors = buildDayBoundaries(events, config);
  const { sessions, dropped } = buildSessions(events, config);
  const episodes = buildEpisodes(sessions, config);
  const days = new Map();

  const dayRecord = (key) => {
    if (!days.has(key)) {
      days.set(key, {
        day: key,
        source: 'app',
        wakeAt: null,
        declaredWake: false,
        sleepOnAt: null,
        firstScrollAt: null,
        lastScrollAt: null,
        minutesToFirstScroll: null,
        totalMinutes: 0,
        morningMinutes: 0,
        preSleepMinutes: 0,
        inBedMinutes: 0,
        perApp: { instagram: 0, tiktok: 0 },
        episodeCount: 0,
        estimatedSessions: 0,
        ratings: { daytime: null, evening: null },
        sleepBefore: { quality: null, onsetDifficulty: null },
        sleepAfter: { quality: null, onsetDifficulty: null },
      });
    }
    return days.get(key);
  };

  // Sleep markers give the evening anchor of the day they fall in.
  for (const event of sortByTime(events.filter((e) => e.type === 'sleep_on'))) {
    const at = toDate(event.client_ts);
    const { day, wakeAt, declaredWake } = assignDay(at, event.tz_offset_min || 0, anchors, config);
    const record = dayRecord(day);
    record.sleepOnAt = at;
    record.wakeAt = record.wakeAt || wakeAt;
    record.declaredWake = record.declaredWake || declaredWake;
  }

  for (const anchor of anchors) {
    const localWake = new Date(anchor.at.getTime() + anchor.offsetMin * MS.minute);
    const record = dayRecord(localDayString(localWake));
    record.wakeAt = anchor.at;
    record.declaredWake = true;
  }

  for (const session of sessions) {
    const { day, wakeAt, declaredWake } = assignDay(session.startAt, session.offsetMin, anchors, config);
    const record = dayRecord(day);
    record.wakeAt = record.wakeAt || wakeAt;
    record.declaredWake = record.declaredWake || declaredWake;

    const minutes = session.durationSec / 60;
    record.totalMinutes += minutes;
    record.perApp[session.app] = (record.perApp[session.app] || 0) + minutes;
    if (session.estimated) record.estimatedSessions += 1;

    if (!record.firstScrollAt || session.startAt < record.firstScrollAt) {
      record.firstScrollAt = session.startAt;
    }
    if (!record.lastScrollAt || session.endAt > record.lastScrollAt) {
      record.lastScrollAt = session.endAt;
    }
  }

  for (const episode of episodes) {
    const { day } = assignDay(episode.startAt, episode.offsetMin, anchors, config);
    dayRecord(day).episodeCount += 1;
  }

  // Windows need the anchors, so they are filled once every day is known.
  for (const record of days.values()) {
    if (record.wakeAt && record.firstScrollAt) {
      record.minutesToFirstScroll = Math.max(0, (record.firstScrollAt - record.wakeAt) / MS.minute);
    }
  }

  for (const session of sessions) {
    const { day } = assignDay(session.startAt, session.offsetMin, anchors, config);
    const record = dayRecord(day);
    const minutes = session.durationSec / 60;

    if (record.wakeAt) {
      const morningEnd = new Date(record.wakeAt.getTime() + config.morningWindowMin * MS.minute);
      if (session.startAt >= record.wakeAt && session.startAt < morningEnd) {
        record.morningMinutes += minutes;
      }
    }
    if (record.sleepOnAt) {
      const preSleepStart = new Date(record.sleepOnAt.getTime() - config.preSleepWindowMin * MS.minute);
      if (session.startAt >= preSleepStart && session.startAt < record.sleepOnAt) {
        record.preSleepMinutes += minutes;
      }
      if (session.startAt >= record.sleepOnAt) {
        record.inBedMinutes += minutes;
      }
    }
  }

  // Check-ins: daytime and evening describe the day they fall in; the morning
  // one describes the night that has just ended.
  for (const checkin of checkins) {
    const at = toDate(checkin.client_ts);
    const offsetMin = checkin.tz_offset_min || 0;
    const kind = checkin.kind;

    if (kind === 'morning') {
      const local = new Date(at.getTime() + offsetMin * MS.minute);
      const morningOf = localDayString(local);
      const nightBefore = localDayString(new Date(local.getTime() - MS.day));
      dayRecord(morningOf).sleepBefore = {
        quality: checkin.sleep_quality ?? null,
        onsetDifficulty: checkin.sleep_onset_difficulty ?? null,
      };
      // The night that followed the previous day's scrolling.
      dayRecord(nightBefore).sleepAfter = {
        quality: checkin.sleep_quality ?? null,
        onsetDifficulty: checkin.sleep_onset_difficulty ?? null,
      };
      continue;
    }

    const { day } = assignDay(at, offsetMin, anchors, config);
    dayRecord(day).ratings[kind] = {
      mood: checkin.mood ?? null,
      anxiety: checkin.anxiety ?? null,
      energy: checkin.energy ?? null,
    };
  }

  // Journal days already hold daily totals, so they are added in the same shape
  // and marked with their source for the analysis in the report.
  for (const entry of journalDays) {
    const key = typeof entry.day === 'string' ? entry.day.slice(0, 10) : localDayString(toDate(entry.day));
    const record = dayRecord(key);
    record.source = 'journal';
    record.wakeAt = entry.wake_ts ? toDate(entry.wake_ts) : record.wakeAt;
    record.declaredWake = record.declaredWake || Boolean(entry.wake_ts);
    record.firstScrollAt = entry.first_scroll_ts ? toDate(entry.first_scroll_ts) : record.firstScrollAt;
    record.sleepOnAt = entry.presleep_scroll_ts ? toDate(entry.presleep_scroll_ts) : record.sleepOnAt;

    const morning = (entry.morning_instagram_min || 0) + (entry.morning_tiktok_min || 0);
    const preSleep = (entry.presleep_instagram_min || 0) + (entry.presleep_tiktok_min || 0);
    record.morningMinutes += morning;
    record.preSleepMinutes += preSleep;
    record.totalMinutes += morning + preSleep;
    record.perApp.instagram += (entry.morning_instagram_min || 0) + (entry.presleep_instagram_min || 0);
    record.perApp.tiktok += (entry.morning_tiktok_min || 0) + (entry.presleep_tiktok_min || 0);

    if (record.wakeAt && record.firstScrollAt) {
      record.minutesToFirstScroll = Math.max(0, (record.firstScrollAt - record.wakeAt) / MS.minute);
    }
  }

  return {
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    sessions,
    episodes,
    dropped,
    config,
  };
}

/**
 * Compares days with and without morning scrolling. Days with no rating are
 * left out of the average rather than counted as zero, and the number of days
 * behind each average is reported alongside it.
 */
function compareDays(days, predicate, field) {
  const pick = (day) => {
    const daytime = day.ratings.daytime;
    const evening = day.ratings.evening;
    if (field === 'sleepAfterQuality') return day.sleepAfter.quality;
    if (field === 'sleepAfterOnset') return day.sleepAfter.onsetDifficulty;
    const source = field.endsWith('Evening') ? evening : daytime;
    if (!source) return null;
    return source[field.replace('Evening', '')] ?? null;
  };

  const collect = (subset) => {
    const values = subset.map(pick).filter((value) => value !== null && value !== undefined);
    const mean = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
    return { mean, days: values.length };
  };

  return {
    matching: collect(days.filter(predicate)),
    other: collect(days.filter((day) => !predicate(day))),
  };
}

module.exports = {
  DEFAULTS,
  buildSessions,
  buildEpisodes,
  buildDays,
  compareDays,
};
