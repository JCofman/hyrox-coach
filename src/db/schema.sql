-- Activities from every source (Strava, Apple Health, Garmin, Google, files)
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,              -- "<source>:<external id>"
  source TEXT NOT NULL,             -- strava, apple_health, garmin, google_fit, fitbit, health_connect, file
  name TEXT,
  sport TEXT NOT NULL,              -- normalized: run, strength, hiit, row, skierg, hyrox, bike, swim, walk, hike, other
  sport_type TEXT,                  -- original label from the source
  start_date TEXT,                  -- ISO 8601 UTC
  elapsed_time INTEGER,             -- seconds
  moving_time INTEGER,              -- seconds
  distance REAL,                    -- meters
  total_elevation_gain REAL,        -- meters
  average_speed REAL,               -- m/s
  max_speed REAL,                   -- m/s
  average_heartrate REAL,
  max_heartrate REAL,
  average_watts REAL,
  average_cadence REAL,
  calories REAL,                    -- kcal
  suffer_score INTEGER,             -- Strava relative effort (Strava only)
  is_race INTEGER DEFAULT 0,
  is_indoor INTEGER,
  description TEXT,
  raw_json TEXT,
  synced_at TEXT DEFAULT (datetime('now'))
);

-- Daily health metrics (resting HR, HRV, VO2max, weight) when the source provides them
CREATE TABLE IF NOT EXISTS health_metrics (
  date TEXT NOT NULL,               -- YYYY-MM-DD
  metric TEXT NOT NULL,             -- resting_hr, hrv_sdnn, vo2max, weight_kg
  value REAL NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (date, metric, source)
);

-- Athlete profile
CREATE TABLE IF NOT EXISTS athlete (
  id INTEGER PRIMARY KEY,
  firstname TEXT,
  lastname TEXT,
  weight REAL,                      -- kg
  ftp INTEGER,
  max_heartrate INTEGER,
  raw_json TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Training goals
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT,                  -- "HYROX Hamburg"
  event_date TEXT,                  -- ISO 8601
  event_type TEXT,                  -- division: open_men, pro_women, doubles_mixed, ...
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Import / sync log
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  started_at TEXT,
  completed_at TEXT,
  activities_synced INTEGER,
  status TEXT
);

CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(start_date);
CREATE INDEX IF NOT EXISTS idx_activities_sport_date ON activities(sport, start_date);
CREATE INDEX IF NOT EXISTS idx_activities_source ON activities(source);

DROP VIEW IF EXISTS weekly_volume;
CREATE VIEW weekly_volume AS
SELECT
  strftime('%Y-W%W', start_date) AS week,
  sport,
  COUNT(*) AS sessions,
  ROUND(SUM(COALESCE(moving_time, elapsed_time)) / 3600.0, 1) AS hours,
  ROUND(SUM(distance) / 1000.0, 1) AS km,
  ROUND(AVG(average_heartrate), 0) AS avg_hr
FROM activities
GROUP BY week, sport
ORDER BY week DESC, sport;

DROP VIEW IF EXISTS recent_activities;
CREATE VIEW recent_activities AS
SELECT
  date(start_date) AS date,
  source,
  sport,
  name,
  COALESCE(moving_time, elapsed_time) / 60 AS minutes,
  ROUND(distance / 1000.0, 1) AS km,
  ROUND(average_heartrate, 0) AS hr
FROM activities
ORDER BY start_date DESC
LIMIT 50;
