/**
 * Apple Health importer.
 *
 * Reads the export.xml produced by the Health app (profile picture > Export All Health Data).
 * The file is routinely several gigabytes, so it is read line by line as a stream and never
 * loaded whole. Apple writes one element per line, with <Workout> spanning several lines for
 * its statistics and metadata children.
 */
import { createInterface } from "readline";
import type { Readable } from "stream";
import { normalizeSport } from "./sport.js";
import {
  emptyResult,
  num,
  type MetricName,
  type NormalizedActivity,
  type ParseResult,
} from "./types.js";

const METRIC_TYPES: Record<string, MetricName> = {
  HKQuantityTypeIdentifierRestingHeartRate: "resting_hr",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv_sdnn",
  HKQuantityTypeIdentifierVO2Max: "vo2max",
  HKQuantityTypeIdentifierBodyMass: "weight_kg",
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) {
    out[m[1]] = m[2].replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTITIES[e] ?? e);
  }
  return out;
}

/** "2024-05-01 07:02:11 +0200" -> Date */
export function parseAppleDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const m = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  const d = new Date(m ? `${m[1]}T${m[2]}${m[3]}:${m[4]}` : value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toSeconds(value: number | undefined, unit: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (unit === "hr") return value * 3600;
  if (unit === "s") return value;
  return value * 60; // "min" is what Apple writes
}

function toMeters(value: number | undefined, unit: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  switch (unit) {
    case "km":
      return value * 1000;
    case "mi":
      return value * 1609.344;
    case "yd":
      return value * 0.9144;
    case "ft":
      return value * 0.3048;
    case "cm":
      return value / 100;
    default:
      return value;
  }
}

function toKcal(value: number | undefined, unit: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  return unit === "kJ" ? value / 4.184 : value;
}

function toKg(value: number, unit: string | undefined): number {
  if (unit === "lb") return value * 0.45359237;
  if (unit === "g") return value / 1000;
  if (unit === "st") return value * 6.35029318;
  return value;
}

interface OpenWorkout {
  a: Record<string, string>;
  distance?: number;
  calories?: number;
  avgHr?: number;
  maxHr?: number;
  avgWatts?: number;
  elevation?: number;
  indoor?: boolean;
}

function finishWorkout(w: OpenWorkout): NormalizedActivity | undefined {
  const start = parseAppleDate(w.a.startDate);
  if (!start) return undefined;
  const end = parseAppleDate(w.a.endDate);

  const elapsed = end ? Math.round((end.getTime() - start.getTime()) / 1000) : undefined;
  const active = toSeconds(num(w.a.duration), w.a.durationUnit);
  const moving = active !== undefined ? Math.round(active) : elapsed;

  // Exports before iOS 16 carry totals as attributes instead of <WorkoutStatistics> children
  const distance = w.distance ?? toMeters(num(w.a.totalDistance), w.a.totalDistanceUnit);
  const calories = w.calories ?? toKcal(num(w.a.totalEnergyBurned), w.a.totalEnergyBurnedUnit);

  const type = w.a.workoutActivityType ?? "";
  const label = type.replace(/^HKWorkoutActivityType/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
  const device = w.a.sourceName;

  return {
    source: "apple_health",
    externalId: `${start.toISOString()}-${type.replace(/^HKWorkoutActivityType/, "")}`,
    name: device ? `${label} (${device})` : label,
    sport: normalizeSport(type),
    sportType: type,
    startDate: start.toISOString(),
    elapsedTime: elapsed ?? moving,
    movingTime: moving,
    distance: distance && distance > 0 ? Math.round(distance) : undefined,
    elevationGain: w.elevation,
    averageSpeed: distance && moving ? distance / moving : undefined,
    averageHeartrate: w.avgHr,
    maxHeartrate: w.maxHr,
    averageWatts: w.avgWatts,
    calories: calories !== undefined ? Math.round(calories) : undefined,
    isIndoor: w.indoor,
  };
}

export async function parseAppleHealthExport(input: Readable): Promise<ParseResult> {
  const result = emptyResult();
  const daily = new Map<string, { metric: MetricName; date: string; sum: number; n: number }>();
  let open: OpenWorkout | undefined;

  const closeWorkout = () => {
    if (!open) return;
    const activity = finishWorkout(open);
    if (activity) result.activities.push(activity);
    open = undefined;
  };

  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (open) {
      if (line.includes("<WorkoutStatistics")) {
        const a = attrs(line);
        const type = a.type ?? "";
        if (type.includes("HeartRate")) {
          open.avgHr = num(a.average) ?? open.avgHr;
          open.maxHr = num(a.maximum) ?? open.maxHr;
        } else if (type.includes("Distance")) {
          open.distance = toMeters(num(a.sum), a.unit) ?? open.distance;
        } else if (type.includes("ActiveEnergyBurned")) {
          open.calories = toKcal(num(a.sum), a.unit) ?? open.calories;
        } else if (type.includes("Power")) {
          open.avgWatts = num(a.average) ?? open.avgWatts;
        }
      } else if (line.includes("<MetadataEntry")) {
        const a = attrs(line);
        if (a.key === "HKIndoorWorkout") open.indoor = a.value === "1";
        else if (a.key === "HKElevationAscended") {
          const m = a.value?.match(/^([\d.]+)\s*(\w+)?/);
          if (m) open.elevation = toMeters(num(m[1]), m[2]);
        }
      }
      if (line.includes("</Workout>")) closeWorkout();
      continue;
    }

    if (line.includes("<Workout ")) {
      open = { a: attrs(line) };
      if (/\/>\s*$/.test(line)) closeWorkout();
      continue;
    }

    // Cheap pre-filter: the vast majority of lines are heart-rate and step records we skip
    if (!line.includes("<Record ")) continue;
    const typeMatch = line.match(/type="(HKQuantityTypeIdentifier\w+)"/);
    const metric = typeMatch && METRIC_TYPES[typeMatch[1]];
    if (!metric) continue;

    const a = attrs(line);
    let value = num(a.value);
    const date = (a.startDate ?? "").slice(0, 10);
    if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (metric === "weight_kg") value = toKg(value, a.unit);

    const key = `${date}|${metric}`;
    const entry = daily.get(key);
    if (entry) {
      entry.sum += value;
      entry.n++;
    } else {
      daily.set(key, { metric, date, sum: value, n: 1 });
    }
  }
  closeWorkout();

  for (const d of daily.values()) {
    result.metrics.push({
      date: d.date,
      metric: d.metric,
      value: Math.round((d.sum / d.n) * 10) / 10,
      source: "apple_health",
    });
  }
  return result;
}
