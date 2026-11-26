# Automatic sync from the iPhone (Shortcuts)

A free, private way to keep Hyrox Coach up to date from Apple Health. A shortcut on the iPhone
writes your recent workouts and recovery metrics to a small text file in iCloud Drive. On the
Mac, `hyrox-coach sync` reads that file. No extra app, no account, and nothing leaves your own
devices and iCloud.

```
Apple Watch → Apple Health → Shortcut → iCloud Drive → hyrox-coach sync → coach.db
```

**Requirements:** the iPhone and the Mac are signed in to the **same Apple ID** with iCloud
Drive on. If they are not, see "Different Apple ID" at the bottom.

> Status: the Mac side is tested. The shortcut steps below have not yet been confirmed on a
> real iPhone, and Shortcuts differs slightly between iOS versions. Two things to check as you
> build it are marked **Check**.

## 1. Build the shortcut (about 10 minutes, once)

Open **Shortcuts** on the iPhone → **+** → name it `Hyrox Coach Sync`. Add these actions in
order. Text in `{braces}` is a variable you pick from the bar above the keyboard, not typed.

### Header

1. **Text**: `hyrox-coach export v1`
2. **Add to Variable**: variable name `Lines`

### Workouts

3. **Find Health Samples**
   - Type: **Workouts**
   - Add Filter: Start Date **is in the last** `30` **days**
   - **Check:** if "Workouts" is not in the Type list on your iOS version, skip steps 3-7.
     Recovery metrics will still sync; get workouts through Strava instead (see README).
4. **Repeat with Each** (input: Health Samples)
5. Inside the repeat, **Text**:

   ```
   workout; start={Repeat Item: Start Date}; end={Repeat Item: End Date}; type={Repeat Item: Name}; duration={Repeat Item: Duration}; distance={Repeat Item: Distance}; kcal={Repeat Item: Value}
   ```

   - Tap each date variable → Date Format **ISO 8601** → turn **Include Time** on.
   - **Check:** tap `Repeat Item` to see which properties your iOS offers. Use what is there
     and leave out any `key=...` part you cannot fill. Only `start` is required; `type` and
     either `end` or `duration` make the data useful.

6. Inside the repeat, **Add to Variable**: `Lines`
7. **End Repeat** (added automatically)

### Recovery metrics

Repeat this block four times, once per Type: **Resting Heart Rate**, **Heart Rate
Variability**, **VO2 Max**, **Weight**.

8. **Find Health Samples**: Type as above, Start Date **is in the last** `30` **days**
9. **Repeat with Each**
10. Inside the repeat, **Text** (replace the type name per block):

    ```
    metric; type=Resting Heart Rate; date={Repeat Item: Start Date}; value={Repeat Item: Value}
    ```

    Set the date to **ISO 8601** with time, as before.

11. Inside the repeat, **Add to Variable**: `Lines`

### Save

12. **Combine Text**: `Lines`, separator **New Lines**
13. **Save File**
    - Turn **Ask Where to Save** off
    - Destination: **Shortcuts** folder
    - Subpath: `HyroxCoach/hyrox-coach-export.txt`
    - Turn **Overwrite If File Exists** on

Run it once by hand. iOS asks for permission to read each Health type: allow them.

## 2. Check it on the Mac

```bash
npx hyrox-coach sync
```

```bash
npx hyrox-coach status
```

`sync` looks in `iCloud Drive/Shortcuts/HyroxCoach/`. Running it again is safe: sessions
already stored are updated, not duplicated, and a session that also arrived from Strava or a
Garmin export is stored once.

## 3. Make it automatic

Health data is locked while the iPhone is locked, so a shortcut that runs at 3 a.m. fails.
Trigger it at a moment when the phone is certainly unlocked:

Shortcuts → **Automation** → **+** → **App** → choose **Fitness** (or any app you open
daily) → **Is Opened** → **Run Immediately** → select `Hyrox Coach Sync`.

Every time you look at your rings, the file is refreshed with the last 30 days. The coach
runs `sync` at the start of each session, so it always sees the latest file.

## What the file looks like

One record per line. The importer accepts ISO or local-format dates, decimal commas, units
(`10,4 km`, `62 min`, `1:02:33`, `742 kcal`) and German or English type names.

```
hyrox-coach export v1
workout; start=2026-11-10T07:02:11+01:00; type=Running; duration=1:02:33; distance=10,4 km; kcal=742; hr=151
workout; start=2026-11-12T18:00:00+01:00; type=Other; name=HYROX Sim; duration=75 min
metric; type=Resting Heart Rate; date=2026-11-10T00:00:00+01:00; value=48
```

| Record    | Keys                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| `workout` | `start` (required), `end`, `duration`, `type`, `name`, `distance`, `kcal`, `hr`, `maxhr` |
| `metric`  | `type` (resting heart rate, heart rate variability, VO2 max, weight), `date`, `value`    |

A workout named "Hyrox…" is stored as a Hyrox session, "SkiErg…" as SkiErg work.

## Different Apple ID

If the Mac is signed in to another Apple ID than the iPhone, the iCloud folder is not shared.
Either change step 13 to save into a folder both can reach, or AirDrop the file and run
`npx hyrox-coach import hyrox-coach-export.txt`. To make `sync` read another folder, set
`HYROX_COACH_INBOX=/path/to/folder`.
