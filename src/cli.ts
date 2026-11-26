import {
  configExists,
  loadConfig,
  promptForConfig,
  saveConfig,
  saveTokens,
  tokensExist,
  getDbPath,
  createConfig,
  ensureConfigDir,
  getInboxDirs,
  type Tokens,
} from "./lib/config.js";
import { log } from "./lib/logging.js";
import { migrate } from "./db/migrate.js";
import { execute as runSql, initDatabase, query, queryJson } from "./db/client.js";
import { logSync, storeActivities, storeMetrics } from "./db/store.js";
import { importPath } from "./import/index.js";
import type { ParseResult } from "./import/types.js";
import { normalizeSport } from "./import/sport.js";
import type { NormalizedActivity } from "./import/types.js";
import { getValidTokens } from "./strava/oauth.js";
import { getAllActivities, getAthlete } from "./strava/api.js";
import type { StravaActivity, StravaTokenResponse } from "./strava/types.js";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Proxy Configuration
// ============================================================================

// Configure proxy for fetch() if HTTP_PROXY or HTTPS_PROXY is set
const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

// ============================================================================
// Argument Parsing
// ============================================================================

interface SyncArgs {
  command: "sync";
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  days?: number;
}

interface RenderArgs {
  command: "render";
  inputFile: string;
  outputFile?: string;
}

interface QueryArgs {
  command: "query";
  sql: string;
  json: boolean;
}

interface AuthArgs {
  command: "auth";
  clientId?: string;
  clientSecret?: string;
  code?: string;
}

interface ImportArgs {
  command: "import";
  paths: string[];
  distanceUnit?: "km" | "mi";
}

interface StatusArgs {
  command: "status";
  json: boolean;
}

interface HelpArgs {
  command: "help";
}

type CliArgs = SyncArgs | RenderArgs | QueryArgs | AuthArgs | ImportArgs | StatusArgs | HelpArgs;

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return { command: "help" };
  }

  if (args[0] === "import") {
    const importArgs: ImportArgs = { command: "import", paths: [] };
    for (const arg of args.slice(1)) {
      if (arg.startsWith("--units=")) {
        importArgs.distanceUnit = arg.slice("--units=".length) === "mi" ? "mi" : "km";
      } else if (!arg.startsWith("--")) {
        importArgs.paths.push(arg);
      }
    }
    if (importArgs.paths.length === 0) {
      log.error("import command requires a file, folder or zip to import");
      process.exit(1);
    }
    return importArgs;
  }

  if (args[0] === "status") {
    return { command: "status", json: args.includes("--json") };
  }

  if (args[0] === "sync") {
    // Sync command (default)
    const syncArgs: SyncArgs = { command: "sync" };

    for (const arg of args) {
      if (arg.startsWith("--client-id=")) {
        syncArgs.clientId = arg.split("=")[1];
      } else if (arg.startsWith("--client-secret=")) {
        syncArgs.clientSecret = arg.split("=")[1];
      } else if (arg.startsWith("--access-token=")) {
        syncArgs.accessToken = arg.split("=")[1];
      } else if (arg.startsWith("--refresh-token=")) {
        syncArgs.refreshToken = arg.split("=")[1];
      } else if (arg.startsWith("--days=")) {
        syncArgs.days = parseInt(arg.split("=")[1]);
      }
    }

    return syncArgs;
  }

  if (args[0] === "render") {
    if (!args[1]) {
      log.error("render command requires an input file");
      process.exit(1);
    }

    const renderArgs: RenderArgs = {
      command: "render",
      inputFile: args[1],
    };

    for (let i = 2; i < args.length; i++) {
      if (args[i] === "--output" || args[i] === "-o") {
        renderArgs.outputFile = args[i + 1];
        i++;
      } else if (args[i].startsWith("--output=")) {
        renderArgs.outputFile = args[i].split("=")[1];
      }
    }

    return renderArgs;
  }

  if (args[0] === "query") {
    if (!args[1]) {
      log.error("query command requires a SQL statement");
      process.exit(1);
    }

    const queryArgs: QueryArgs = {
      command: "query",
      sql: args[1],
      json: args.includes("--json"),
    };

    return queryArgs;
  }

  if (args[0] === "auth") {
    const authArgs: AuthArgs = { command: "auth" };

    for (const arg of args) {
      if (arg.startsWith("--client-id=")) {
        authArgs.clientId = arg.slice("--client-id=".length);
      } else if (arg.startsWith("--client-secret=")) {
        authArgs.clientSecret = arg.slice("--client-secret=".length);
      } else if (arg.startsWith("--code=")) {
        authArgs.code = arg.slice("--code=".length);
      }
    }

    return authArgs;
  }

  if (args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    return { command: "help" };
  }

  log.error(`Unknown command: ${args[0]}`);
  process.exit(1);
}

function printHelp(): void {
  console.log(`
Hyrox Coach - Training Plan Tools

Usage: npx hyrox-coach <command> [options]

Commands:
  import <path...>  Import training history from Apple Health, Garmin, Google or files
  sync              Pull new data: the iPhone shortcut's iCloud folder and Strava, whichever is set up
  auth              Get Strava authorization URL or exchange code for tokens
  status            Show what is in the database, by source and sport
  render <file>     Render a training plan JSON to HTML
  query <sql>       Run a SQL query against the database
  help              Show this help message

Import accepts a file, a folder or a zip, and detects the format:
  Apple Health      export.zip from the Health app (Export All Health Data)
  Garmin            "Export Your Data" zip, Activities.csv from Garmin Connect, .fit files
  Google            Takeout zip (Google Fit or Fitbit), Health Connect export zip
  iPhone shortcut   hyrox-coach-export.txt written by the shortcut (docs/iphone-shortcut.md)
  Anything else     .fit, .tcx or .gpx files (Polar, Coros, Suunto, Wahoo, ...)

  Sessions that arrive from more than one source are stored once.

Import Options:
  --units=km|mi         Distance unit of Garmin Connect CSV exports (default: km)

Strava Auth Options:
  --client-id=ID        Strava API client ID
  --client-secret=SEC   Strava API client secret
  --code=URL_OR_CODE    Full redirect URL or just the authorization code

Sync Options:
  --days=N              Days of Strava history to sync (default: 730)

Render Options:
  --output, -o FILE     Output HTML file (default: stdout)

Query / Status Options:
  --json                Output as JSON

Examples:
  npx hyrox-coach import ~/Downloads/export.zip
  npx hyrox-coach import ~/Downloads/Activities.csv ~/Downloads/garmin-fit-files/
  npx hyrox-coach import ~/Downloads/takeout-20260101.zip
  npx hyrox-coach status
  npx hyrox-coach render hyrox-hamburg-2026-10-03.json --output plan.html
  npx hyrox-coach query "SELECT * FROM weekly_volume LIMIT 10" --json
`);
}

// ============================================================================
// Auth Command (for headless/Claude environments)
// ============================================================================

const REDIRECT_PORT = 8765;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";

async function runAuth(args: AuthArgs): Promise<void> {
  // If code is provided, exchange it for tokens
  if (args.code) {
    if (!configExists()) {
      log.error("No configuration found. Run 'auth' with --client-id and --client-secret first.");
      process.exit(1);
    }

    // Extract code from full URL if user pasted the entire redirect URL
    let code = args.code;
    if (code.includes("localhost") || code.startsWith("http")) {
      try {
        const url = new URL(code);
        const extractedCode = url.searchParams.get("code");
        if (extractedCode) {
          code = extractedCode;
        } else {
          log.error("Could not find 'code' parameter in URL");
          process.exit(1);
        }
      } catch {
        // Not a valid URL, use as-is
      }
    }

    const config = loadConfig();
    log.start("Exchanging authorization code for tokens...");

    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.strava.client_id,
        client_secret: config.strava.client_secret,
        code: code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      log.error(`Token exchange failed: ${error}`);
      process.exit(1);
    }

    const data: StravaTokenResponse = await tokenResponse.json();

    const tokens: Tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      athlete_id: data.athlete.id,
    };

    saveTokens(tokens);
    log.success(`Authenticated as ${data.athlete.firstname} ${data.athlete.lastname}`);
    log.ready("Now run: npx hyrox-coach sync");
    return;
  }

  // Otherwise, generate and print the authorization URL
  if (!args.clientId || !args.clientSecret) {
    log.error("Required: --client-id and --client-secret");
    log.info("Get these from: https://www.strava.com/settings/api");
    process.exit(1);
  }

  // Save config for later use
  const config = createConfig(args.clientId, args.clientSecret, 730);
  saveConfig(config);

  const authUrl = new URL(AUTHORIZE_URL);
  authUrl.searchParams.set("client_id", args.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", "activity:read_all");
  authUrl.searchParams.set("approval_prompt", "auto");

  console.log("\n📋 AUTHORIZATION URL:\n");
  console.log(authUrl.toString());
  console.log("\n📝 INSTRUCTIONS:");
  console.log("1. Open the URL above in a browser");
  console.log("2. Click 'Authorize' on Strava");
  console.log("3. You'll be redirected to a page that won't load (that's OK!)");
  console.log("4. Copy the ENTIRE URL from your browser's address bar");
  console.log("5. Paste it back to Claude\n");
}

// ============================================================================
// Sync Command
// ============================================================================

function escapeString(str: string | null | undefined): string {
  if (str == null) return "NULL";
  return `'${str.replace(/'/g, "''")}'`;
}

export function fromStrava(activity: StravaActivity): NormalizedActivity {
  return {
    source: "strava",
    externalId: String(activity.id),
    name: activity.name,
    sport: normalizeSport(activity.sport_type, activity.name),
    sportType: activity.sport_type,
    startDate: activity.start_date,
    elapsedTime: activity.elapsed_time,
    movingTime: activity.moving_time,
    distance: activity.distance || undefined,
    elevationGain: activity.total_elevation_gain,
    averageSpeed: activity.average_speed,
    maxSpeed: activity.max_speed,
    averageHeartrate: activity.average_heartrate,
    maxHeartrate: activity.max_heartrate,
    averageWatts: activity.average_watts,
    averageCadence: activity.average_cadence,
    calories: activity.calories,
    sufferScore: activity.suffer_score,
    isRace: activity.workout_type === 1,
    isIndoor: /virtual|treadmill/i.test(activity.sport_type) ? true : undefined,
    description: activity.description,
  };
}

function storeStravaActivities(activities: StravaActivity[]): void {
  log.start("Storing activities in database...");
  const stored = storeActivities(activities.map(fromStrava));
  logSync("strava", stored.inserted + stored.updated);
  log.success(
    `Stored ${stored.inserted} new and ${stored.updated} updated activities` +
      (stored.duplicates ? ` (${stored.duplicates} already present from another source)` : "")
  );
}

function insertAthlete(athlete: {
  id: number;
  firstname: string;
  lastname: string;
  weight?: number;
  ftp?: number;
}): void {
  const sql = `
    INSERT OR REPLACE INTO athlete (id, firstname, lastname, weight, ftp, raw_json, updated_at)
    VALUES (
      ${athlete.id},
      ${escapeString(athlete.firstname)},
      ${escapeString(athlete.lastname)},
      ${athlete.weight ?? "NULL"},
      ${athlete.ftp ?? "NULL"},
      ${escapeString(JSON.stringify(athlete))},
      datetime('now')
    );
  `;
  runSql(sql);
}

/** Import whatever the iPhone shortcut (or the athlete) dropped into the inbox folders */
async function syncInbox(): Promise<boolean> {
  let found = false;
  for (const dir of getInboxDirs()) {
    if (!existsSync(dir)) continue;
    found = true;

    // iCloud keeps files it has not downloaded yet as hidden ".name.icloud" placeholders
    const placeholders = readdirSync(dir).filter((f) => f.startsWith(".") && f.endsWith(".icloud"));
    if (placeholders.length) {
      spawnSync("brctl", ["download", dir], { stdio: "ignore" });
      log.warn(
        `${placeholders.length} file(s) in ${dir} are still downloading from iCloud. Run sync again in a minute.`
      );
    }

    log.start(`Checking ${dir}`);
    const parsed = await importPath(dir, { onProgress: (message) => log.info(message) });
    if (parsed.activities.length === 0 && parsed.metrics.length === 0) {
      for (const warning of parsed.warnings.slice(0, 10)) log.warn(warning);
      log.info("Nothing to import there yet.");
      continue;
    }
    storeParsed(parsed);
  }
  return found;
}

async function runSync(args: SyncArgs): Promise<void> {
  log.box("Hyrox Coach - Sync");
  ensureConfigDir();
  await initDatabase();
  migrate();

  const hasInbox = await syncInbox();
  const wantsStrava =
    configExists() ||
    Boolean(args.accessToken && args.refreshToken) ||
    Boolean(args.clientId && args.clientSecret);

  if (wantsStrava) {
    await syncStrava(args);
  } else if (hasInbox) {
    log.info(
      "Strava is not connected (optional, needs a paid Strava subscription). Connect it with: npx hyrox-coach auth"
    );
  } else {
    log.warn("Nothing to sync from yet. Set up one of these:");
    log.info("iPhone shortcut: see docs/iphone-shortcut.md (free, data stays in your iCloud)");
    log.info(
      "Strava (paid subscription): npx hyrox-coach auth --client-id=ID --client-secret=SECRET"
    );
    log.info("Or import an export by hand: npx hyrox-coach import <path>");
    return;
  }

  log.info(`Database: ${getDbPath()}`);
  log.ready("Sync complete! Run: npx hyrox-coach status");
}

async function syncStrava(args: SyncArgs): Promise<void> {
  const syncDays = args.days || 730;

  // Step 1: Handle token-based auth (no browser needed)
  if (args.accessToken && args.refreshToken) {
    log.info("Using provided access tokens...");

    // Save tokens - we'll get athlete_id after fetching profile
    // Set expiry to 1 hour from now (we have refresh token for renewal)
    const tempTokens = {
      access_token: args.accessToken,
      refresh_token: args.refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      athlete_id: 0, // Will be updated after fetching athlete
    };
    saveTokens(tempTokens);

    // Create minimal config if needed
    if (!configExists()) {
      // Token-based auth doesn't need client credentials for initial sync
      // but we need them for token refresh - use placeholders
      const config = createConfig("token-auth", "token-auth", syncDays);
      saveConfig(config);
    }

    // Initialize database
    migrate();

    // Fetch athlete to get ID and validate tokens
    log.start("Validating tokens and fetching athlete profile...");
    const athlete = await getAthlete(tempTokens);

    // Update tokens with real athlete ID
    const tokens = { ...tempTokens, athlete_id: athlete.id };
    saveTokens(tokens);

    insertAthlete(athlete);
    log.success(`Authenticated as ${athlete.firstname} ${athlete.lastname}`);

    // Fetch activities
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - syncDays);
    const activities = await getAllActivities(tokens, afterDate);

    storeStravaActivities(activities);
    return;
  }

  // Step 2: OAuth-based auth (requires browser)
  if (!configExists()) {
    if (args.clientId && args.clientSecret) {
      log.info("Creating configuration from command line arguments...");
      const config = createConfig(args.clientId, args.clientSecret, syncDays);
      saveConfig(config);
      log.success("Configuration saved");
    } else {
      log.info("No configuration found. Let's set things up.");
      const config = await promptForConfig();
      saveConfig(config);
      log.success("Configuration saved");
    }
  }

  const config = loadConfig();
  const configSyncDays = args.days || config.sync_days || 730;

  // Initialize database
  migrate();

  // Authenticate with Strava (opens browser)
  const tokens = await getValidTokens();

  // Step 4: Fetch and store athlete profile
  log.start("Fetching athlete profile...");
  const athlete = await getAthlete(tokens);
  insertAthlete(athlete);
  log.success(`Athlete: ${athlete.firstname} ${athlete.lastname}`);

  // Step 5: Fetch activities
  const afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - configSyncDays);

  const activities = await getAllActivities(tokens, afterDate);

  // Step 6: Store activities
  storeStravaActivities(activities);
}

// ============================================================================
// Import Command (Apple Health, Garmin, Google, FIT/TCX/GPX)
// ============================================================================

/** Store a parse result and report what happened. Returns the number of activities written. */
function storeParsed(parsed: ParseResult): number {
  const stored = storeActivities(parsed.activities);
  const metricCount = storeMetrics(parsed.metrics);
  const bySource = new Map<string, number>();
  for (const a of parsed.activities) bySource.set(a.source, (bySource.get(a.source) ?? 0) + 1);
  for (const [source, count] of bySource) logSync(source, count);

  log.success(
    `${parsed.activities.length} activities found: ${stored.inserted} new, ${stored.updated} updated, ` +
      `${stored.duplicates} already present from another source`
  );
  if (metricCount)
    log.success(`${metricCount} daily health metrics stored (resting HR, HRV, VO2max, weight)`);
  return stored.inserted + stored.updated;
}

async function runImport(args: ImportArgs): Promise<void> {
  log.box("Hyrox Coach - Import");
  ensureConfigDir();
  await initDatabase();
  migrate();

  let total = 0;
  for (const path of args.paths) {
    if (!existsSync(path)) {
      log.error(`Not found: ${path}`);
      continue;
    }
    log.start(`Importing ${path}`);
    const parsed = await importPath(path, {
      distanceUnit: args.distanceUnit,
      onProgress: (message) => log.info(message),
    });

    for (const warning of parsed.warnings.slice(0, 10)) log.warn(warning);
    if (parsed.warnings.length > 10) log.warn(`...and ${parsed.warnings.length - 10} more`);

    if (parsed.activities.length === 0 && parsed.metrics.length === 0) {
      log.warn("No activities recognized. Run 'npx hyrox-coach help' for supported exports.");
      continue;
    }

    total += storeParsed(parsed);
  }

  log.info(`Database: ${getDbPath()}`);
  if (total > 0) log.ready("Import complete! Run: npx hyrox-coach status");
}

// ============================================================================
// Status Command
// ============================================================================

async function runStatus(args: StatusArgs): Promise<void> {
  if (!existsSync(getDbPath())) {
    if (args.json) console.log(JSON.stringify({ exists: false }));
    else log.info("No database yet. Import data with: npx hyrox-coach import <path>");
    return;
  }
  await initDatabase();
  migrate(true);

  const sources = queryJson(
    `SELECT source, COUNT(*) AS activities, date(MIN(start_date)) AS first, date(MAX(start_date)) AS last
     FROM activities GROUP BY source ORDER BY activities DESC`
  );
  const sports = queryJson(
    `SELECT sport, COUNT(*) AS sessions,
       ROUND(SUM(COALESCE(moving_time, elapsed_time)) / 3600.0, 1) AS hours,
       ROUND(SUM(distance) / 1000.0, 1) AS km
     FROM activities WHERE start_date >= date('now', '-84 days')
     GROUP BY sport ORDER BY hours DESC`
  );
  const metrics = queryJson(
    `SELECT metric, COUNT(*) AS days, date(MAX(date)) AS last FROM health_metrics GROUP BY metric`
  );

  if (args.json) {
    console.log(JSON.stringify({ exists: true, sources, last12Weeks: sports, metrics }, null, 2));
    return;
  }
  console.log("\nSources:");
  console.table(sources);
  console.log("Last 12 weeks by sport:");
  console.table(sports);
  if (metrics.length) {
    console.log("Health metrics:");
    console.table(metrics);
  }
}

// ============================================================================
// Render Command
// ============================================================================

function getTemplatePath(): string {
  // Look for template in multiple locations
  const locations = [
    join(__dirname, "..", "templates", "plan-viewer.html"),
    join(__dirname, "..", "..", "templates", "plan-viewer.html"),
    join(process.cwd(), "templates", "plan-viewer.html"),
  ];

  for (const loc of locations) {
    try {
      readFileSync(loc);
      return loc;
    } catch {
      // Continue to next location
    }
  }

  throw new Error("Could not find plan-viewer.html template");
}

function runRender(args: RenderArgs): void {
  log.start("Rendering training plan...");

  // Read the plan JSON
  let planJson: string;
  try {
    planJson = readFileSync(args.inputFile, "utf-8");
  } catch (err) {
    log.error(`Could not read input file: ${args.inputFile}`);
    process.exit(1);
  }

  // Validate it's valid JSON
  try {
    JSON.parse(planJson);
  } catch (err) {
    log.error("Input file is not valid JSON");
    process.exit(1);
  }

  // Read the template
  const templatePath = getTemplatePath();
  let template = readFileSync(templatePath, "utf-8");

  // Replace the plan data in the template
  const planDataRegex = /<script type="application\/json" id="plan-data">[\s\S]*?<\/script>/;
  const newPlanData = `<script type="application/json" id="plan-data">\n${planJson}\n</script>`;
  template = template.replace(planDataRegex, newPlanData);

  // Output
  if (args.outputFile) {
    writeFileSync(args.outputFile, template);
    log.success(`Training plan rendered to: ${args.outputFile}`);
  } else {
    // Output to stdout
    console.log(template);
  }
}

// ============================================================================
// Query Command
// ============================================================================

async function runQuery(args: QueryArgs): Promise<void> {
  ensureConfigDir();
  await initDatabase();

  if (args.json) {
    const results = queryJson(args.sql);
    console.log(JSON.stringify(results, null, 2));
  } else {
    const result = query(args.sql);
    console.log(result);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs();

  switch (args.command) {
    case "help":
      printHelp();
      break;
    case "auth":
      await runAuth(args);
      break;
    case "sync":
      await runSync(args);
      break;
    case "import":
      await runImport(args);
      break;
    case "status":
      await runStatus(args);
      break;
    case "render":
      runRender(args);
      break;
    case "query":
      await runQuery(args);
      break;
  }
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
