// Reproduces every figure reported in Chapter 4 of the report.
//
//   node scripts/analyse.js              reads the live database (.env)
//   node scripts/analyse.js data.json    reads an export instead
//
// The export is the JSON written by the data dump: { events, checkins,
// journalDays }. Nothing is written anywhere; the script only prints.
const fs = require('fs');
const path = require('path');
const { buildDays, buildSessions, buildEpisodes, DEFAULTS } = require('../src/analysis');
const { mean, sd, median, spearman, partialSpearman, thirdsCutoffs } = require('../src/stats');

async function loadData() {
  const file = process.argv[2];
  if (file) return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const pool = require('../src/db');
  const [events] = await pool.query('SELECT type, app, client_ts, tz_offset_min FROM events ORDER BY client_ts');
  const [checkins] = await pool.query('SELECT * FROM checkins ORDER BY client_ts');
  const [journalDays] = await pool.query('SELECT * FROM journal_days ORDER BY day');
  await pool.end();
  return { events, checkins, journalDays };
}

const f = (value, places = 1) => (value === null || value === undefined ? '—' : Number(value).toFixed(places));
const rho = ({ rho: r, n }) => `rho = ${f(r, 2)}, n = ${n}`;
const line = (title) => console.log(`\n=== ${title} ===`);

function localDate(date, offsetMin) {
  return new Date(date.getTime() + offsetMin * 60000).toISOString().slice(0, 10);
}

async function main() {
  const data = await loadData();
  const { days } = buildDays(data);
  const journal = days.filter((day) => day.source === 'journal');
  const app = days.filter((day) => day.source === 'app');
  const daytime = (key) => (day) => (day.ratings.daytime ? day.ratings.daytime[key] : null);
  const evening = (key) => (day) => (day.ratings.evening ? day.ratings.evening[key] : null);

  // ------------------------------------------------------------ 4.3 capture
  line('4.3 Recording reliability (automated phase)');
  const { sessions, dropped } = buildSessions(data.events);
  const minutesOf = (list, app) => list.filter((s) => !app || s.app === app)
    .reduce((sum, s) => sum + s.durationSec, 0) / 60;
  console.log(`automated days: ${app.map((day) => day.day).join(', ') || 'none'}`);
  console.log(`sessions: ${sessions.length}, estimated: ${sessions.filter((s) => s.estimated).length}`);
  console.log(`total minutes: ${f(minutesOf(sessions))} (Instagram ${f(minutesOf(sessions, 'instagram'))}, TikTok ${f(minutesOf(sessions, 'tiktok'))})`);
  const reasons = {};
  for (const d of dropped) reasons[d.reason] = (reasons[d.reason] || 0) + 1;
  console.log(`discarded events: ${dropped.length} ${JSON.stringify(reasons)}`);
  for (const day of app.filter((d) => d.wakeSource)) {
    const gap = day.phoneWakeAt && day.wakeSource === 'reported'
      ? `, alarm ${f((day.wakeAt - day.phoneWakeAt) / 60000, 0)} min before the reported wake-up` : '';
    console.log(`${day.day}: wake from ${day.wakeSource}${gap}`);
  }

  // Table 4.2: calendar-day totals, for comparison with Screen Time.
  line('Table 4.2 Calendar-day totals for the Screen Time comparison');
  const byDate = {};
  for (const s of sessions) {
    const key = localDate(s.startAt, s.offsetMin);
    byDate[key] = byDate[key] || { instagram: 0, tiktok: 0 };
    byDate[key][s.app] += s.durationSec / 60;
  }
  for (const [date, totals] of Object.entries(byDate)) {
    console.log(`${date}: Instagram ${f(totals.instagram)}, TikTok ${f(totals.tiktok)}`);
  }

  // ------------------------------------------------------------ 4.5 findings
  line(`4.5 Descriptives (journal phase, ${journal.length} days)`);
  if (!journal.length) return;
  const morning = journal.map((day) => day.morningMinutes);
  const preSleep = journal.map((day) => day.preSleepMinutes);
  const toFirst = journal.map((day) => day.minutesToFirstScroll);
  console.log(`period: ${journal[0].day} to ${journal[journal.length - 1].day}`);
  console.log(`morning minutes: mean ${f(mean(morning))}, SD ${f(sd(morning))}, range ${Math.min(...morning)}-${Math.max(...morning)}`);
  console.log(`pre-sleep minutes: mean ${f(mean(preSleep))}, SD ${f(sd(preSleep))}, range ${Math.min(...preSleep)}-${Math.max(...preSleep)}`);
  console.log(`waking to first scroll: median ${f(median(toFirst), 0)} min, within 5 min on ${toFirst.filter((v) => v !== null && v <= 5).length} days`);

  line('RQ4 Morning scrolling and the day (Spearman)');
  for (const key of ['mood', 'anxiety', 'energy']) {
    console.log(`${key}: afternoon ${rho(spearman(morning, journal.map(daytime(key))))}; evening ${rho(spearman(morning, journal.map(evening(key))))}`);
  }
  const sleepBefore = journal.map((day) => day.sleepBefore.quality);
  console.log(`previous-night sleep ~ morning minutes: ${rho(spearman(sleepBefore, morning))}`);
  console.log(`previous-night sleep ~ afternoon mood: ${rho(spearman(sleepBefore, journal.map(daytime('mood'))))}`);
  console.log(`morning ~ afternoon mood, sleep held constant: partial ${rho(partialSpearman(morning, journal.map(daytime('mood')), sleepBefore))}`);
  const cut = median(sleepBefore);
  for (const [label, test] of [[`sleep <= ${cut}`, (d) => d.sleepBefore.quality <= cut], [`sleep > ${cut}`, (d) => d.sleepBefore.quality > cut]]) {
    const group = journal.filter(test);
    console.log(`within ${label}: ${rho(spearman(group.map((d) => d.morningMinutes), group.map(daytime('mood'))))}`);
  }

  line('Table 4.4 Afternoon ratings by thirds of morning scrolling');
  const m = thirdsCutoffs(morning);
  for (const [label, test] of [
    [`under ${m.low} min`, (d) => d.morningMinutes < m.low],
    [`${m.low}-${m.high} min`, (d) => d.morningMinutes >= m.low && d.morningMinutes < m.high],
    [`${m.high} min or more`, (d) => d.morningMinutes >= m.high],
  ]) {
    const g = journal.filter(test);
    console.log(`${label}: ${g.length} days, mood ${f(mean(g.map(daytime('mood'))))}, anxiety ${f(mean(g.map(daytime('anxiety'))))}, energy ${f(mean(g.map(daytime('energy'))))}, previous-night sleep ${f(mean(g.map((d) => d.sleepBefore.quality)))}`);
  }

  line('RQ5 Pre-sleep scrolling and the night after (Spearman)');
  console.log(`sleep quality: ${rho(spearman(preSleep, journal.map((d) => d.sleepAfter.quality)))}`);
  console.log(`difficulty falling asleep: ${rho(spearman(preSleep, journal.map((d) => d.sleepAfter.onsetDifficulty)))}`);
  const rated = journal.filter((d) => d.sleepAfter.quality !== null);
  const p = thirdsCutoffs(rated.map((d) => d.preSleepMinutes));
  for (const [label, test] of [
    [`under ${p.low} min`, (d) => d.preSleepMinutes < p.low],
    [`${p.low}-${p.high} min`, (d) => d.preSleepMinutes >= p.low && d.preSleepMinutes < p.high],
    [`${p.high} min or more`, (d) => d.preSleepMinutes >= p.high],
  ]) {
    const g = rated.filter(test);
    console.log(`${label}: ${g.length} days, next-night sleep ${f(mean(g.map((d) => d.sleepAfter.quality)))}, difficulty ${f(mean(g.map((d) => d.sleepAfter.onsetDifficulty)))}`);
  }

  // ------------------------------------------------------------ 4.6 sensitivity
  line('4.6 Sensitivity to the merge gap (automated phase)');
  for (const gap of [30, 60, 120, 300]) {
    const episodes = buildEpisodes(sessions, { mergeGapSec: gap });
    const active = episodes.reduce((sum, e) => sum + e.activeSec, 0) / 60;
    console.log(`${gap} s${gap === DEFAULTS.mergeGapSec ? ' (default)' : ''}: ${episodes.length} episodes, ${f(active)} active minutes`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
