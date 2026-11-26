/**
 * Import entry point: point it at a file, a folder or a zip from any tracker and it works out
 * which importer each file needs.
 */
import { spawn, spawnSync } from "child_process";
import {
  closeSync,
  createReadStream,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
} from "fs";
import { tmpdir } from "os";
import { basename, extname, join } from "path";
import { parseAppleHealthExport } from "./apple-health.js";
import { parseFit, parseGpx, parseTcx } from "./files.js";
import {
  isGarminActivitiesCsv,
  parseGarminActivitiesCsv,
  parseGarminSummarizedActivities,
} from "./garmin.js";
import {
  isFitbitExerciseLog,
  isGoogleFitSession,
  parseFitbitExerciseLog,
  parseGoogleFitSession,
  parseHealthConnectDb,
} from "./google.js";
import { isShortcutExport, parseShortcutExport } from "./shortcut.js";
import { emptyResult, mergeResults, type ParseResult, type Source } from "./types.js";

export interface ImportOptions {
  /** Unit used for distances in Garmin Connect CSV exports (they carry no unit) */
  distanceUnit?: "km" | "mi";
  onProgress?: (message: string) => void;
}

function readHead(path: string, bytes = 4096): string {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const read = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, read).toString("utf-8");
  } finally {
    closeSync(fd);
  }
}

/** Guess which tracker a folder of activity files came from, to label FIT/TCX/GPX files */
function sourceFromPath(path: string): Source {
  const p = path.toLowerCase();
  if (/garmin|di_connect/.test(p)) return "garmin";
  if (/takeout[\\/]fit[\\/]|google.?fit/.test(p)) return "google_fit";
  if (/fitbit/.test(p)) return "fitbit";
  return "file";
}

async function importFile(path: string, options: ImportOptions): Promise<ParseResult> {
  const name = basename(path);
  const ext = extname(name).toLowerCase();
  const result = emptyResult();

  try {
    if (ext === ".xml") {
      if (/export_cda/i.test(name)) return result;
      if (!readHead(path).includes("HealthData")) return result;
      options.onProgress?.(`Reading Apple Health export ${name} (large exports take a minute)...`);
      return await parseAppleHealthExport(createReadStream(path, { encoding: "utf-8" }));
    }
    if (ext === ".fit") {
      result.activities.push(...(await parseFit(readFileSync(path), name, sourceFromPath(path))));
      return result;
    }
    if (ext === ".tcx") {
      result.activities.push(...parseTcx(readFileSync(path, "utf-8"), name, sourceFromPath(path)));
      return result;
    }
    if (ext === ".gpx") {
      result.activities.push(...parseGpx(readFileSync(path, "utf-8"), name, sourceFromPath(path)));
      return result;
    }
    if (ext === ".csv") {
      const text = readFileSync(path, "utf-8");
      const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
      if (!isGarminActivitiesCsv(firstLine)) return result;
      return parseGarminActivitiesCsv(text, { distanceUnit: options.distanceUnit });
    }
    if (ext === ".txt") {
      if (!isShortcutExport(readHead(path))) return result;
      return parseShortcutExport(readFileSync(path, "utf-8"));
    }
    if (ext === ".json") {
      if (/hyrox-coach/i.test(name) || /"hyrox-coach"/i.test(readHead(path, 400))) {
        return parseShortcutExport(readFileSync(path, "utf-8"));
      }
      if (/summarizedActivities/i.test(name)) {
        return parseGarminSummarizedActivities(readFileSync(path, "utf-8"));
      }
      const isFitbit = /^exercise-\d+\.json$/i.test(name);
      const isFitSession = /all sessions/i.test(path);
      if (!isFitbit && !isFitSession) return result;
      const json = JSON.parse(readFileSync(path, "utf-8"));
      if (isFitbitExerciseLog(json)) return parseFitbitExerciseLog(json);
      if (isGoogleFitSession(json)) return parseGoogleFitSession(json, name);
      return result;
    }
    if (ext === ".db") {
      return await parseHealthConnectDb(path);
    }
    if (ext === ".zip") {
      return await importZip(path, options);
    }
  } catch (err) {
    result.warnings.push(`Skipped ${name}: ${(err as Error).message}`);
  }
  return result;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "__MACOSX") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

async function importDirectory(dir: string, options: ImportOptions): Promise<ParseResult> {
  const result = emptyResult();
  const interesting = new Set([
    ".txt",
    ".xml",
    ".fit",
    ".tcx",
    ".gpx",
    ".csv",
    ".json",
    ".db",
    ".zip",
  ]);
  const files = walk(dir).filter((f) => interesting.has(extname(f).toLowerCase()));
  let done = 0;
  for (const file of files) {
    mergeResults(result, await importFile(file, options));
    done++;
    if (done % 250 === 0) options.onProgress?.(`Scanned ${done}/${files.length} files...`);
  }
  return result;
}

function listZip(zipPath: string): string[] | undefined {
  const res = spawnSync("unzip", ["-Z1", zipPath], {
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.error || res.status !== 0) return undefined;
  return res.stdout.split("\n").filter(Boolean);
}

/** unzip treats [ ] * ? in member names as wildcards */
const zipMember = (entry: string) => entry.replace(/([\[\]*?\\])/g, "\\$1");

async function importZip(zipPath: string, options: ImportOptions): Promise<ParseResult> {
  const entries = listZip(zipPath);
  if (!entries) {
    const result = emptyResult();
    result.warnings.push(
      `Could not read ${basename(zipPath)} (the "unzip" tool is needed). Unzip it yourself and import the folder instead.`
    );
    return result;
  }

  // Apple Health: stream export.xml straight out of the archive. It can be gigabytes and the
  // archive also holds thousands of route and ECG files nobody needs.
  const appleXml = entries.find(
    (e) => /^apple_health_export\/[^/]+\.xml$/i.test(e) && !/export_cda/i.test(e)
  );
  if (appleXml) {
    options.onProgress?.("Reading Apple Health export (large exports take a minute)...");
    const child = spawn("unzip", ["-p", zipPath, zipMember(appleXml)], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    child.stdout.setEncoding("utf-8");
    return await parseAppleHealthExport(child.stdout);
  }

  const tmp = mkdtempSync(join(tmpdir(), "hyrox-coach-import-"));
  try {
    options.onProgress?.(`Unpacking ${basename(zipPath)}...`);
    const res = spawnSync("unzip", ["-q", "-o", zipPath, "-d", tmp], { encoding: "utf-8" });
    if (res.status !== 0 && res.status !== 1) {
      const result = emptyResult();
      result.warnings.push(`Could not unpack ${basename(zipPath)}: ${res.stderr?.trim()}`);
      return result;
    }
    return await importDirectory(tmp, options);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function importPath(path: string, options: ImportOptions = {}): Promise<ParseResult> {
  const stat = statSync(path);
  if (stat.isDirectory()) return importDirectory(path, options);
  return importFile(path, options);
}
