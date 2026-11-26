# Intensity: Zones, Paces and RPE

Hyrox plans mix three languages of intensity. Use the one that fits the session:

- **Heart rate** for easy and steady running (keeps easy days easy).
- **Pace** for run intervals and race-pace work.
- **RPE 1-10** for stations, strength and mixed sessions, where HR lags and pace is meaningless.
  (ESN's Hyrox plan prescribes everything by RPE for this reason.)

## RPE scale

| RPE | Feel                          | Use for                                  |
| --- | ----------------------------- | ---------------------------------------- |
| 2-3 | Very easy, nasal breathing    | Warm-up, cool-down, recovery             |
| 4-5 | Easy, full sentences          | Zone 2 runs, technique work              |
| 6   | Steady, short sentences       | Tempo, **Hyrox race effort on the runs** |
| 7   | Comfortably hard, a few words | Threshold, **race effort on stations**   |
| 8   | Hard, single words            | VO2 intervals, heavy strength endurance  |
| 9   | Very hard, cannot talk        | Short repeats, final wall balls          |
| 10  | All-out                       | Tests only                               |

## Heart rate zones (5-zone, from LTHR)

Estimate LTHR as the average HR of the last 20 min of a 30-min solo time trial, or roughly
max HR × 0.89. From imported data: the average HR of their fastest recent 10k effort is a good
proxy; observed max HR comes from queries.md.

| Zone | Name      | % LTHR  | Hyrox use                                        |
| ---- | --------- | ------- | ------------------------------------------------ |
| 1    | Recovery  | < 81%   | Recovery jogs, between-set walking               |
| 2    | Aerobic   | 81-89%  | Easy and long runs: 70-80% of all run time       |
| 3    | Tempo     | 89-94%  | Steady runs; where most of the race is run       |
| 4    | Threshold | 94-100% | Threshold intervals; stations push you here      |
| 5    | VO2max    | > 100%  | Short intervals; burpees and wall balls end here |

Race HR typically averages 88-94% of max for the whole event. Hyrox's own advice: control heart
rate early, especially on the first kilometer and the SkiErg.

## Run pace zones (from threshold pace)

Threshold pace (T) ≈ pace sustainable for about an hour ≈ 10k race pace + 5-10 s/km, or
5k pace + 15-20 s/km.

| Zone | Name       | Pace            | Session types                      |
| ---- | ---------- | --------------- | ---------------------------------- |
| E    | Easy       | T × 1.18 - 1.30 | Easy runs, long runs               |
| M    | Steady     | T × 1.07        | Steady state, long tempo           |
| T    | Threshold  | T               | Cruise intervals, tempo            |
| I    | Interval   | T × 0.89-0.92   | 400 m - 1 km repeats (≈ 3-5k pace) |
| R    | Repetition | T × 0.82-0.85   | 200-400 m, strides                 |

### Hyrox race pace

The fresh 1 km pace an athlete can hold through a Hyrox is **not** their 10k pace:

**Hyrox run pace ≈ 10k pace + 15-30 s/km** (well-prepared athletes at the low end, first-timers
and lifters at the high end), which is close to threshold pace + 10-20 s/km. Runs after sleds,
burpees and lunges are a further 10-20 s/km slower. Train the gap closed with compromised running.

### Finish-time estimate

Rough prediction for Open division, to sanity-check goals:

```
finish ≈ 8 × (10k pace per km + 20 s)            running
       + station total (see table)               stations
       + 5 to 8 min                              Roxzone
```

| Level        | Station total (8 stations) |
| ------------ | -------------------------- |
| First-timer  | 44-52 min                  |
| Intermediate | 36-42 min                  |
| Advanced     | 30-35 min                  |
| Competitive  | 25-29 min                  |

Example: 10k in 50:00 (5:00/km) → runs 8 × 5:20 = 42:40; intermediate stations 39:00;
Roxzone 6:30 → about 1:28.

## Erg zones (row and SkiErg, split per 500 m)

Threshold split ≈ 2 km test split + 8 s. SkiErg splits are usually within a few seconds of row
splits for trained athletes (slower for beginners).

| Zone | Name      | Offset vs threshold | Use                                    |
| ---- | --------- | ------------------- | -------------------------------------- |
| 1    | Recovery  | +25 s               | Warm-up, between intervals             |
| 2    | Aerobic   | +15 s               | Long steady erg, cross-training        |
| 3    | Tempo     | +7 s                | **Race pace for both 1000 m stations** |
| 4    | Threshold | 0                   | 4-6 × 500-1000 m intervals             |
| 5    | VO2max    | −8 s                | 250-500 m repeats                      |

Racing the ergs harder than Zone 3 gains 10-15 seconds and costs a minute on the next run.

## Field tests (schedule in week 1-2 and again mid-plan)

Use these when data is thin or zones were estimated. One per session, fresh.

1. **5 km run time trial** → T pace = 5k pace + 15-20 s/km; LTHR ≈ avg HR of the final 10 min.
2. **1000 m row and 1000 m SkiErg**, 10 min rest between → station baselines and erg zones.
3. **Wall ball test**: max unbroken reps at race weight, then total time for 50.
4. **Sled check**: 2 × 12.5 m push and pull at race weight - is it movable with good form?
5. **Hyrox PFT** (official Physical Fitness Test), a good 15-25 min benchmark of mixed fitness:
   1000 m run, 50 burpee broad jumps, 100 stationary lunges, 1000 m row, 30 hand-release
   push-ups, 100 wall balls - for time.

Record results in the plan's assessment and retest at the end of the build phase.
