/**
 * Google importers. Google's trackers export through three different routes:
 *  1. Google Fit via Google Takeout: Takeout/Fit/All Sessions/*.json (plus .tcx activities,
 *     handled in files.ts).
 *  2. Fitbit / Pixel Watch via Google Takeout: Takeout/Fitbit/Global Export Data/exercise-*.json
 *  3. Health Connect (Android): Settings > Health Connect > Manage data > Export data, which
 *     produces a zip holding a SQLite database.
 */
import { normalizeSport } from "./sport.js";
import { emptyResult, num, type NormalizedActivity, type ParseResult } from "./types.js";

type Json = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Google Fit sessions
// ---------------------------------------------------------------------------

export function isGoogleFitSession(json: unknown): boolean {
  const j = json as Json;
  return !!j && typeof j === "object" && "fitnessActivity" in j && "startTime" in j;
}

export function parseGoogleFitSession(json: unknown, fileName: string): ParseResult {
  const result = emptyResult();
  const s = json as Json;
  const start = new Date(String(s.startTime ?? ""));
  if (Number.isNaN(start.getTime())) return result;
  const end = new Date(String(s.endTime ?? ""));

  const type = String(s.fitnessActivity ?? "");
  // Sleep and other passive sessions are stored in the same folder
  if (/sleep|still|in_vehicle|unknown|meditation/.test(type)) return result;

  const durationSec = num(String(s.duration ?? "").replace(/s$/, ""));
  const elapsed = !Number.isNaN(end.getTime())
    ? Math.round((end.getTime() - start.getTime()) / 1000)
    : durationSec;

  let distance: number | undefined;
  let calories: number | undefined;
  let avgHr: number | undefined;
  let maxHr: number | undefined;
  for (const agg of (Array.isArray(s.aggregate) ? s.aggregate : []) as Json[]) {
    const metric = String(agg.metricName ?? "");
    if (metric.includes("distance")) distance = num(agg.floatValue);
    else if (metric.includes("calories")) calories = num(agg.floatValue);
    else if (metric.includes("heart_rate")) {
      // Summary metrics come either as a single average or as average/max/min
      avgHr =
        num(agg.floatValue) ?? num((agg.averageValue as Json)?.floatValue) ?? num(agg.averageValue);
      maxHr = num((agg.maxValue as Json)?.floatValue) ?? num(agg.maxValue);
    }
  }
  const moving = durationSec !== undefined ? Math.round(durationSec) : elapsed;
  const name = s.name ? String(s.name) : undefined;

  result.activities.push({
    source: "google_fit",
    externalId: `${start.toISOString()}-${type}`,
    name: name ?? type.replace(/_/g, " "),
    sport: normalizeSport(type, name),
    sportType: type,
    startDate: start.toISOString(),
    elapsedTime: elapsed,
    movingTime: moving,
    distance: distance && distance > 0 ? Math.round(distance) : undefined,
    averageSpeed: distance && moving ? distance / moving : undefined,
    averageHeartrate: avgHr !== undefined ? Math.round(avgHr) : undefined,
    maxHeartrate: maxHr,
    calories: calories !== undefined ? Math.round(calories) : undefined,
    isIndoor: /treadmill|indoor|machine/.test(type) ? true : undefined,
    description: fileName,
  });
  return result;
}

// ---------------------------------------------------------------------------
// Fitbit exercise logs
// ---------------------------------------------------------------------------

export function isFitbitExerciseLog(json: unknown): boolean {
  return (
    Array.isArray(json) &&
    json.length > 0 &&
    typeof json[0] === "object" &&
    json[0] !== null &&
    "logId" in json[0] &&
    "activityName" in json[0]
  );
}

/** Fitbit writes "05/01/23 07:00:00" (MM/DD/YY, UTC) */
function parseFitbitDate(value: string): Date {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2})$/);
  return new Date(m ? `20${m[3]}-${m[1]}-${m[2]}T${m[4]}Z` : value);
}

export function parseFitbitExerciseLog(json: unknown): ParseResult {
  const result = emptyResult();
  for (const e of json as Json[]) {
    const start = parseFitbitDate(String(e.startTime ?? ""));
    if (Number.isNaN(start.getTime())) continue;
    const type = String(e.activityName ?? "");
    const elapsedMs = num(e.duration);
    const activeMs = num(e.activeDuration) ?? elapsedMs;
    const moving = activeMs !== undefined ? Math.round(activeMs / 1000) : undefined;

    let distance = num(e.distance);
    if (distance !== undefined) {
      const unit = String(e.distanceUnit ?? "Kilometer").toLowerCase();
      distance *= unit.startsWith("mile") ? 1609.344 : unit.startsWith("meter") ? 1 : 1000;
    }

    const activity: NormalizedActivity = {
      source: "fitbit",
      externalId: String(e.logId),
      name: type,
      sport: normalizeSport(type),
      sportType: type,
      startDate: start.toISOString(),
      elapsedTime: elapsedMs !== undefined ? Math.round(elapsedMs / 1000) : moving,
      movingTime: moving,
      distance: distance && distance > 0 ? Math.round(distance) : undefined,
      elevationGain: num(e.elevationGain),
      averageSpeed: distance && moving ? distance / moving : undefined,
      averageHeartrate: num(e.averageHeartRate),
      calories: num(e.calories),
    };
    result.activities.push(activity);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Health Connect export database
// ---------------------------------------------------------------------------

// androidx.health.connect.client.records.ExerciseSessionRecord.EXERCISE_TYPE_*
const HEALTH_CONNECT_TYPES: Record<number, string> = {
  0: "other_workout",
  8: "biking",
  9: "biking_stationary",
  10: "boot_camp",
  13: "calisthenics",
  25: "elliptical",
  36: "high_intensity_interval_training",
  37: "hiking",
  48: "pilates",
  53: "rowing",
  54: "rowing_machine",
  56: "running",
  57: "running_treadmill",
  68: "stair_climbing",
  70: "strength_training",
  73: "swimming_open_water",
  74: "swimming_pool",
  79: "walking",
  81: "weightlifting",
  83: "yoga",
};

/**
 * Reads exercise sessions from a Health Connect export database. The table layout is not a
 * published contract, so columns are discovered at runtime and the import degrades to a
 * warning instead of failing when they are not found.
 */
export async function parseHealthConnectDb(dbPath: string): Promise<ParseResult> {
  const result = emptyResult();
  let sqlite: typeof import("node:sqlite");
  try {
    sqlite = await import("node:sqlite");
  } catch {
    result.warnings.push("Reading Health Connect exports needs Node.js 22.5 or newer");
    return result;
  }

  const db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => String((r as Json).name));
    const table = tables.find((t) => /exercise_session/i.test(t));
    if (!table) {
      result.warnings.push(`No exercise session table found in ${dbPath}`);
      return result;
    }
    const columns = db
      .prepare(`PRAGMA table_info("${table}")`)
      .all()
      .map((r) => String((r as Json).name));
    const pick = (...names: string[]) => names.find((n) => columns.includes(n));
    const startCol = pick("start_time", "startTime");
    const endCol = pick("end_time", "endTime");
    const typeCol = pick("exercise_type", "exerciseType");
    const titleCol = pick("title", "name");
    const idCol = pick("uuid", "row_id", "id");
    if (!startCol || !endCol) {
      result.warnings.push(`Unrecognized Health Connect layout in table ${table}`);
      return result;
    }

    for (const row of db.prepare(`SELECT * FROM "${table}"`).all() as Json[]) {
      const startMs = num(row[startCol]);
      const endMs = num(row[endCol]);
      if (startMs === undefined || endMs === undefined) continue;
      const code = typeCol ? num(row[typeCol]) : undefined;
      const type = code !== undefined ? (HEALTH_CONNECT_TYPES[code] ?? `type_${code}`) : "";
      const title = titleCol && row[titleCol] ? String(row[titleCol]) : undefined;
      const elapsed = Math.round((endMs - startMs) / 1000);
      const idValue = idCol ? row[idCol] : undefined;
      const id =
        idValue instanceof Uint8Array
          ? Buffer.from(idValue).toString("hex")
          : String(idValue ?? startMs);

      result.activities.push({
        source: "health_connect",
        externalId: id,
        name: title ?? type.replace(/_/g, " "),
        sport: normalizeSport(type, title),
        sportType: type,
        startDate: new Date(startMs).toISOString(),
        elapsedTime: elapsed,
        movingTime: elapsed,
        isIndoor: /treadmill|stationary|machine/.test(type) ? true : undefined,
      });
    }
    if (result.activities.length) {
      result.warnings.push(
        "Health Connect sessions carry time and type only; distance and heart rate are not imported from this format"
      );
    }
  } finally {
    db.close();
  }
  return result;
}
