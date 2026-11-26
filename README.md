# Hyrox Coach

Hyrox Coach lets you use Claude to build a personalized Hyrox training plan from your own
training data. It reads your history from **Apple Health / Apple Fitness, Garmin, Google (Fit,
Fitbit, Pixel Watch, Health Connect), Strava**, or any `.fit` / `.tcx` / `.gpx` export, works out
where you stand, asks about the things a watch cannot know (stations, strength, equipment), and
writes a periodized plan: running, strength, station work, compromised running, simulations, a
taper, and a station-by-station race strategy.

The output is an interactive training plan you open in a browser. You can move, edit and
complete workouts, adjust heart-rate, pace and erg zones, and export sessions to your calendar
(.ics), Garmin (.fit) or Zwift (.zwo). Your data stays on your machine.

It is a fork of [Claude Coach](https://github.com/felixrieseberg/claude-coach) by Felix Rieseberg
(triathlon and running plans from Strava), rebuilt around Hyrox and multi-source data import.

Not affiliated with or endorsed by HYROX or Anthropic. HYROX is a trademark of its owner and
is used here only to describe what the plans are for.

## How it works

1. **Import** - one command reads whatever export you have and detects the format.
2. **Assess** - Claude queries your history: weekly load, run fitness, strength and functional
   sessions, recovery markers, and classifies you as runner, lifter or hybrid.
3. **Ask** - race, division, goal, past splits, weak stations, equipment, schedule.
4. **Plan** - Base → Build → Specific → Taper, scaled to the weeks you have.
5. **Render** - a single self-contained HTML file.

## Setup

Requires Node.js 22.5+ (20+ works if the `sqlite3` command-line tool is installed).

```bash
npm install
```

```bash
npm run build
```

`npm run build` compiles the CLI, builds the plan viewer and packages the skill into
`dist/hyrox-coach-skill.zip`.

### Install the skill

**Claude Code** - extract the skill so that `SKILL.md` sits at
`~/.claude/skills/hyrox-coach/SKILL.md`:

```bash
mkdir -p ~/.claude/skills/hyrox-coach && unzip -o dist/hyrox-coach-skill.zip -d ~/.claude/skills/hyrox-coach
```

**Claude.ai** - Settings → Capabilities → enable "Code execution and file creation", then under
Skills choose "Add skill" and upload `dist/hyrox-coach-skill.zip`.

The skill calls the CLI as `npx hyrox-coach`. Until the package is published to npm, make it
available on your machine from this folder:

```bash
npm link
```

### Create a plan

Start a new Claude session and ask:

> Help me create a training plan for HYROX Hamburg on October 3rd using the hyrox-coach skill.
> I use an Apple Watch and a Garmin.

## Importing your data

```bash
npx hyrox-coach import <file, folder or zip>
```

| Source                           | What to export                                                                                                             | Gives                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Apple Health / Apple Watch**   | Health app → profile picture → Export All Health Data → `export.zip`                                                       | Workouts with HR, distance, calories; resting HR, HRV, VO2max, weight |
| **Garmin**                       | Garmin Connect → Activities → Export CSV, **or** garmin.com/account/datamanagement → Export Your Data, **or** `.fit` files | Activities with HR, distance, pace, elevation                         |
| **Google Fit**                   | takeout.google.com → select only "Fit"                                                                                     | Sessions with distance, HR, calories                                  |
| **Fitbit / Pixel Watch**         | takeout.google.com → select only "Fitbit"                                                                                  | Exercise logs with HR, distance, calories                             |
| **Health Connect (Android)**     | Settings → Health Connect → Manage data → Export data                                                                      | Session type and time                                                 |
| **iPhone shortcut (automatic)**  | Free shortcut that writes Apple Health data to iCloud Drive; read by `sync` ([guide](docs/iphone-shortcut.md))             | Recent workouts; resting HR, HRV, VO2max, weight                      |
| **Strava**                       | API sync (`auth` + `sync`, see below)                                                                                      | Activities incl. relative effort                                      |
| **Polar, Coros, Suunto, Wahoo…** | Any `.fit`, `.tcx` or `.gpx` export                                                                                        | Activities with HR, distance                                          |

- Import as many sources as you like. A session recorded by two trackers (for example a Garmin
  run that also synced to Apple Health and Strava) is stored once.
- Apple Health exports are often over a gigabyte. They are streamed straight out of the zip, so
  there is no need to unpack them.
- Garmin Connect CSV files carry no distance unit; add `--units=mi` if your account uses miles.
- Sessions titled "Hyrox…" are recognised as Hyrox sessions, "SkiErg…" as SkiErg work.

Check what was imported:

```bash
npx hyrox-coach status
```

The database lives at `~/.hyrox-coach/coach.db` (override with `HYROX_COACH_HOME`).

### Staying up to date automatically

`hyrox-coach sync` pulls from whichever of these you have set up, and the coach runs it at the
start of each session:

- **iPhone shortcut** (free, private): a shortcut writes your recent Apple Health workouts and
  recovery metrics to iCloud Drive. Follow [docs/iphone-shortcut.md](docs/iphone-shortcut.md).
- **Strava** (optional): a free account is enough. Set new activities to "Only You" under
  Settings → Privacy Controls if you want them private; the sync still reads them.

Both can be on at once. A session that arrives through both is stored once.

### Strava

Create an API application at [strava.com/settings/api](https://www.strava.com/settings/api)
with Authorization Callback Domain `localhost`, then:

```bash
npx hyrox-coach auth --client-id=YOUR_ID --client-secret=YOUR_SECRET
```

Open the printed URL, authorize, and copy the address of the page you land on (it will not
load; that is expected):

```bash
npx hyrox-coach auth --code="PASTE_THE_FULL_URL"
```

```bash
npx hyrox-coach sync --days=730
```

### No data?

Tell Claude your recent weekly training, a 5k or 10k time and your station experience. The plan
then starts conservatively and schedules field tests in the first two weeks.

## CLI

| Command                                     | Purpose                                             |
| ------------------------------------------- | --------------------------------------------------- |
| `hyrox-coach import <path...>`              | Import Apple Health, Garmin, Google or file exports |
| `hyrox-coach sync`                          | Pull new data from the iPhone shortcut and Strava   |
| `hyrox-coach auth`                          | Connect Strava                                      |
| `hyrox-coach status [--json]`               | Sources, date ranges, last 12 weeks by sport        |
| `hyrox-coach query "<sql>" [--json]`        | Query the local database                            |
| `hyrox-coach render plan.json -o plan.html` | Render a plan to the interactive viewer             |

## Example

`examples/sample-plan.json` is a 12-week Open plan (regenerate with
`node scripts/generate-sample-plan.mjs`). Render and preview it:

```bash
npm run build:example
```

```bash
node scripts/serve-example.mjs
```

## Where the coaching content comes from

The skill's reference files (`skill/reference/`) encode the plan logic. Two published sources
shaped it:

- **ESN's Hyrox Vorbereitungsplan** (developed with Luke Storath): 8 weeks, 4 × 60 min per week,
  strength endurance plus endurance as the goals, RPE-based intensity, warm-up / workout /
  cool-down in every session, a volume-reduction taper. Used as the default template for the
  8-week plan and the 4-session week. The detailed sessions of that plan are only available on
  request from ESN and are not reproduced here.
- **HYROX's own preparation advice**: running is about half the race, train the transition from
  stations to running, learn the movement standards, do not start too fast and control heart
  rate on the first kilometer and the SkiErg, arrive rested, fed and hydrated.

The rest follows standard endurance and strength-endurance practice (polarized intensity
distribution, 3:1 load cycles, threshold-based zones, strength before strength endurance).
Division weights in `skill/reference/hyrox-format.md` reflect recent seasons; check the current
[rulebook](https://hyrox.com/rulebook/) before race-pace training, as HYROX adjusts them.

This is training guidance, not medical advice.

## Development

```bash
npm run test:run      # unit tests incl. importers
npm run typecheck
npm run dev:viewer    # work on the plan viewer
```

| Path          | Contents                                            |
| ------------- | --------------------------------------------------- |
| `skill/`      | `SKILL.md` and the coaching reference files         |
| `src/import/` | Apple Health, Garmin, Google, FIT/TCX/GPX importers |
| `src/strava/` | Strava OAuth and API client                         |
| `src/db/`     | SQLite schema, de-duplicating store                 |
| `src/schema/` | Training plan JSON schema (TypeScript types)        |
| `src/viewer/` | Svelte plan viewer, exports (.ics, .fit, .zwo)      |

## License

MIT. Original work © Felix Rieseberg; Hyrox adaptation and importers © Jacob Cofman.
