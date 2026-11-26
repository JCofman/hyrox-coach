import { execute, queryJson } from "./client.js";
import type { HealthMetric, NormalizedActivity } from "../import/types.js";

export interface StoreResult {
  inserted: number;
  updated: number;
  duplicates: number;
}

function sqlText(value: string | null | undefined): string {
  if (value == null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNum(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "NULL" : String(value);
}

function sqlBool(value: boolean | undefined): string {
  return value == null ? "NULL" : value ? "1" : "0";
}

interface Known {
  id: string;
  start: number; // epoch seconds
  duration: number; // seconds
}

/**
 * The same session often arrives from several sources: a Garmin run is also in Strava and in
 * Apple Health. Two activities are treated as one when they start within 3 minutes of each other
 * and their durations differ by less than 15% (or 2 minutes).
 */
export function isSameSession(a: Known, b: Known): boolean {
  if (Math.abs(a.start - b.start) > 180) return false;
  if (!a.duration || !b.duration) return true;
  const tolerance = Math.max(120, 0.15 * Math.max(a.duration, b.duration));
  return Math.abs(a.duration - b.duration) <= tolerance;
}

function activityInsertSql(a: NormalizedActivity, id: string): string {
  return `INSERT OR REPLACE INTO activities (
    id, source, name, sport, sport_type, start_date, elapsed_time, moving_time, distance,
    total_elevation_gain, average_speed, max_speed, average_heartrate, max_heartrate,
    average_watts, average_cadence, calories, suffer_score, is_race, is_indoor, description,
    synced_at
  ) VALUES (
    ${sqlText(id)}, ${sqlText(a.source)}, ${sqlText(a.name)}, ${sqlText(a.sport)},
    ${sqlText(a.sportType)}, ${sqlText(a.startDate)}, ${sqlNum(a.elapsedTime)},
    ${sqlNum(a.movingTime)}, ${sqlNum(a.distance)}, ${sqlNum(a.elevationGain)},
    ${sqlNum(a.averageSpeed)}, ${sqlNum(a.maxSpeed)}, ${sqlNum(a.averageHeartrate)},
    ${sqlNum(a.maxHeartrate)}, ${sqlNum(a.averageWatts)}, ${sqlNum(a.averageCadence)},
    ${sqlNum(a.calories)}, ${sqlNum(a.sufferScore)}, ${a.isRace ? 1 : 0}, ${sqlBool(a.isIndoor)},
    ${sqlText(a.description)}, datetime('now')
  );`;
}

function runBatched(statements: string[], size = 200): void {
  for (let i = 0; i < statements.length; i += size) {
    execute(`BEGIN;\n${statements.slice(i, i + size).join("\n")}\nCOMMIT;`);
  }
}

export function storeActivities(activities: NormalizedActivity[]): StoreResult {
  const existing = queryJson<{ id: string; start_date: string; elapsed_time: number | null }>(
    "SELECT id, start_date, elapsed_time FROM activities"
  );

  // Bucket known sessions by 10-minute window so the duplicate check stays fast
  const buckets = new Map<number, Known[]>();
  const ids = new Set<string>();
  const remember = (k: Known) => {
    ids.add(k.id);
    const key = Math.floor(k.start / 600);
    const list = buckets.get(key);
    if (list) list.push(k);
    else buckets.set(key, [k]);
  };
  for (const row of existing) {
    remember({
      id: row.id,
      start: Date.parse(row.start_date) / 1000,
      duration: row.elapsed_time ?? 0,
    });
  }

  const result: StoreResult = { inserted: 0, updated: 0, duplicates: 0 };
  const statements: string[] = [];

  for (const a of activities) {
    const start = Date.parse(a.startDate) / 1000;
    if (!Number.isFinite(start)) continue;
    const id = `${a.source}:${a.externalId}`;
    const me: Known = { id, start, duration: a.elapsedTime ?? a.movingTime ?? 0 };

    if (ids.has(id)) {
      result.updated++;
    } else {
      const key = Math.floor(start / 600);
      const nearby = [key - 1, key, key + 1].flatMap((k) => buckets.get(k) ?? []);
      if (nearby.some((other) => isSameSession(me, other))) {
        result.duplicates++;
        continue;
      }
      result.inserted++;
      remember(me);
    }
    statements.push(activityInsertSql(a, id));
  }

  runBatched(statements);
  return result;
}

export function storeMetrics(metrics: HealthMetric[]): number {
  const statements = metrics.map(
    (m) =>
      `INSERT OR REPLACE INTO health_metrics (date, metric, value, source) VALUES (${sqlText(m.date)}, ${sqlText(m.metric)}, ${sqlNum(m.value)}, ${sqlText(m.source)});`
  );
  runBatched(statements, 500);
  return statements.length;
}

export function logSync(source: string, count: number, status = "success"): void {
  execute(
    `INSERT INTO sync_log (source, started_at, completed_at, activities_synced, status)
     VALUES (${sqlText(source)}, datetime('now'), datetime('now'), ${count}, ${sqlText(status)});`
  );
}
