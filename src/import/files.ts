/**
 * Single-activity file formats: FIT (Garmin, Wahoo, Coros, Polar...), TCX and GPX.
 * Every watch platform can export at least one of these, so they double as the fallback
 * for any tracker without a dedicated importer.
 */
import { createHash } from "crypto";
import { normalizeSport } from "./sport.js";
import { num, type NormalizedActivity, type Source } from "./types.js";

function hashId(...parts: (string | number | undefined)[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// FIT
// ---------------------------------------------------------------------------

export async function parseFit(
  data: Uint8Array,
  fileName: string,
  source: Source = "file"
): Promise<NormalizedActivity[]> {
  const { Decoder, Stream } = await import("@garmin/fitsdk");
  const stream = Stream.fromBuffer(data);
  if (!Decoder.isFIT(stream)) return [];
  const { messages } = new Decoder(stream).read();

  const sessions = messages.sessionMesgs ?? [];
  // Garmin stores the activity profile name ("HYROX", "Treadmill") in the sport message
  const profileName = String(messages.sportMesgs?.[0]?.name ?? "");
  const out: NormalizedActivity[] = [];
  for (const s of sessions) {
    const startRaw = s.startTime as Date | string | undefined;
    const start = startRaw ? new Date(startRaw) : undefined;
    if (!start || Number.isNaN(start.getTime())) continue;

    const sport = String(s.sport ?? "");
    const subSport = String(s.subSport ?? "");
    const label = subSport && subSport !== "generic" ? `${sport}/${subSport}` : sport;
    const name = String(s.sportProfileName ?? "") || profileName || fileName.replace(/\.fit$/i, "");
    const moving = num(s.totalTimerTime);
    const distance = num(s.totalDistance);

    out.push({
      source,
      externalId: hashId(start.toISOString(), sport, num(s.totalElapsedTime)),
      name,
      sport: normalizeSport(label, name),
      sportType: label,
      startDate: start.toISOString(),
      elapsedTime: Math.round(num(s.totalElapsedTime) ?? moving ?? 0) || undefined,
      movingTime: moving !== undefined ? Math.round(moving) : undefined,
      distance: distance && distance > 0 ? Math.round(distance) : undefined,
      elevationGain: num(s.totalAscent),
      averageSpeed: num(s.enhancedAvgSpeed) ?? num(s.avgSpeed),
      maxSpeed: num(s.enhancedMaxSpeed) ?? num(s.maxSpeed),
      averageHeartrate: num(s.avgHeartRate),
      maxHeartrate: num(s.maxHeartRate),
      averageWatts: num(s.avgPower),
      averageCadence: num(s.avgCadence),
      calories: num(s.totalCalories),
      isIndoor: /indoor|treadmill|virtual/.test(subSport) ? true : undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// TCX
// ---------------------------------------------------------------------------

function tagValues(xml: string, tag: string): number[] {
  const re = new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`, "g");
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const n = parseFloat(m[1]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function parseTcx(
  xml: string,
  fileName: string,
  source: Source = "file"
): NormalizedActivity[] {
  const out: NormalizedActivity[] = [];
  const activityRe = /<Activity\b([^>]*)>([\s\S]*?)<\/Activity>/g;
  let m: RegExpExecArray | null;
  while ((m = activityRe.exec(xml))) {
    const sportLabel = m[1].match(/Sport="([^"]*)"/)?.[1] ?? "";
    const body = m[2];
    const idText = body.match(/<Id>\s*([^<]+?)\s*<\/Id>/)?.[1];
    const firstLap = body.match(/<Lap\b[^>]*StartTime="([^"]+)"/)?.[1];
    const start = new Date(idText ?? firstLap ?? "");
    if (Number.isNaN(start.getTime())) continue;

    // Lap totals live directly under <Lap>; strip <Track> so trackpoint values don't get summed
    const laps = body.replace(/<Track>[\s\S]*?<\/Track>/g, "");
    const seconds = sum(tagValues(laps, "TotalTimeSeconds"));
    const meters = sum(tagValues(laps, "DistanceMeters"));
    const calories = sum(tagValues(laps, "Calories"));

    const avgBlocks = [
      ...laps.matchAll(/<AverageHeartRateBpm[^>]*>\s*<Value>(\d+(?:\.\d+)?)<\/Value>/g),
    ];
    const maxBlocks = [
      ...laps.matchAll(/<MaximumHeartRateBpm[^>]*>\s*<Value>(\d+(?:\.\d+)?)<\/Value>/g),
    ];
    let avgHr = avgBlocks.length
      ? sum(avgBlocks.map((b) => parseFloat(b[1]))) / avgBlocks.length
      : undefined;
    let maxHr = maxBlocks.length ? Math.max(...maxBlocks.map((b) => parseFloat(b[1]))) : undefined;
    if (avgHr === undefined) {
      const points = [...body.matchAll(/<HeartRateBpm[^>]*>\s*<Value>(\d+)<\/Value>/g)].map((b) =>
        parseFloat(b[1])
      );
      if (points.length) {
        avgHr = sum(points) / points.length;
        maxHr = points.reduce((a, b) => Math.max(a, b), 0);
      }
    }

    const times = [...body.matchAll(/<Time>\s*([^<]+?)\s*<\/Time>/g)];
    const last = times.length ? new Date(times[times.length - 1][1]) : undefined;
    const span =
      last && !Number.isNaN(last.getTime()) ? (last.getTime() - start.getTime()) / 1000 : undefined;
    const moving = seconds > 0 ? Math.round(seconds) : span ? Math.round(span) : undefined;
    const name =
      body.match(/<Notes>\s*([^<]+?)\s*<\/Notes>/)?.[1] ?? fileName.replace(/\.tcx$/i, "");

    out.push({
      source,
      externalId: hashId(start.toISOString(), sportLabel, moving),
      name,
      sport: normalizeSport(sportLabel, name),
      sportType: sportLabel,
      startDate: start.toISOString(),
      elapsedTime: span && span > 0 ? Math.round(span) : moving,
      movingTime: moving,
      distance: meters > 0 ? Math.round(meters) : undefined,
      averageSpeed: meters > 0 && moving ? meters / moving : undefined,
      averageHeartrate: avgHr !== undefined ? Math.round(avgHr) : undefined,
      maxHeartrate: maxHr,
      calories: calories > 0 ? Math.round(calories) : undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// GPX
// ---------------------------------------------------------------------------

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function parseGpx(
  xml: string,
  fileName: string,
  source: Source = "file"
): NormalizedActivity[] {
  const trk = xml.match(/<trk>([\s\S]*?)<\/trk>/)?.[1];
  if (!trk) return [];
  const name =
    trk.match(/<name>\s*(?:<!\[CDATA\[)?([^<\]]+)/)?.[1]?.trim() ?? fileName.replace(/\.gpx$/i, "");
  const type = trk.match(/<type>\s*([^<]+?)\s*<\/type>/)?.[1] ?? "";

  let distance = 0;
  let gain = 0;
  let prev: { lat: number; lon: number; ele?: number } | undefined;
  let first: Date | undefined;
  let last: Date | undefined;
  const hrs: number[] = [];

  const ptRe = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g;
  let m: RegExpExecArray | null;
  while ((m = ptRe.exec(trk))) {
    const lat = parseFloat(m[1].match(/lat="([^"]+)"/)?.[1] ?? "");
    const lon = parseFloat(m[1].match(/lon="([^"]+)"/)?.[1] ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ele = num(m[2].match(/<ele>\s*([^<]+)/)?.[1]);
    const time = m[2].match(/<time>\s*([^<]+?)\s*<\/time>/)?.[1];
    const hr = num(m[2].match(/<(?:\w+:)?hr>\s*(\d+)/)?.[1]);
    if (hr) hrs.push(hr);
    if (time) {
      const t = new Date(time);
      if (!Number.isNaN(t.getTime())) {
        first ??= t;
        last = t;
      }
    }
    if (prev) {
      distance += haversine(prev.lat, prev.lon, lat, lon);
      if (ele !== undefined && prev.ele !== undefined && ele - prev.ele > 0.5)
        gain += ele - prev.ele;
    }
    prev = { lat, lon, ele };
  }
  if (!first) return [];
  const elapsed = last ? Math.round((last.getTime() - first.getTime()) / 1000) : undefined;

  return [
    {
      source,
      externalId: hashId(first.toISOString(), type, elapsed),
      name,
      sport: normalizeSport(type || "run", name),
      sportType: type || undefined,
      startDate: first.toISOString(),
      elapsedTime: elapsed,
      movingTime: elapsed,
      distance: distance > 0 ? Math.round(distance) : undefined,
      elevationGain: gain > 0 ? Math.round(gain) : undefined,
      averageSpeed: distance > 0 && elapsed ? distance / elapsed : undefined,
      averageHeartrate: hrs.length ? Math.round(sum(hrs) / hrs.length) : undefined,
      maxHeartrate: hrs.length ? hrs.reduce((a, b) => Math.max(a, b), 0) : undefined,
    },
  ];
}
