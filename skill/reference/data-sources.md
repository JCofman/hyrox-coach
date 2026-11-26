# Getting the Athlete's Data In

All imports go through one command. It accepts a file, a folder or a zip, detects the format,
and stores sessions that arrive from several sources only once:

```bash
npx hyrox-coach import <path> [more paths...]
npx hyrox-coach status          # what is in the database, by source and sport
```

Everything stays on the athlete's machine in `~/.hyrox-coach/coach.db`. Nothing is uploaded.

Walk the athlete through the export for their tracker, then run the import on the file they get.
If they use several trackers, import them all - duplicates are detected by start time and duration.

## Apple Health / Apple Fitness / Apple Watch

1. On the iPhone open the **Health** app.
2. Tap the profile picture (top right) → **Export All Health Data** → Export.
3. Save or AirDrop the resulting `export.zip` to the computer.

```bash
npx hyrox-coach import ~/Downloads/export.zip
```

Gives: every workout (type, duration, distance, average/max HR, calories, indoor flag) plus daily
resting HR, HRV, VO2max and body weight. The export covers everything any app wrote to Health,
so Garmin, Strava, Whoop or gym-app sessions synced to Health arrive too. Large exports (1 GB+)
take a minute or two; the file is streamed, not loaded into memory.

## Garmin

Garmin offers no self-service API for individuals, so use one of the exports:

**Option A - full account export (most complete)**

1. Go to garmin.com/account/datamanagement → **Export Your Data** → Request Data Export.
2. Garmin emails a download link (usually within an hour, sometimes a day).

```bash
npx hyrox-coach import ~/Downloads/<garmin-export>.zip
```

**Option B - Activities.csv (instant)**

1. Open connect.garmin.com → Activities → All Activities.
2. Scroll down to load as much history as wanted, then click **Export CSV** (top right).

```bash
npx hyrox-coach import ~/Downloads/Activities.csv            # add --units=mi if the account uses miles
```

**Option C - individual .fit files** exported from an activity page (gear icon → Export File),
or copied from the watch's `GARMIN/Activity` folder over USB. Import the folder.

## Google (Google Fit, Fitbit, Pixel Watch, Health Connect)

**Google Fit or Fitbit / Pixel Watch - via Google Takeout**

1. Go to takeout.google.com, click **Deselect all**, then tick **Fit** and/or **Fitbit**.
2. Create the export and download the zip.

```bash
npx hyrox-coach import ~/Downloads/takeout-*.zip
```

**Health Connect (Android)**

1. Settings → Health Connect → Manage data → **Export data** (or "Backup and restore").
2. Move the exported zip to the computer and import it.

Health Connect exports carry session type and time only (no distance or HR). If the athlete's
watch brand has its own export (Garmin, Samsung → Strava, Polar, Coros), prefer that.

## Automatic sync

Apple Health has no web API, so nothing on the computer can pull from it directly. Two routes
keep the database current without manual exports; `npx hyrox-coach sync` reads both.

**iPhone shortcut** (free, data stays in the athlete's iCloud). The athlete builds a shortcut
once in the Shortcuts app that writes recent workouts and resting HR / HRV / VO2max / weight
to `iCloud Drive/Shortcuts/HyroxCoach/hyrox-coach-export.txt`, and triggers it with an "app is
opened" automation (Health data is unreadable while the phone is locked). The full steps are
in `docs/iphone-shortcut.md` of the hyrox-coach repository; walk the athlete through them one
action at a time. Needs the same Apple ID on phone and computer. The file format is plain text:

```
hyrox-coach export v1
workout; start=2026-11-10T07:02:11+01:00; type=Running; duration=1:02:33; distance=10,4 km; kcal=742
metric; type=Resting Heart Rate; date=2026-11-10T00:00:00+01:00; value=48
```

Only `start` is required on a workout; dates, numbers and units are parsed leniently. If the
athlete's iOS does not offer "Workouts" in Find Health Samples, sync metrics this way and
import workouts from a full Health export (`export.zip`) every few weeks.

**Strava** (needs a paid Strava subscription for API access since June 2026; only suggest it
to athletes who already pay for Strava). The Strava iPhone app can import Apple Watch workouts
automatically; activities set to "Only You" are still synced. No recovery metrics.

## Strava

Needs a personal API application (strava.com/settings/api, callback domain `localhost`).
See "Strava" in SKILL.md for the auth flow:

```bash
npx hyrox-coach auth --client-id=ID --client-secret=SECRET
npx hyrox-coach auth --code="FULL_REDIRECT_URL"
npx hyrox-coach sync --days=730
```

## Anything else (Polar, Coros, Suunto, Wahoo, Whoop, Samsung...)

Export activities as `.fit`, `.tcx` or `.gpx` (every platform offers at least one) and import the
folder:

```bash
npx hyrox-coach import ~/Downloads/my-activities/
```

## What the data cannot tell you

Wearables log _that_ a strength or Hyrox session happened, how long it was and the heart rate -
not sled weights, wall ball reps or station splits. Always ask for those (see assessment.md).
Sessions whose title contains "Hyrox" are classified as `hyrox`, titles containing "SkiErg" as
`skierg`; everything else follows the tracker's activity type.
