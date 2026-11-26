/**
 * Garmin importers.
 *
 * Garmin has no self-service API for individuals, so data comes from files:
 *  1. "Export Your Data" archive (garmin.com/account/datamanagement): contains
 *     DI_CONNECT/DI-Connect-Fitness/*_summarizedActivities.json with every activity.
 *  2. Activities.csv from the Garmin Connect web activity list ("Export CSV").
 *  3. Individual .fit / .tcx / .gpx files (handled in files.ts).
 */
import { normalizeSport } from "./sport.js";
import { emptyResult, num, type NormalizedActivity, type ParseResult } from "./types.js";

// ---------------------------------------------------------------------------
// summarizedActivities.json (account data export)
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

/**
 * The export uses Garmin's internal units: durations in milliseconds, distances and elevation
 * in centimeters, speeds in decameters per second. Calories are stored in kilojoules.
 */
export function parseGarminSummarizedActivities(json: string): ParseResult {
  const result = emptyResult();
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    result.warnings.push("Garmin summarizedActivities file is not valid JSON");
    return result;
  }

  const list: Json[] = [];
  for (const entry of Array.isArray(data) ? data : [data]) {
    const inner = (entry as Json)?.summarizedActivitiesExport;
    if (Array.isArray(inner)) list.push(...(inner as Json[]));
    else if ((entry as Json)?.activityId) list.push(entry as Json);
  }

  for (const a of list) {
    const startMs = num(a.startTimeGmt) ?? num(a.beginTimestamp);
    if (startMs === undefined) continue;
    const type = String(a.activityType ?? a.sportType ?? "");
    const name = a.name ? String(a.name) : undefined;
    const elapsedMs = num(a.elapsedDuration) ?? num(a.duration);
    const movingMs = num(a.movingDuration) ?? num(a.duration);
    const distanceCm = num(a.distance);
    const distance = distanceCm !== undefined ? distanceCm / 100 : undefined;
    const moving = movingMs !== undefined ? Math.round(movingMs / 1000) : undefined;
    const elevationCm = num(a.elevationGain);
    const kj = num(a.calories);

    const activity: NormalizedActivity = {
      source: "garmin",
      externalId: String(a.activityId ?? startMs),
      name,
      sport: normalizeSport(type, name),
      sportType: type,
      startDate: new Date(startMs).toISOString(),
      elapsedTime: elapsedMs !== undefined ? Math.round(elapsedMs / 1000) : moving,
      movingTime: moving,
      distance: distance && distance > 0 ? Math.round(distance) : undefined,
      elevationGain: elevationCm !== undefined ? Math.round(elevationCm / 100) : undefined,
      averageSpeed: distance && moving ? distance / moving : undefined,
      averageHeartrate: num(a.avgHr),
      maxHeartrate: num(a.maxHr),
      averageWatts: num(a.avgPower),
      averageCadence: num(a.avgRunCadence) ?? num(a.avgBikeCadence),
      calories: kj !== undefined ? Math.round(kj / 4.184) : undefined,
      isRace: a.eventTypeId === 1 || /race/i.test(String(a.eventType ?? "")) || undefined,
      isIndoor: /indoor|treadmill|virtual/.test(type) ? true : undefined,
    };
    result.activities.push(activity);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Activities.csv (Garmin Connect web export)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f !== "")) rows.push(row);
  }
  return rows;
}

// Garmin Connect localizes the header row. English and German are covered.
const COLUMNS: Record<string, string[]> = {
  type: ["activity type", "aktivitätstyp"],
  date: ["date", "datum"],
  title: ["title", "titel"],
  distance: ["distance", "distanz"],
  calories: ["calories", "kalorien"],
  time: ["time", "zeit"],
  movingTime: ["moving time", "zeit in bewegung"],
  elapsedTime: ["elapsed time", "verstrichene zeit"],
  avgHr: ["avg hr", "ø hf", "ø herzfrequenz"],
  maxHr: ["max hr", "max. hf", "maximale hf", "maximale herzfrequenz"],
  ascent: ["total ascent", "anstieg gesamt", "gesamtanstieg"],
  cadence: ["avg run cadence", "ø schrittfrequenz (laufen)"],
  power: ["avg power", "ø leistung"],
};

export function isGarminActivitiesCsv(headerLine: string): boolean {
  const h = headerLine.toLowerCase();
  return COLUMNS.type.some((t) => h.includes(t)) && COLUMNS.date.some((d) => h.includes(d));
}

/** "1:02:03", "45:12", "45:12.5" -> seconds */
export function parseClock(value: string | undefined): number | undefined {
  if (!value || !/\d/.test(value) || value.includes("--")) return undefined;
  const parts = value
    .trim()
    .split(":")
    .map((p) => parseFloat(p.replace(",", ".")));
  if (parts.some((p) => !Number.isFinite(p))) return undefined;
  return Math.round(parts.reduce((total, p) => total * 60 + p, 0));
}

/** "1,234.5" or "1.234,5" or "12,5" -> number */
export function parseLocaleNumber(value: string | undefined): number | undefined {
  if (!value || value.includes("--")) return undefined;
  let v = value.trim().replace(/[^\d.,-]/g, "");
  if (!v) return undefined;
  const lastComma = v.lastIndexOf(",");
  const lastDot = v.lastIndexOf(".");
  if (lastComma > lastDot) {
    // A lone comma followed by exactly three digits is thousands grouping ("2,000" m of rowing).
    // Garmin writes kilometers and miles with two decimals, so "10,02" is a decimal comma.
    const decimals = v.length - lastComma - 1;
    if (lastDot === -1 && decimals === 3) v = v.replace(/,/g, "");
    else v = v.replace(/\./g, "").replace(",", ".");
  } else {
    v = v.replace(/,/g, "");
  }
  return num(v);
}

export function parseGarminActivitiesCsv(
  text: string,
  options: { distanceUnit?: "km" | "mi" } = {}
): ParseResult {
  const result = emptyResult();
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length < 2) return result;

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (key: string) => header.findIndex((h) => COLUMNS[key].includes(h));
  const idx = Object.fromEntries(Object.keys(COLUMNS).map((k) => [k, col(k)]));
  if (idx.type < 0 || idx.date < 0) {
    result.warnings.push("CSV does not look like a Garmin Connect activity export");
    return result;
  }
  const perUnit = options.distanceUnit === "mi" ? 1609.344 : 1000;

  for (const row of rows.slice(1)) {
    const get = (key: string) => (idx[key] >= 0 ? row[idx[key]] : undefined);
    const dateText = get("date");
    if (!dateText) continue;
    // Garmin writes local time without a zone: "2024-05-01 07:02:11"
    const start = new Date(dateText.trim().replace(" ", "T"));
    if (Number.isNaN(start.getTime())) continue;

    const type = get("type") ?? "";
    const name = get("title");
    const sport = normalizeSport(type, name);
    const time = parseClock(get("time"));
    const moving = parseClock(get("movingTime")) ?? time;
    const elapsed = parseClock(get("elapsedTime")) ?? time;

    // Rowing and swimming list distance in meters; everything else in km or miles
    const rawDistance = parseLocaleNumber(get("distance"));
    let distance: number | undefined;
    if (rawDistance !== undefined && rawDistance > 0) {
      const inMeters = sport === "row" || sport === "swim" || sport === "skierg";
      distance = Math.round(inMeters ? rawDistance : rawDistance * perUnit);
    }

    result.activities.push({
      source: "garmin",
      externalId: `csv-${start.toISOString()}-${type}`,
      name,
      sport,
      sportType: type,
      startDate: start.toISOString(),
      elapsedTime: elapsed,
      movingTime: moving,
      distance,
      elevationGain: parseLocaleNumber(get("ascent")),
      averageSpeed: distance && moving ? distance / moving : undefined,
      averageHeartrate: parseLocaleNumber(get("avgHr")),
      maxHeartrate: parseLocaleNumber(get("maxHr")),
      averageWatts: parseLocaleNumber(get("power")),
      averageCadence: parseLocaleNumber(get("cadence")),
      calories: parseLocaleNumber(get("calories")),
      isIndoor: /indoor|treadmill|laufband/i.test(type) ? true : undefined,
    });
  }
  return result;
}
