export type Source =
  | "strava"
  | "apple_health"
  | "garmin"
  | "google_fit"
  | "fitbit"
  | "health_connect"
  | "file";

export type NormalizedSport =
  | "run"
  | "strength"
  | "hiit"
  | "row"
  | "skierg"
  | "hyrox"
  | "bike"
  | "swim"
  | "walk"
  | "hike"
  | "other";

export interface NormalizedActivity {
  source: Source;
  /** Stable id within the source. The database id is `${source}:${externalId}`. */
  externalId: string;
  name?: string;
  sport: NormalizedSport;
  /** Original label from the source */
  sportType?: string;
  /** ISO 8601 UTC */
  startDate: string;
  elapsedTime?: number; // seconds
  movingTime?: number; // seconds
  distance?: number; // meters
  elevationGain?: number; // meters
  averageSpeed?: number; // m/s
  maxSpeed?: number; // m/s
  averageHeartrate?: number;
  maxHeartrate?: number;
  averageWatts?: number;
  averageCadence?: number;
  calories?: number; // kcal
  sufferScore?: number;
  isRace?: boolean;
  isIndoor?: boolean;
  description?: string;
}

export type MetricName = "resting_hr" | "hrv_sdnn" | "vo2max" | "weight_kg";

export interface HealthMetric {
  date: string; // YYYY-MM-DD
  metric: MetricName;
  value: number;
  source: Source;
}

export interface ParseResult {
  activities: NormalizedActivity[];
  metrics: HealthMetric[];
  warnings: string[];
}

export function emptyResult(): ParseResult {
  return { activities: [], metrics: [], warnings: [] };
}

export function mergeResults(into: ParseResult, from: ParseResult): void {
  // Loops rather than push(...from.x): spreading a few hundred thousand items overflows the stack
  for (const a of from.activities) into.activities.push(a);
  for (const m of from.metrics) into.metrics.push(m);
  for (const w of from.warnings) into.warnings.push(w);
}

export function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : undefined;
}
