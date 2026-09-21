CREATE TABLE IF NOT EXISTS events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('open', 'close', 'sleep_on', 'sleep_off') NOT NULL,
  app ENUM('instagram', 'tiktok', 'none') NOT NULL DEFAULT 'none',
  client_ts DATETIME(3) NOT NULL,
  tz_offset_min SMALLINT NOT NULL,
  received_ts DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  source ENUM('shortcut', 'journal') NOT NULL DEFAULT 'shortcut',
  UNIQUE KEY uniq_event (type, app, client_ts)
);

CREATE TABLE IF NOT EXISTS checkins (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('morning', 'daytime', 'evening') NOT NULL,
  client_ts DATETIME(3) NOT NULL,
  tz_offset_min SMALLINT NOT NULL,
  mood TINYINT NOT NULL CHECK (mood BETWEEN 1 AND 10),
  anxiety TINYINT NOT NULL CHECK (anxiety BETWEEN 1 AND 10),
  energy TINYINT NOT NULL CHECK (energy BETWEEN 1 AND 10),
  sleep_quality TINYINT NULL CHECK (sleep_quality BETWEEN 1 AND 10),
  sleep_onset_difficulty TINYINT NULL CHECK (sleep_onset_difficulty BETWEEN 1 AND 10),
  received_ts DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  source ENUM('shortcut', 'manual', 'journal') NOT NULL DEFAULT 'shortcut',
  UNIQUE KEY uniq_checkin (kind, client_ts)
);

-- Days from the paper diary kept before the app existed. Daily totals only:
-- the diary has no session-level detail, which is why these days are marked
-- with a source and analysed separately where that matters.
CREATE TABLE IF NOT EXISTS journal_days (
  id INT AUTO_INCREMENT PRIMARY KEY,
  day DATE NOT NULL,
  wake_ts DATETIME(3) DEFAULT NULL,
  first_scroll_ts DATETIME(3) DEFAULT NULL,
  presleep_scroll_ts DATETIME(3) DEFAULT NULL,
  tz_offset_min SMALLINT NOT NULL,
  morning_instagram_min SMALLINT DEFAULT NULL,
  morning_tiktok_min SMALLINT DEFAULT NULL,
  presleep_instagram_min SMALLINT DEFAULT NULL,
  presleep_tiktok_min SMALLINT DEFAULT NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'journal',
  UNIQUE KEY day_unique (day)
);

-- When the person reports having woken up, in the morning check-in. The phone's
-- own wake marker is only the alarm; this is preferred when it is given.
ALTER TABLE checkins ADD COLUMN wake_ts DATETIME(3) NULL AFTER sleep_onset_difficulty;
