/**
 * Importer for the Hyrox Coach iPhone shortcut (see docs/iphone-shortcut.md).
 *
 * The shortcut reads Apple Health on the phone and writes a small text file to iCloud Drive.
 * Because it is assembled by hand in the Shortcuts app, and Shortcuts prints dates, numbers and
 * durations in the phone's language, this parser is deliberately forgiving about formats.
 *
 * Text form, one record per line:
 *
 *   hyrox-coach export v1
 *   workout; start=2026-11-10T07:02:11+01:00; type=Running; duration=1:02:33; distance=10.4 km; kcal=742; hr=151
 *   metric; type=Resting Heart Rate; date=2026-11-10T00:00:00+01:00; value=48
 *
 * JSON form: { "hyrox-coach": 1, "workouts": [{ start, type, ... }], "metrics": [{ type, date, value }] }
 */
import type { HealthMetric, MetricName, NormalizedActivity, ParseResult } from "./types.js";
import { emptyResult } from "./types.js";
import { normalizeSport } from "./sport.js";

type Fields = Record<string, string>;

export function isShortcutExport(head: string): boolean {
  return /hyrox-coach/i.test(head.slice(0, 400));
}

/** "10,4" / "1.234,5" / "1,234.5" / "742 kcal" -> number (first number in the string) */
export function parseLooseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = value.match(/-?\d[\d.,  ' ]*/);
  if (!m) return undefined;
  let s = m[0].replace(/[  ' ]/g, "").replace(/[.,]+$/, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: the later one is the decimal separator
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // Lone comma: grouping only if it looks like 1,234 or 12,345,678
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

/** ISO 8601, Apple's "2026-11-10 07:02:11 +0100", or day-first "10.11.2026, 07:02" (local time) */
export function parseLooseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const v = value.trim();
  const apple = v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?) ?([+-]\d{2}):?(\d{2})$/);
  if (apple) {
    const time = apple[2].length === 5 ? `${apple[2]}:00` : apple[2];
    const d = new Date(`${apple[1]}T${time}${apple[3]}:${apple[4]}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const dayFirst = v.match(
    /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:[,\s]+(?:um\s+|at\s+)?(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?/
  );
  if (dayFirst && v.includes(".")) {
    const year = dayFirst[3].length === 2 ? 2000 + +dayFirst[3] : +dayFirst[3];
    const d = new Date(
      year,
      +dayFirst[2] - 1,
      +dayFirst[1],
      +(dayFirst[4] ?? 0),
      +(dayFirst[5] ?? 0),
      +(dayFirst[6] ?? 0)
    );
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** "1:02:33", "62:33", "62 min", "1.5 h", "1 hr 2 min", "3753" (seconds) -> seconds */
export function parseLooseDuration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  const clock = v.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (clock) {
    return clock[3] !== undefined
      ? +clock[1] * 3600 + +clock[2] * 60 + +clock[3]
      : +clock[1] * 60 + +clock[2];
  }
  let total = 0;
  let matched = false;
  const re =
    /(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|std\.?|stunden?|minutes?|mins?|min\.?|m|seconds?|secs?|sek\.?|s)\b/g;
  for (const m of v.matchAll(re)) {
    const n = parseFloat(m[1].replace(",", "."));
    const unit = m[2];
    if (/^(h|std|stunde)/.test(unit)) total += n * 3600;
    else if (/^m/.test(unit)) total += n * 60;
    else total += n;
    matched = true;
  }
  if (matched) return Math.round(total);
  const n = parseLooseNumber(v);
  return n === undefined ? undefined : Math.round(n);
}

/** "10.4 km", "6.2 mi", "5000 m", "10,4" (bare: km below 200, otherwise metres) -> metres */
export function parseLooseDistance(value: string | undefined): number | undefined {
  const n = parseLooseNumber(value);
  if (n === undefined || !value) return undefined;
  const unit = value.toLowerCase().replace(/[\d.,\s  '-]/g, "");
  if (/^(km|kilomet)/.test(unit)) return n * 1000;
  if (/^(mi|meile)/.test(unit)) return n * 1609.344;
  if (/^(yd|yard)/.test(unit)) return n * 0.9144;
  if (/^(ft|feet|foot|fu)/.test(unit)) return n * 0.3048;
  if (/^m/.test(unit)) return n;
  return n < 200 ? n * 1000 : n;
}

function parseEnergy(value: string | undefined): number | undefined {
  const n = parseLooseNumber(value);
  if (n === undefined || !value) return undefined;
  return /kj/i.test(value) ? n / 4.184 : n;
}

function metricFor(type: string): MetricName | undefined {
  const t = type.toLowerCase();
  if (/variab|hrv|sdnn/.test(t)) return "hrv_sdnn";
  if (/resting|ruhe/.test(t)) return "resting_hr";
  if (/vo.?2|cardio.?fitness|kardiofitness/.test(t)) return "vo2max";
  if (/weight|body.?mass|gewicht|k(ö|oe)rpermasse/.test(t)) return "weight_kg";
  return undefined;
}

function localDay(d: Date, original: string): string {
  // Keep the calendar day the phone wrote, rather than shifting it to UTC
  const iso = original.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function pick(f: Fields, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = f[k];
    if (v !== undefined && v.trim() !== "") return v.trim();
  }
  return undefined;
}

function toWorkout(f: Fields, warnings: string[]): NormalizedActivity | undefined {
  const startRaw = pick(f, "start", "startdate", "start_date", "date");
  const start = parseLooseDate(startRaw);
  if (!start) {
    warnings.push(`Shortcut export: workout without a readable start date (${startRaw ?? "none"})`);
    return undefined;
  }
  const end = parseLooseDate(pick(f, "end", "enddate", "end_date"));
  let duration = parseLooseDuration(pick(f, "duration", "time"));
  if (duration === undefined && end)
    duration = Math.round((end.getTime() - start.getTime()) / 1000);
  if (duration !== undefined && duration <= 0) duration = undefined;

  const type = pick(f, "type", "activity", "workout", "sport");
  const name = pick(f, "name", "title");
  const distance = parseLooseDistance(pick(f, "distance", "dist"));
  const hr = parseLooseNumber(pick(f, "hr", "avghr", "heartrate", "avg_hr"));
  const maxHr = parseLooseNumber(pick(f, "maxhr", "max_hr"));

  return {
    source: "apple_health",
    externalId: `shortcut-${start.toISOString()}`,
    name: name ?? type,
    sport: normalizeSport(type, name),
    sportType: type,
    startDate: start.toISOString(),
    elapsedTime: duration,
    movingTime: duration,
    distance,
    averageSpeed: distance && duration ? distance / duration : undefined,
    averageHeartrate: hr && hr > 25 && hr < 250 ? hr : undefined,
    maxHeartrate: maxHr && maxHr > 25 && maxHr < 250 ? maxHr : undefined,
    calories: parseEnergy(pick(f, "kcal", "calories", "energy")),
    isIndoor: /indoor|treadmill|laufband/i.test(`${type ?? ""} ${name ?? ""}`) ? true : undefined,
  };
}

interface MetricSample {
  metric: MetricName;
  date: string;
  value: number;
}

function toMetric(f: Fields, warnings: string[]): MetricSample | undefined {
  const type = pick(f, "type", "metric", "name");
  const metric = type ? metricFor(type) : undefined;
  if (!metric) return undefined; // other health types are ignored on purpose
  const dateRaw = pick(f, "date", "start", "startdate", "start_date");
  const date = parseLooseDate(dateRaw);
  const raw = pick(f, "value");
  let value = parseLooseNumber(raw);
  if (!date || !dateRaw || value === undefined) {
    warnings.push(`Shortcut export: unreadable ${type} sample (${dateRaw ?? "no date"})`);
    return undefined;
  }
  const unit = `${pick(f, "unit") ?? ""} ${raw ?? ""}`.toLowerCase();
  if (metric === "weight_kg") {
    if (/\blbs?\b|pound/.test(unit)) value *= 0.45359237;
    else if (/\bst\b|stone/.test(unit)) value *= 6.35029318;
  }
  return { metric, date: localDay(date, dateRaw), value };
}

function fieldsFromLine(line: string): { kind: string; fields: Fields } {
  const parts = line.split(";");
  const fields: Fields = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    fields[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  return { kind: parts[0].trim().toLowerCase(), fields };
}

function fieldsFromObject(obj: unknown): Fields {
  const fields: Fields = {};
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v !== null && v !== undefined && typeof v !== "object")
        fields[k.toLowerCase()] = String(v);
    }
  }
  return fields;
}

export function parseShortcutExport(text: string): ParseResult {
  const result = emptyResult();
  const workouts: Fields[] = [];
  const metrics: Fields[] = [];

  const trimmed = text.replace(/^﻿/, "").trim();
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>;
      for (const w of (json.workouts as unknown[]) ?? []) workouts.push(fieldsFromObject(w));
      for (const m of (json.metrics as unknown[]) ?? []) metrics.push(fieldsFromObject(m));
    } catch (err) {
      result.warnings.push(`Shortcut export is not valid JSON: ${(err as Error).message}`);
      return result;
    }
  } else {
    for (const line of trimmed.split(/\r?\n/)) {
      if (!line.includes(";")) continue;
      const { kind, fields } = fieldsFromLine(line);
      if (kind.startsWith("workout")) workouts.push(fields);
      else if (kind.startsWith("metric")) metrics.push(fields);
    }
  }

  const seen = new Set<string>();
  for (const f of workouts) {
    const activity = toWorkout(f, result.warnings);
    if (!activity || seen.has(activity.externalId)) continue;
    seen.add(activity.externalId);
    result.activities.push(activity);
  }

  // Several samples a day (HRV, weight) are averaged into one daily value
  const daily = new Map<string, { metric: MetricName; date: string; sum: number; n: number }>();
  for (const f of metrics) {
    const sample = toMetric(f, result.warnings);
    if (!sample) continue;
    const key = `${sample.metric}|${sample.date}`;
    const entry = daily.get(key);
    if (entry) {
      entry.sum += sample.value;
      entry.n++;
    } else {
      daily.set(key, { metric: sample.metric, date: sample.date, sum: sample.value, n: 1 });
    }
  }
  for (const d of daily.values()) {
    const metric: HealthMetric = {
      date: d.date,
      metric: d.metric,
      value: Math.round((d.sum / d.n) * 10) / 10,
      source: "apple_health",
    };
    result.metrics.push(metric);
  }

  return result;
}
