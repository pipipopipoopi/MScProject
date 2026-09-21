#!/bin/bash
# Makes the demo generator cover today as well, so the Today screen has
# something to show during the screencast.
# Run from the repository root:  bash fix-demo.sh

set -e

python3 - << 'PY'
from pathlib import Path

path = Path("server/scripts/generate-demo.js")
text = path.read_text()

old_loop = "for (let index = DAYS; index >= 1; index -= 1) {"
new_loop = "for (let index = DAYS; index >= 0; index -= 1) {"

old_checkin = """  // The morning check-in rates the night that has just ended.
  const nextDay = dayParts(index - 1);
  checkins.push({
    kind: 'morning',
    client_ts: at(nextDay, 8, 45),
    mood: null,
    anxiety: null,
    energy: null,
    sleep_quality: Math.max(1, pick(5, 9) - nightPenalty),
    sleep_onset_difficulty: Math.min(10, pick(2, 5) + nightPenalty),
  });"""

new_checkin = """  // The morning check-in rates the night that has just ended, so it belongs to
  // the following morning. On the last day that morning has not happened yet.
  if (index > 0) {
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
  }"""

if old_loop not in text and "index >= 0" in text:
    print("Already patched.")
else:
    if old_loop not in text or old_checkin not in text:
        raise SystemExit("Could not find the parts to change. Re-run add-demo.sh first.")
    text = text.replace(old_loop, new_loop).replace(old_checkin, new_checkin)
    path.write_text(text)
    print("Demo generator now covers today.")
PY
