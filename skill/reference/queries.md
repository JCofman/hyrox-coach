# SQL Queries for Athlete Assessment

```bash
npx hyrox-coach query "YOUR_QUERY" --json
```

`activities.sport` is normalized across all sources:
`run`, `strength`, `hiit`, `row`, `skierg`, `hyrox`, `bike`, `swim`, `walk`, `hike`, `other`.
`activities.source` is `apple_health`, `garmin`, `google_fit`, `fitbit`, `health_connect`,
`strava` or `file`. Durations are seconds, distances meters. Use day-based date modifiers
(`'-56 days'`); SQLite has no `weeks` modifier.

Start with `npx hyrox-coach status --json` for an overview.

## Current form (last 8 weeks)

```sql
-- Weekly volume by sport
SELECT strftime('%Y-W%W', start_date) AS week, sport,
  COUNT(*) AS sessions,
  ROUND(SUM(COALESCE(moving_time, elapsed_time)) / 3600.0, 1) AS hours,
  ROUND(SUM(distance) / 1000.0, 1) AS km
FROM activities
WHERE start_date >= date('now', '-56 days')
GROUP BY week, sport ORDER BY week DESC, hours DESC;

-- Weekly totals: sessions, hours, run km (consistency check)
SELECT strftime('%Y-W%W', start_date) AS week,
  COUNT(*) AS sessions,
  ROUND(SUM(COALESCE(moving_time, elapsed_time)) / 3600.0, 1) AS hours,
  ROUND(SUM(CASE WHEN sport = 'run' THEN distance ELSE 0 END) / 1000.0, 1) AS run_km,
  SUM(CASE WHEN sport IN ('strength', 'hiit', 'hyrox') THEN 1 ELSE 0 END) AS gym_sessions
FROM activities
WHERE start_date >= date('now', '-84 days') AND sport NOT IN ('walk', 'other')
GROUP BY week ORDER BY week DESC;
```

## Running fitness (the biggest predictor of Hyrox time)

```sql
-- Recent runs with pace and HR
SELECT date(start_date) AS date, name,
  ROUND(distance / 1000.0, 1) AS km,
  moving_time / 60 AS minutes,
  ROUND(moving_time / (distance / 1000.0) / 60, 2) AS min_per_km,
  ROUND(average_heartrate) AS avg_hr, ROUND(max_heartrate) AS max_hr, is_indoor
FROM activities
WHERE sport = 'run' AND distance > 1000 AND start_date >= date('now', '-84 days')
ORDER BY start_date DESC LIMIT 40;

-- Best efforts by distance band (threshold-pace estimate)
SELECT CASE
    WHEN distance BETWEEN 4500 AND 5500 THEN '5k'
    WHEN distance BETWEEN 9500 AND 10500 THEN '10k'
    WHEN distance BETWEEN 20500 AND 21700 THEN 'half'
  END AS band,
  date(start_date) AS date,
  ROUND(MIN(moving_time / (distance / 1000.0)) / 60, 2) AS best_min_per_km,
  ROUND(average_heartrate) AS avg_hr
FROM activities
WHERE sport = 'run' AND start_date >= date('now', '-365 days')
  AND (distance BETWEEN 4500 AND 5500 OR distance BETWEEN 9500 AND 10500 OR distance BETWEEN 20500 AND 21700)
GROUP BY band;

-- Longest runs
SELECT date(start_date) AS date, ROUND(distance / 1000.0, 1) AS km, moving_time / 60 AS minutes
FROM activities WHERE sport = 'run' AND start_date >= date('now', '-84 days')
ORDER BY distance DESC LIMIT 5;

-- Easy-run aerobic efficiency trend (pace at a given HR; falling min/km at same HR = fitter)
SELECT strftime('%Y-%m', start_date) AS month, COUNT(*) AS runs,
  ROUND(AVG(moving_time / (distance / 1000.0)) / 60, 2) AS avg_min_per_km,
  ROUND(AVG(average_heartrate)) AS avg_hr
FROM activities
WHERE sport = 'run' AND distance > 4000 AND average_heartrate IS NOT NULL
  AND start_date >= date('now', '-365 days')
GROUP BY month ORDER BY month;
```

## Strength, functional and Hyrox-specific work

```sql
-- Gym / functional sessions per week and typical length
SELECT sport, COUNT(*) AS sessions,
  ROUND(COUNT(*) / 12.0, 1) AS per_week,
  ROUND(AVG(COALESCE(moving_time, elapsed_time)) / 60.0) AS avg_minutes,
  ROUND(AVG(average_heartrate)) AS avg_hr
FROM activities
WHERE sport IN ('strength', 'hiit', 'hyrox', 'row', 'skierg')
  AND start_date >= date('now', '-84 days')
GROUP BY sport;

-- Hyrox sessions, simulations and past races (by title)
SELECT date(start_date) AS date, name, sport, source,
  COALESCE(elapsed_time, moving_time) / 60 AS minutes,
  ROUND(distance / 1000.0, 1) AS km, ROUND(average_heartrate) AS avg_hr, ROUND(max_heartrate) AS max_hr
FROM activities
WHERE sport = 'hyrox' OR name LIKE '%hyrox%' OR name LIKE '%roxzone%' OR name LIKE '%PFT%'
ORDER BY start_date DESC LIMIT 30;

-- Erg sessions (row / SkiErg) with split per 500 m
SELECT date(start_date) AS date, sport, name, distance AS meters, moving_time / 60 AS minutes,
  ROUND(moving_time / (distance / 500.0)) AS sec_per_500m, ROUND(average_heartrate) AS avg_hr
FROM activities
WHERE sport IN ('row', 'skierg') AND distance > 400
ORDER BY start_date DESC LIMIT 20;
```

## Foundation (1-2 years)

```sql
-- Peak training weeks
SELECT strftime('%Y-W%W', start_date) AS week,
  ROUND(SUM(COALESCE(moving_time, elapsed_time)) / 3600.0, 1) AS hours, COUNT(*) AS sessions,
  ROUND(SUM(CASE WHEN sport = 'run' THEN distance ELSE 0 END) / 1000.0, 1) AS run_km
FROM activities WHERE sport NOT IN ('walk', 'other')
GROUP BY week ORDER BY hours DESC LIMIT 10;

-- Monthly volume history (spot breaks, injuries, off-seasons)
SELECT strftime('%Y-%m', start_date) AS month, COUNT(*) AS sessions,
  ROUND(SUM(COALESCE(moving_time, elapsed_time)) / 3600.0, 1) AS hours,
  ROUND(SUM(CASE WHEN sport = 'run' THEN distance ELSE 0 END) / 1000.0) AS run_km
FROM activities WHERE sport NOT IN ('walk', 'other')
GROUP BY month ORDER BY month DESC LIMIT 24;

-- Races flagged by the source, and long/hard efforts
SELECT date(start_date) AS date, name, sport, ROUND(distance / 1000.0, 1) AS km,
  COALESCE(elapsed_time, moving_time) / 60 AS minutes
FROM activities WHERE is_race = 1 ORDER BY start_date DESC;
```

## Heart rate and recovery markers

```sql
-- Max HR actually observed (use the 2nd-3rd highest to discard sensor spikes)
SELECT date(start_date) AS date, sport, name, max_heartrate
FROM activities WHERE max_heartrate IS NOT NULL
ORDER BY max_heartrate DESC LIMIT 5;

-- Resting HR, HRV, VO2max, weight (Apple Health imports): last 8 weeks vs previous 8
SELECT metric,
  ROUND(AVG(CASE WHEN date >= date('now', '-56 days') THEN value END), 1) AS last_8_weeks,
  ROUND(AVG(CASE WHEN date < date('now', '-56 days') AND date >= date('now', '-112 days') THEN value END), 1) AS prior_8_weeks,
  MAX(date) AS latest
FROM health_metrics GROUP BY metric;
```

## Schedule patterns

```sql
-- Which weekdays the athlete actually trains (0 = Sunday)
SELECT strftime('%w', start_date) AS weekday, sport, COUNT(*) AS sessions,
  ROUND(AVG(COALESCE(moving_time, elapsed_time)) / 60.0) AS avg_minutes
FROM activities
WHERE start_date >= date('now', '-84 days') AND sport NOT IN ('walk', 'other')
GROUP BY weekday, sport ORDER BY weekday, sessions DESC;

-- Data coverage by source
SELECT source, COUNT(*) AS activities, date(MIN(start_date)) AS first, date(MAX(start_date)) AS last,
  SUM(average_heartrate IS NOT NULL) AS with_hr
FROM activities GROUP BY source;
```
