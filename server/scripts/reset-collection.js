// Clears the rows recorded while the tracker was being built, so data
// collection starts from a clean slate. The paper journal is never touched:
// journal_days stays, and only check-ins that came from the app are removed.
//
//   node scripts/reset-collection.js             shows what would be deleted
//   node scripts/reset-collection.js --confirm   deletes it
const pool = require('../src/db');

async function counts() {
  const [[events]] = await pool.query('SELECT COUNT(*) AS n FROM events');
  const [[appCheckins]] = await pool.query(
    "SELECT COUNT(*) AS n FROM checkins WHERE source IS NULL OR source <> 'journal'",
  );
  const [[journalCheckins]] = await pool.query(
    "SELECT COUNT(*) AS n FROM checkins WHERE source = 'journal'",
  );
  const [[journalDays]] = await pool.query('SELECT COUNT(*) AS n FROM journal_days');
  return {
    events: events.n,
    appCheckins: appCheckins.n,
    journalCheckins: journalCheckins.n,
    journalDays: journalDays.n,
  };
}

async function main() {
  const confirmed = process.argv.includes('--confirm');
  const before = await counts();

  console.log('Currently in the database:');
  console.log(`  events                 ${before.events}`);
  console.log(`  check-ins from the app ${before.appCheckins}`);
  console.log(`  check-ins from journal ${before.journalCheckins}  (kept)`);
  console.log(`  journal days           ${before.journalDays}  (kept)`);

  if (!confirmed) {
    console.log('\nNothing was deleted. Re-run with --confirm to delete the first two.');
    await pool.end();
    return;
  }

  await pool.query('DELETE FROM events');
  await pool.query("DELETE FROM checkins WHERE source IS NULL OR source <> 'journal'");

  const after = await counts();
  console.log('\nDeleted.');
  console.log(`  events                 ${after.events}`);
  console.log(`  check-ins from the app ${after.appCheckins}`);
  console.log(`  check-ins from journal ${after.journalCheckins}`);
  console.log(`  journal days           ${after.journalDays}`);

  await pool.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
