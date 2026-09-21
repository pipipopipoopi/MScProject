const { buildSessions, buildEpisodes, buildDays, DEFAULTS } = require('../src/analysis');

// British Summer Time. Events carry the offset that was in force when they
// happened, so the tests are written in local time and converted the way the
// phone sends them.
const OFFSET = 60;

function ts(local) {
  return new Date(new Date(local + 'Z').getTime() - OFFSET * 60000);
}

function ev(type, app, local) {
  return { type, app, client_ts: ts(local), tz_offset_min: OFFSET };
}

describe('scroll episodes', () => {
  // Instagram for ten minutes, away for four minutes, then TikTok for six.
  const withBreak = [
    ev('open', 'instagram', '2026-09-20T13:00:00'),
    ev('close', 'instagram', '2026-09-20T13:10:00'),
    ev('open', 'tiktok', '2026-09-20T13:14:00'),
    ev('close', 'tiktok', '2026-09-20T13:20:00'),
  ];

  test('the merge gap is the agreed two minutes', () => {
    expect(DEFAULTS.mergeGapSec).toBe(120);
  });

  test('a four-minute break separates two episodes at the chosen threshold', () => {
    const { sessions } = buildSessions(withBreak);
    const episodes = buildEpisodes(sessions);

    expect(sessions).toHaveLength(2);
    expect(episodes).toHaveLength(2);
  });

  test('switching app within the gap is one episode, not two', () => {
    // Instagram, thirty seconds away, TikTok: one stretch of scrolling.
    const quickSwitch = [
      ev('open', 'instagram', '2026-09-20T13:00:00'),
      ev('close', 'instagram', '2026-09-20T13:10:00'),
      ev('open', 'tiktok', '2026-09-20T13:10:30'),
      ev('close', 'tiktok', '2026-09-20T13:16:30'),
    ];
    const { sessions } = buildSessions(quickSwitch);
    const episodes = buildEpisodes(sessions);

    expect(episodes).toHaveLength(1);
    expect(episodes[0].apps.sort()).toEqual(['instagram', 'tiktok']);
    expect(episodes[0].activeSec).toBe(16 * 60);
    // The pause itself is not counted as scrolling: the episode spans longer
    // than the time actually spent in the apps.
    expect(episodes[0].spanSec).toBe(16.5 * 60);
  });

  test('a wider threshold merges the four-minute break, which is what the sensitivity analysis varies', () => {
    const { sessions } = buildSessions(withBreak, { mergeGapSec: 300 });
    expect(buildEpisodes(sessions, { mergeGapSec: 300 })).toHaveLength(1);
  });

  test('merging never changes the total time, only the number of episodes', () => {
    const { sessions } = buildSessions(withBreak);
    const total = sessions.reduce((sum, session) => sum + session.durationSec, 0);

    for (const mergeGapSec of [30, 60, 120, 300]) {
      const episodes = buildEpisodes(sessions, { mergeGapSec });
      const active = episodes.reduce((sum, episode) => sum + episode.activeSec, 0);
      expect(active).toBe(total);
    }
  });
});

describe('sessions', () => {
  test('an open with no close is capped and flagged as estimated', () => {
    const { sessions } = buildSessions([ev('open', 'tiktok', '2026-09-20T13:00:00')]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].estimated).toBe(true);
    expect(sessions[0].durationSec).toBe(DEFAULTS.orphanCapMin * 60);
  });

  test('a glance of a couple of seconds is not counted as scrolling', () => {
    const { sessions, dropped } = buildSessions([
      ev('open', 'instagram', '2026-09-20T13:00:00'),
      ev('close', 'instagram', '2026-09-20T13:00:02'),
    ]);

    expect(sessions).toHaveLength(0);
    expect(dropped[0].reason).toBe('too short');
  });
});

describe('logical days', () => {
  // Awake on the 20th, to bed at 02:45 on the 21st, scrolling in bed after
  // that. All of it belongs to the 20th: the day runs from wake to wake.
  const events = [
    ev('sleep_off', null, '2026-09-20T08:00:00'),
    ev('open', 'instagram', '2026-09-20T08:05:00'),
    ev('close', 'instagram', '2026-09-20T08:20:00'),
    ev('open', 'tiktok', '2026-09-21T02:10:00'),
    ev('close', 'tiktok', '2026-09-21T02:30:00'),
    ev('sleep_on', null, '2026-09-21T02:45:00'),
    ev('open', 'tiktok', '2026-09-21T02:46:00'),
    ev('close', 'tiktok', '2026-09-21T03:10:00'),
    ev('sleep_off', null, '2026-09-21T11:00:00'),
  ];

  test('scrolling after midnight counts towards the day that is ending', () => {
    const { days } = buildDays({ events });
    const byDay = Object.fromEntries(days.map((day) => [day.day, day]));

    expect(byDay['2026-09-20'].totalMinutes).toBeCloseTo(59);
    expect(byDay['2026-09-21'].totalMinutes).toBe(0);
  });

  test('scrolling is split into morning, before sleep and in bed', () => {
    const { days } = buildDays({ events });
    const day = days.find((entry) => entry.day === '2026-09-20');

    expect(day.morningMinutes).toBeCloseTo(15);
    expect(day.preSleepMinutes).toBeCloseTo(20);
    expect(day.inBedMinutes).toBeCloseTo(24);
    expect(day.declaredWake).toBe(true);
  });

  test('a morning check-in describes the night before, not the day it is answered on', () => {
    const checkins = [
      {
        kind: 'morning',
        client_ts: ts('2026-09-21T11:05:00'),
        tz_offset_min: OFFSET,
        sleep_quality: 4,
        sleep_onset_difficulty: 8,
      },
    ];
    const { days } = buildDays({ events, checkins });
    const byDay = Object.fromEntries(days.map((day) => [day.day, day]));

    // Answered on the 21st, so it rates the night that followed the 20th.
    expect(byDay['2026-09-20'].sleepAfter.quality).toBe(4);
    expect(byDay['2026-09-21'].sleepBefore.onsetDifficulty).toBe(8);
  });
});

describe('the night rule', () => {
  test('night ends at 05:00 by default', () => {
    expect(DEFAULTS.dayBoundaryHour).toBe(5);
  });

  test('switching Sleep mode off at night is not waking up', () => {
    const events = [
      ev('sleep_on', null, '2026-09-21T00:30:00'),
      ev('sleep_off', null, '2026-09-21T02:30:00'),
      ev('open', 'tiktok', '2026-09-21T02:37:00'),
      ev('close', 'tiktok', '2026-09-21T02:50:00'),
      ev('sleep_off', null, '2026-09-21T10:00:00'),
      ev('open', 'instagram', '2026-09-21T10:05:00'),
      ev('close', 'instagram', '2026-09-21T10:20:00'),
    ];
    const byDay = Object.fromEntries(buildDays({ events }).days.map((day) => [day.day, day]));

    // The 02:37 scroll is the night before, in bed after Sleep mode began.
    expect(byDay['2026-09-20'].inBedMinutes).toBeCloseTo(13);
    // The morning starts at the real wake-up.
    expect(byDay['2026-09-21'].morningMinutes).toBeCloseTo(15);
    expect(byDay['2026-09-21'].minutesToFirstScroll).toBeCloseTo(5);
  });

  test('a night marker less than six hours before waking does not hide the real wake-up', () => {
    const events = [
      ev('sleep_off', null, '2026-09-21T04:30:00'),
      ev('sleep_off', null, '2026-09-21T09:00:00'),
      ev('open', 'instagram', '2026-09-21T09:05:00'),
      ev('close', 'instagram', '2026-09-21T09:20:00'),
    ];
    const day = buildDays({ events }).days.find((entry) => entry.day === '2026-09-21');

    expect(day.morningMinutes).toBeCloseTo(15);
  });

  test('the first scroll after waking ignores scrolling earlier that day', () => {
    const events = [
      ev('open', 'tiktok', '2026-09-21T06:00:00'),
      ev('close', 'tiktok', '2026-09-21T06:10:00'),
      ev('sleep_off', null, '2026-09-21T10:00:00'),
      ev('open', 'instagram', '2026-09-21T10:30:00'),
      ev('close', 'instagram', '2026-09-21T10:40:00'),
    ];
    const day = buildDays({ events }).days.find((entry) => entry.day === '2026-09-21');

    expect(day.minutesToFirstScroll).toBeCloseTo(30);
  });
});
