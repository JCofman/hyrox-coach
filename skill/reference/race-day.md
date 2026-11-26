# Race Execution

## Pacing principle

Even effort, not even speed. The race is decided between station 4 and run 8, never in the
first kilometer. Hyrox's own preparation advice says the same thing first: do not start too
fast, and keep heart rate under control on run 1 and the SkiErg.

| Segment            | Effort        | Guidance                                                                  |
| ------------------ | ------------- | ------------------------------------------------------------------------- |
| Run 1              | RPE 5-6       | 5-10 s/km **slower** than target pace. Adrenaline makes it feel too easy. |
| SkiErg             | RPE 6, Zone 3 | Target split from training, even. Long strokes, breathe.                  |
| Run 2              | RPE 6         | Settle into target pace                                                   |
| Sled Push          | RPE 8         | Continuous 12.5 m, short breath at each line. Do not redline.             |
| Run 3              | RPE 6-7       | Legs are heavy for 200-300 m; shorten stride, cadence up, it passes       |
| Sled Pull          | RPE 7-8       | Use body weight, not biceps. Keep the rope tidy.                          |
| Run 4              | RPE 6-7       | Target pace                                                               |
| Burpee Broad Jumps | RPE 8         | Metronome rhythm. Step up/down if HR is high.                             |
| Run 5              | RPE 6-7       | Hardest run mentally. Hold form.                                          |
| Row                | RPE 6, Zone 3 | Controlled; bring HR down before the back half                            |
| Run 6              | RPE 7         | Target pace                                                               |
| Farmers Carry      | RPE 7         | Fast walk, unbroken if trained                                            |
| Run 7              | RPE 7         | Now you may push                                                          |
| Sandbag Lunges     | RPE 8         | Do not stop. Steady steps.                                                |
| Run 8              | RPE 8         | Everything that is left, saving just enough to throw                      |
| Wall Balls         | RPE 9         | Planned sets from the first rep; short rests; empty the tank              |

Build `raceStrategy.pacing.stations` with a target time and a one-line strategy for each of the
8 stations, from the athlete's simulation splits (or the level table in hyrox-format.md when
there is no simulation yet).

## Roxzone

- Jog every transition; walking the Roxzone costs 2-4 minutes over a race.
- Know the layout: walk the Roxzone and find each station's entry/exit before the start.
- Chalk, sip, move. No standing at the station entrance.

## Fueling

A 60-110 minute race at threshold depends on carbohydrate.

| When             | What                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------ |
| Day before       | Carbohydrate-rich meals (6-8 g/kg across the day), low fiber, normal hydration       |
| 3-4 h before     | Familiar meal: 1-2 g/kg carbs, low fat and fiber (oats, rice, bagel + honey, banana) |
| 60-30 min before | Small top-up: banana or gel; 300-500 ml fluid with electrolytes                      |
| Caffeine         | 2-3 mg/kg 45-60 min before, only if used in training                                 |
| During           | Sip water at Roxzone stations. Over ~75 min: one gel around the row (station 5)      |
| After            | 20-30 g protein + 1 g/kg carbs within an hour; rehydrate                             |

Rehearse the exact routine in the full simulation. Nothing new on race day.

## Race-week checklist

- [ ] Start wave and check-in time known; plan to arrive 90 min early
- [ ] Shoes with grip for the carpet (sleds) that are also comfortable to run 8 km in
- [ ] Clothing tested in a simulation; optional grip aid / chalk, knee sleeves for lunges
- [ ] Division weights and standards re-read; judge briefing watched
- [ ] Pace band or watch screen with target run pace and station targets
- [ ] Doubles: station splits and changeover calls agreed

## Warm-up (20-25 min, finish 10 min before the start)

1. 8-10 min easy jog
2. Mobility: ankles, hips, thoracic spine
3. 2-3 min easy on SkiErg or rower if available in the warm-up area
4. 10 air squats, 10 lunges, 5 burpees, 10 light wall balls or thrusters
5. 3 × 20 s at race pace, walk back

## Mental cues

- "First run is free - bank patience, not time."
- "Stations are jobs: one line, one set, one breath."
- "Heavy legs last 300 meters."
- "The race starts at the row."

## When it goes wrong

| Problem                   | Response                                                                  |
| ------------------------- | ------------------------------------------------------------------------- |
| HR spiking early          | Slow the next run by 10 s/km; nasal exhale; recover on the erg            |
| Sled will not move        | Lower hips, shorter steps, reset after each 12.5 m, do not panic          |
| Grip failing on the carry | Set down before it slips, 3 breaths, go; hook grip                        |
| No-rep on wall balls      | Slow down, squat deeper, hit the centre; one no-rep costs less than three |
| Cramp                     | Walk 20 m, shorten stride, fluid at the next table                        |
