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
