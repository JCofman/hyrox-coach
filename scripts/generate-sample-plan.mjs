#!/usr/bin/env node
/**
 * Generates examples/sample-plan.json: a 12-week Open Men plan for an intermediate athlete.
 * Each workout is declared as parts with minutes, so durationMinutes and the humanReadable
 * text can never drift apart.
 */
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const START = new Date(Date.UTC(2026, 10, 16)); // Monday
const RACE = "2027-02-06"; // Saturday of week 12
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

/** parts: [label, minutes, text] */
function workout(sport, type, name, description, parts, extra = {}) {
  const durationMinutes = parts.reduce((t, p) => t + p[1], 0);
  const humanReadable = parts
    .map(([label, min, text]) => `${label}${label === "Main" ? ` (${min} min)` : ""}: ${text}`)
    .join("\n");
  return { sport, type, name, description, durationMinutes, humanReadable, ...extra };
}
const rest = (description = "Full recovery. Walk, stretch, sleep.") => ({
  sport: "rest",
  type: "rest",
  name: "Rest Day",
  description,
});

const WU = ["Warm-up", 12, "8 min easy jog, leg swings, lunges, 3 x 20 s pick-ups"];
const CD = ["Cool-down", 10, "5 min easy jog, 5 min calves, hips, lats"];
const run = (type, name, description, main, km, zone, rpe, wu = WU, cd = CD) =>
  workout("run", type, name, description, [wu, ["Main", main[0], main[1]], cd], {
    distanceMeters: Math.round(km * 1000),
    primaryZone: zone,
    rpe,
  });
const easy = (min, km, strides = false) =>
  workout(
    "run",
    "endurance",
    strides ? "Easy Run + Strides" : "Easy Run",
    "Aerobic volume at conversational effort. If you cannot talk in full sentences, slow down.",
    [
      ["Warm-up", 5, "walk into a slow jog"],
      [
        "Main",
        min - 10,
        `continuous run @ 5:50-6:05/km, Zone 2${strides ? ", then 6 x 20 s relaxed strides with 60 s walk" : ""}`,
      ],
      ["Cool-down", 5, "walk + calf stretch"],
    ],
    { distanceMeters: km * 1000, primaryZone: "Zone 2", rpe: 4 }
  );
const long = (km, finish = false) => {
  const min = Math.round(km * 5.95);
  return workout(
    "run",
    "long",
    "Long Run",
    "Durability for 8 km of racing plus stations. Keep it easy; the distance is the stimulus.",
    [
      [
        "Main",
        min,
        `${km} km @ 5:50-6:05/km, Zone 2${finish ? ", last 15 min steady @ 5:20/km" : ""}. Sip water; take a gel after 60 min`,
      ],
    ],
    { distanceMeters: km * 1000, primaryZone: "Zone 2", rpe: finish ? 5 : 4 }
  );
};

const SWU = [
  "Warm-up",
  10,
  "5 min row or ski easy, hip and shoulder mobility, 2 ramp sets of the first lift",
];
const strengthA = (sets) =>
  workout(
    "strength",
    "max_strength",
    "Strength A: Squat + Push",
    "General strength makes race weights feel light. Leave 2 reps in reserve on every set.",
    [
      SWU,
      [
        "Main",
        42,
        `${sets} x 5 back squat @ RPE 7-8, 2-3 min rest\n  3 x 8/side Bulgarian split squat\n  4 x 6 overhead press\n  3 x 10 push-ups or dips\n  3 x 45 s plank`,
      ],
      ["Cool-down", 8, "easy bike or walk, quad and hip-flexor stretch"],
    ],
    { rpe: 7 }
  );
const strengthB = (sets) =>
  workout(
    "strength",
    "max_strength",
    "Strength B: Hinge + Pull",
    "Posterior chain and grip for sled pull, row and farmers carry.",
    [
      SWU,
      [
        "Main",
        42,
        `${sets} x 5 trap-bar deadlift @ RPE 7-8, 2-3 min rest\n  3 x 8 hip thrust\n  4 x 6-8 pull-ups or lat pulldown\n  4 x 8 seated row\n  4 x 40 m heavy farmers carry (2 x 32 kg)`,
      ],
      ["Cool-down", 8, "easy walk, hamstring and lat stretch"],
    ],
    { rpe: 7, stations: ["farmers_carry"] }
  );
const strengthEndurance = (round) =>
  workout(
    "strength",
    "strength_endurance",
    "Strength Endurance",
    "High-rep work at race weight: the quality that keeps station times stable late in the race.",
    [
      SWU,
      [
        "Main",
        42,
        `3 x 15 goblet squat into 3 x 12 thrusters (2 x 12.5 kg)\n  ${round} x 12.5 m sled push @ 152 kg, 60 s rest\n  4 x 12.5 m sled pull @ 103 kg, 60 s rest\n  3 x 25 m sandbag lunges @ 20 kg\n  3 x 15 seated row + 3 x 15 triceps push-down`,
      ],
      ["Cool-down", 8, "easy bike, hips and thoracic mobility"],
    ],
    { rpe: 8, stations: ["sled_push", "sled_pull", "sandbag_lunges"] }
  );
const maintenance = (min = 45) =>
  workout(
    "strength",
    "max_strength",
    "Strength Maintenance",
    "Keep strength without soreness. Move fast, stop well short of failure.",
    [
      ["Warm-up", 8, "easy erg, mobility, ramp sets"],
      [
        "Main",
        min - 14,
        "2 x 6 back squat @ RPE 6\n  2 x 6 trap-bar deadlift @ RPE 6\n  2 x 8 overhead press\n  2 x 8 pull-ups\n  2 x 50 m farmers carry @ 2 x 24 kg",
      ],
      ["Cool-down", 6, "mobility"],
    ],
    { rpe: 6, stations: ["farmers_carry"] }
  );

const W = "Warm-up";
const hy = (type, name, description, parts, km, rpe, stations, zone = "Zone 3-4") =>
  workout("hyrox", type, name, description, parts, {
    distanceMeters: Math.round(km * 1000),
    primaryZone: zone,
    rpe,
    stations,
  });
const st = (type, name, description, parts, rpe, stations) =>
  workout("stations", type, name, description, parts, { rpe, stations });
const ALL = [
  "skierg",
  "sled_push",
  "sled_pull",
  "burpee_broad_jump",
  "row",
  "farmers_carry",
  "sandbag_lunges",
  "wall_balls",
];

// week -> [Tue, Wed, Thu, Sat, Sun]
const weeks = [
  {
    phase: "Base",
    focus: "Establish routine, baseline 5k",
    recovery: false,
    tue: run(
      "test",
      "5 km Time Trial",
      "Baseline for run zones. Even pacing; the last kilometer should be the fastest.",
      [26, "5 km all-out, evenly paced. Note time and average HR of the final 10 min"],
      8,
      "Zone 4-5",
      9,
      ["Warm-up", 15, "10 min easy jog, drills, 4 x 20 s strides"],
      CD
    ),
    wed: strengthA(3),
    thu: easy(40, 7, true),
    sat: st(
      "technique",
      "Station Technique Circuit",
      "Learn every station at light load with full rest. Movement standards before intensity.",
      [
        [W, 12, "easy jog, mobility, 10 air squats, 5 burpees"],
        [
          "Main",
          40,
          "3 rounds, 2 min rest between rounds, all at 60% race weight\n  250 m SkiErg | 12.5 m sled push @ 90 kg | 12.5 m sled pull @ 60 kg\n  10 m burpee broad jumps | 250 m row | 50 m farmers carry @ 2 x 16 kg\n  12.5 m sandbag lunges @ 10 kg | 15 wall balls @ 6 kg",
        ],
        ["Cool-down", 8, "walk + stretch"],
      ],
      5,
      ALL
    ),
    sun: long(9),
  },
  {
    phase: "Base",
    focus: "Aerobic volume, station baselines",
    recovery: false,
    tue: run(
      "tempo",
      "Steady Intervals",
      "Introduce sustained running above easy pace without much fatigue.",
      [24, "6 x 3 min @ 5:20/km (Zone 3) with 1 min easy jog"],
      7.5,
      "Zone 3",
      6
    ),
    wed: strengthB(3),
    thu: easy(40, 7, true),
    sat: st(
      "test",
      "Station Baselines",
      "Benchmarks for erg zones and the wall-ball plan. Full recovery between tests.",
      [
        [W, 12, "easy jog, mobility, 2 min easy on each erg"],
        [
          "Main",
          40,
          "1000 m SkiErg for time, 8 min easy walk\n  1000 m row for time, 8 min easy walk\n  Wall balls @ 6 kg: max unbroken set, rest 3 min, then 50 for time\n  Sled check: 2 x 12.5 m push @ 152 kg, 2 x 12.5 m pull @ 103 kg",
        ],
        ["Cool-down", 8, "walk + stretch"],
      ],
      8,
      ["skierg", "row", "wall_balls", "sled_push", "sled_pull"]
    ),
    sun: long(10),
  },
  {
    phase: "Base",
    focus: "First threshold work, intro bricks",
    recovery: false,
    tue: run(
      "threshold",
      "Cruise Intervals",
      "Threshold pace is the engine for Hyrox running. Controlled, not all-out.",
      [26, "4 x 5 min @ 5:00/km (Zone 4) with 90 s easy jog"],
      8,
      "Zone 4",
      7
    ),
    wed: strengthA(4),
    thu: easy(45, 7.5, true),
    sat: hy(
      "compromised",
      "Intro Bricks: Ski + Sled",
      "First taste of running straight out of a station. Smooth transitions, controlled effort.",
      [
        [W, 12, "easy jog, mobility, 3 x 20 s pick-ups"],
        [
          "Main",
          38,
          "4 rounds, 2 min rest\n  600 m run @ 5:20/km\n  Odd rounds: 500 m SkiErg @ 2:10/500m\n  Even rounds: sled push 25 m @ 110 kg",
        ],
        ["Cool-down", 10, "walk + stretch"],
      ],
      3.4,
      6,
      ["skierg", "sled_push"],
      "Zone 3"
    ),
    sun: long(12),
  },
  {
    phase: "Base",
    focus: "Recovery week: absorb the first block",
    recovery: true,
    tue: run(
      "intervals",
      "Fartlek",
      "Light, playful speed to stay sharp in a recovery week.",
      [16, "8 x (1 min quick @ 4:40/km / 1 min easy jog)"],
      6,
      "Zone 3",
      6,
      WU,
      CD
    ),
    wed: strengthB(2),
    thu: easy(35, 6),
    sat: st(
      "technique",
      "Technique Circuit (light)",
      "Polish technique while fresh: SkiErg hinge, wall-ball rhythm, lunge standards.",
      [
        [W, 10, "easy jog, mobility"],
        [
          "Main",
          28,
          "2 rounds, 2 min rest, 60% race weight\n  250 m SkiErg | 12.5 m sled push | 12.5 m sled pull | 10 m burpee broad jumps\n  250 m row | 50 m farmers carry | 12.5 m lunges | 15 wall balls",
        ],
        ["Cool-down", 7, "walk + stretch"],
      ],
      4,
      ALL
    ),
    sun: long(8),
  },
  {
    phase: "Build",
    focus: "Race-weight stations, kilometer repeats",
    recovery: false,
    tue: run(
      "threshold",
      "5 x 1 km Threshold",
      "The classic Hyrox run session: kilometers at threshold with short recoveries.",
      [31, "5 x 1 km @ 5:00/km (Zone 4) with 90 s easy jog"],
      9,
      "Zone 4",
      7
    ),
    wed: strengthEndurance(4),
    thu: easy(45, 7.5, true),
    sat: hy(
      "compromised",
      "Leg-Killer Runs",
      "Run at race pace on legs loaded by sleds, lunges and wall balls. This is the race-deciding skill.",
      [
        [W, 12, "easy jog, mobility, 2 x 12.5 m light sled, 3 x 20 s pick-ups"],
        [
          "Main",
          43,
          "4 rounds, 90 s rest\n  1 km run @ 5:15/km\n  Round 1: sled push 25 m @ 152 kg | Round 2: 25 m sandbag lunges @ 20 kg\n  Round 3: 25 wall balls @ 6 kg | Round 4: sled pull 25 m @ 103 kg",
        ],
        ["Cool-down", 10, "walk + stretch"],
      ],
      5,
      8,
      ["sled_push", "sandbag_lunges", "wall_balls", "sled_pull"]
    ),
    sun: long(13),
  },
  {
    phase: "Build",
    focus: "Threshold volume, upper/lower brick",
    recovery: false,
    tue: run(
      "threshold",
      "6 x 1 km Threshold",
      "One more rep, slightly less rest than last week.",
      [36, "6 x 1 km @ 4:55-5:00/km (Zone 4) with 75 s easy jog"],
      10,
      "Zone 4",
      7
    ),
    wed: strengthEndurance(6),
    thu: easy(45, 7.5, true),
    sat: hy(
      "compromised",
      "Upper/Lower Split Brick",
      "Alternate an arm-dominant and a leg-dominant station, like the first half of the race.",
      [
        [W, 12, "easy jog, mobility, 2 min easy SkiErg"],
        [
          "Main",
          48,
          "3 rounds, 3 min rest\n  1 km run @ 5:15/km\n  500 m SkiErg @ 2:08/500m\n  1 km run @ 5:15/km\n  Sled push 25 m @ 152 kg",
        ],
        ["Cool-down", 10, "walk + stretch"],
      ],
      7,
      8,
      ["skierg", "sled_push"]
    ),
    sun: long(14, true),
  },
  {
    phase: "Build",
    focus: "Peak build week: VO2 and half simulation",
    recovery: false,
    tue: run(
      "vo2max",
      "800 m Repeats",
      "Raise the ceiling so race pace sits further below it.",
      [26, "5 x 800 m @ 4:30/km (Zone 5) with 2 min easy jog"],
      8,
      "Zone 5",
      9
    ),
    wed: strengthEndurance(6),
    thu: easy(40, 7),
    sat: hy(
      "simulation",
      "Half Simulation: Stations 1-4",
      "First half of the race at race effort. Record every split.",
      [
        [W, 15, "easy jog, mobility, 1 min each erg, 3 x 20 s pick-ups"],
        [
          "Main",
          50,
          "Continuous, race effort (RPE 7-8), jog the transitions\n  1 km @ 5:15 + 1000 m SkiErg @ 2:10/500m\n  1 km @ 5:15 + sled push 50 m @ 152 kg\n  1 km @ 5:20 + sled pull 50 m @ 103 kg\n  1 km @ 5:20 + 80 m burpee broad jumps\n  1 km @ 5:15 to finish",
        ],
        ["Cool-down", 10, "walk + stretch, write down splits"],
      ],
      6.5,
      8,
      ["skierg", "sled_push", "sled_pull", "burpee_broad_jump"]
    ),
    sun: long(16, true),
  },
  {
    phase: "Build",
    focus: "Recovery week and retests",
    recovery: true,
    tue: run(
      "threshold",
      "3 x 1 km Threshold",
      "Short touch of quality; legs should feel fresh by the weekend.",
      [19, "3 x 1 km @ 5:00/km (Zone 4) with 2 min easy jog"],
      6.5,
      "Zone 4",
      6,
      WU,
      ["Cool-down", 9, "easy jog + stretch"]
    ),
    wed: maintenance(45),
    thu: easy(35, 6),
    sat: st(
      "strength_endurance",
      "EMOM 32",
      "Station fitness without running load. Every rep at the same quality.",
      [
        [W, 10, "easy jog, mobility"],
        [
          "Main",
          32,
          "Every minute for 32 min, rotate through\n  Min 1: 12 cal SkiErg | Min 2: 8 m burpee broad jumps\n  Min 3: 15 wall balls @ 6 kg | Min 4: 40 m farmers carry @ 2 x 24 kg",
        ],
        ["Cool-down", 8, "walk + stretch"],
      ],
      7,
      ["skierg", "burpee_broad_jump", "wall_balls", "farmers_carry"]
    ),
    sun: long(10),
  },
  {
    phase: "Specific",
    focus: "Race pace, back half of the race",
    recovery: false,
    tue: run(
      "intervals",
      "6 x 1 km Race Pace",
      "Lock in Hyrox pace. It should feel almost too easy when fresh; that is the point.",
      [37, "6 x 1 km @ 5:15/km with 60 s walk-jog"],
      9.5,
      "Zone 3",
      6
    ),
    wed: maintenance(45),
    thu: easy(45, 7.5, true),
    sat: hy(
      "simulation",
      "Half Simulation: Stations 5-8",
      "The back half is where races are decided. Practise the wall-ball set plan on empty legs.",
      [
        [W, 15, "easy jog, mobility, 1 min row, 10 wall balls"],
        [
          "Main",
          50,
          "Continuous, race effort, jog the transitions\n  1 km @ 5:15 + 1000 m row @ 2:15/500m\n  1 km @ 5:15 + 200 m farmers carry @ 2 x 24 kg\n  1 km @ 5:20 + 100 m sandbag lunges @ 20 kg\n  1 km @ 5:15 + 100 wall balls @ 6 kg as 25-20-20-15-10-10",
        ],
        ["Cool-down", 10, "walk + stretch, write down splits"],
      ],
      6,
      8,
      ["row", "farmers_carry", "sandbag_lunges", "wall_balls"]
    ),
    sun: long(14),
  },
  {
    phase: "Specific",
    focus: "Full simulation: rehearse everything",
    recovery: false,
    tue: run(
      "intervals",
      "8 x 1 km Race Pace",
      "Eight kilometers at race pace: the running half of your race.",
      [49, "8 x 1 km @ 5:15/km with 60 s walk-jog"],
      11.5,
      "Zone 3",
      7,
      ["Warm-up", 10, "easy jog, mobility, 2 pick-ups"],
      ["Cool-down", 8, "easy jog + stretch"]
    ),
    wed: maintenance(40),
    thu: easy(35, 6),
    sat: hy(
      "simulation",
      "Full Race Simulation",
      "Dress rehearsal at 90-95% effort: race shoes, race breakfast, race fueling, race pacing. The splits become your race plan.",
      [
        [W, 15, "race-day warm-up exactly as planned"],
        [
          "Main",
          87,
          "All 8 x (1 km run + station) at Open Men weights, target ~1:27\n  Runs @ 5:15-5:25/km, first run 5:25\n  SkiErg 1000 m | Sled push 50 m @ 152 kg | Sled pull 50 m @ 103 kg | 80 m burpee broad jumps\n  Row 1000 m | Farmers carry 200 m @ 2 x 24 kg | Lunges 100 m @ 20 kg | 100 wall balls @ 6 kg\n  Gel after the row",
        ],
        ["Cool-down", 8, "walk, eat within 30 min"],
      ],
      8.7,
      9,
      ALL,
      "Zone 4"
    ),
    sun: workout(
      "bike",
      "recovery",
      "Recovery Spin",
      "Flush the legs after the simulation without any impact.",
      [["Main", 40, "easy spin or walk, Zone 1, then 10 min mobility included"]],
      { primaryZone: "Zone 1", rpe: 2 }
    ),
  },
  {
    phase: "Specific",
    focus: "Sharpen: transitions and pace",
    recovery: false,
    tue: run(
      "threshold",
      "3 x 2 km",
      "Longer reps slightly faster than race pace to make race pace feel comfortable.",
      [35, "3 x 2 km @ 5:05/km with 2 min easy jog"],
      10,
      "Zone 4",
      7
    ),
    wed: maintenance(40),
    thu: easy(40, 7, true),
    sat: hy(
      "compromised",
      "Roxzone Repeats",
      "Fast, clean transitions. No standing at the station entrance.",
      [
        [W, 12, "easy jog, mobility, 3 x 20 s pick-ups"],
        [
          "Main",
          38,
          "8 x (400 m run @ 5:10/km + ~75 s station at race pace), jog straight between, no rest\n  250 m SkiErg | 12.5 m sled push | 12.5 m sled pull | 15 m burpee broad jumps\n  250 m row | 50 m farmers carry | 20 m lunges | 20 wall balls",
        ],
        ["Cool-down", 10, "walk + stretch"],
      ],
      4.5,
      7,
      ALL
    ),
    sun: long(12),
  },
];

const taper = {
  phase: "Taper",
  focus: "Race week: fresh legs, sharp mind",
  days: [
    rest("Sleep, hydrate, re-read the movement standards."),
    run(
      "intervals",
      "Race-Pace Openers",
      "Remind the legs of race pace with lots of recovery.",
      [27, "4 x 1 km @ 5:15/km with 2 min walk-jog"],
      6.5,
      "Zone 3",
      6,
      ["Warm-up", 10, "easy jog + mobility"],
      ["Cool-down", 8, "easy jog + stretch"]
    ),
    workout(
      "strength",
      "max_strength",
      "Activation Lift",
      "Wake up the muscles, no fatigue.",
      [
        ["Warm-up", 8, "easy erg + mobility"],
        ["Main", 16, "2 x 5 squat @ RPE 5, 2 x 5 deadlift @ RPE 5, 2 x 10 light wall balls"],
        ["Cool-down", 6, "mobility"],
      ],
      { rpe: 4 }
    ),
    hy(
      "technique",
      "Race Opener",
      "Short touches of three stations at race pace. Finish feeling you could do it all again.",
      [
        [W, 10, "easy jog + mobility"],
        [
          "Main",
          17,
          "2 rounds, 2 min rest: 500 m run @ 5:15/km, 250 m SkiErg, 12.5 m sled push @ 152 kg, 15 wall balls @ 6 kg",
        ],
        ["Cool-down", 8, "walk + stretch"],
      ],
      2.5,
      5,
      ["skierg", "sled_push", "wall_balls"],
      "Zone 3"
    ),
    rest("Travel, check-in, carbohydrate-rich meals, 15 min walk. Lay out your kit."),
    {
      sport: "race",
      type: "race",
      name: "HYROX Hamburg",
      description:
        "Race day. First run is free: bank patience, not time. The race starts at the row.",
      durationMinutes: 85,
      distanceMeters: 8000,
      primaryZone: "Zone 4",
      rpe: 9,
      stations: ALL,
      humanReadable:
        "Target 1:25:00\nRuns @ 5:10-5:20/km (run 1 @ 5:25)\nSkiErg 4:20 | Sled push 3:00 | Sled pull 4:45 | Burpee broad jumps 5:15\nRow 4:30 | Farmers carry 2:05 | Lunges 4:45 | Wall balls 6:15\nRoxzone 6:00 total",
    },
    rest("Walk, eat, celebrate. Write down what you would change."),
  ],
};

function buildWeek(n, phase, focus, recovery, sessions) {
  const start = addDays(START, (n - 1) * 7);
  const days = sessions.map((w, i) => {
    const date = iso(addDays(start, i));
    const id = `w${n}-${DAYS[i].slice(0, 3).toLowerCase()}-${w.sport}`;
    return { date, dayOfWeek: DAYS[i], workouts: [{ id, ...w, completed: false }] };
  });
  const bySport = {};
  let minutes = 0;
  for (const d of days)
    for (const w of d.workouts) {
      if (w.sport === "rest") continue;
      const s = (bySport[w.sport] ??= { sessions: 0, hours: 0, km: 0 });
      s.sessions++;
      s.hours += (w.durationMinutes ?? 0) / 60;
      s.km += (w.distanceMeters ?? 0) / 1000;
      minutes += w.durationMinutes ?? 0;
    }
  for (const s of Object.values(bySport)) {
    s.hours = Math.round(s.hours * 10) / 10;
    s.km = Math.round(s.km * 10) / 10;
    if (!s.km) delete s.km;
  }
  const totalHours = Math.round((minutes / 60) * 10) / 10;
  return {
    weekNumber: n,
    startDate: iso(start),
    endDate: iso(addDays(start, 6)),
    phase,
    focus,
    targetHours: totalHours,
    isRecoveryWeek: recovery,
    days,
    summary: { totalHours, bySport },
  };
}

const planWeeks = weeks.map((w, i) =>
  buildWeek(i + 1, w.phase, w.focus, w.recovery, [
    rest(),
    w.tue,
    w.wed,
    w.thu,
    rest("Rest or 20 min mobility."),
    w.sat,
    w.sun,
  ])
);
planWeeks.push(buildWeek(12, taper.phase, taper.focus, false, taper.days));

const hours = (from, to) => {
  const h = planWeeks.slice(from - 1, to).map((w) => w.summary.totalHours);
  return { low: Math.floor(Math.min(...h)), high: Math.ceil(Math.max(...h)) };
};

const plan = {
  version: "1.0",
  meta: {
    id: "sample-hyrox-open-men-12wk",
    athlete: "Sample Athlete",
    event: "HYROX Hamburg",
    eventDate: RACE,
    division: "open_men",
    goalTime: "1:25:00",
    planStartDate: iso(START),
    planEndDate: iso(addDays(START, 83)),
    createdAt: "2026-11-11T00:00:00Z",
    updatedAt: "2026-11-11T00:00:00Z",
    totalWeeks: 12,
    generatedBy: "Hyrox Coach",
  },
  preferences: { run: "kilometers", bike: "kilometers", weight: "kg", firstDayOfWeek: "monday" },
  assessment: {
    foundation: {
      raceHistory: ["HYROX Berlin 2026 Open 1:34:10", "10k 49:30 (2026)"],
      peakTrainingLoad: 7,
      foundationLevel: "intermediate",
      yearsInSport: 3,
    },
    currentForm: {
      weeklyVolume: { total: 5, run: 2.3, strength: 2.2, erg: 0.5 },
      weeklyRunKm: 22,
      longestSessions: { run: 10 },
      consistency: 4,
    },
    strengths: [{ area: "sled_push", evidence: "3:05 split in Berlin; squats 1.5 x body weight" }],
    limiters: [
      { area: "run", evidence: "Runs 5-8 were 35 s/km slower than runs 1-2; only 22 km/week" },
      { area: "wall_balls", evidence: "8:10 split; largest unbroken set 15" },
    ],
    dataSources: ["apple_health", "garmin"],
    constraints: ["60 min on weekdays", "Gym with sled track and both ergs on Saturdays"],
  },
  zones: {
    maxHR: 188,
    restingHR: 52,
    weight: 80,
    run: {
      hr: {
        lthr: 168,
        zones: [
          { zone: 1, name: "Recovery", percentLow: 0, percentHigh: 81, hrLow: 0, hrHigh: 136 },
          { zone: 2, name: "Aerobic", percentLow: 81, percentHigh: 89, hrLow: 136, hrHigh: 150 },
          { zone: 3, name: "Tempo", percentLow: 89, percentHigh: 94, hrLow: 150, hrHigh: 158 },
          { zone: 4, name: "Threshold", percentLow: 94, percentHigh: 100, hrLow: 158, hrHigh: 168 },
          { zone: 5, name: "VO2max", percentLow: 100, percentHigh: 106, hrLow: 168, hrHigh: 178 },
        ],
      },
      pace: {
        thresholdPace: "5:00/km",
        thresholdPaceSeconds: 300,
        zones: [
          { zone: "E", name: "Easy", pace: "5:55/km", paceSeconds: 355 },
          { zone: "M", name: "Steady", pace: "5:20/km", paceSeconds: 320 },
          { zone: "T", name: "Threshold", pace: "5:00/km", paceSeconds: 300 },
          { zone: "I", name: "Interval", pace: "4:30/km", paceSeconds: 270 },
          { zone: "R", name: "Repetition", pace: "4:10/km", paceSeconds: 250 },
        ],
      },
    },
    row: {
      thresholdSplit: "2:00/500m",
      thresholdSplitSeconds: 120,
      zones: [
        { zone: 1, name: "Recovery", paceOffset: 25, pace: "2:25/500m" },
        { zone: 2, name: "Aerobic", paceOffset: 15, pace: "2:15/500m" },
        { zone: 3, name: "Tempo", paceOffset: 7, pace: "2:07/500m" },
        { zone: 4, name: "Threshold", paceOffset: 0, pace: "2:00/500m" },
        { zone: 5, name: "VO2max", paceOffset: -8, pace: "1:52/500m" },
      ],
    },
  },
  phases: [
    {
      name: "Base",
      startWeek: 1,
      endWeek: 4,
      focus: "Aerobic base, general strength, station technique",
      weeklyHoursRange: hours(1, 4),
      keyWorkouts: ["Long run", "Cruise intervals", "Max strength"],
      physiologicalGoals: [
        "Raise aerobic capacity",
        "Build general strength",
        "Learn movement standards",
      ],
    },
    {
      name: "Build",
      startWeek: 5,
      endWeek: 8,
      focus: "Threshold running, strength endurance, race-weight stations",
      weeklyHoursRange: hours(5, 8),
      keyWorkouts: ["1 km threshold repeats", "Compromised running", "Half simulation"],
      physiologicalGoals: [
        "Lift threshold pace",
        "Strength endurance at race weight",
        "Run well on loaded legs",
      ],
    },
    {
      name: "Specific",
      startWeek: 9,
      endWeek: 11,
      focus: "Race pace, transitions, full rehearsal",
      weeklyHoursRange: hours(9, 11),
      keyWorkouts: ["Race-pace kilometers", "Full simulation", "Roxzone repeats"],
      physiologicalGoals: ["Race-pace economy", "Pacing and fueling routine"],
    },
    {
      name: "Taper",
      startWeek: 12,
      endWeek: 12,
      focus: "Freshness",
      weeklyHoursRange: hours(12, 12),
      keyWorkouts: ["Race-pace openers", "Race"],
      physiologicalGoals: ["Shed fatigue, keep sharpness"],
    },
  ],
  weeks: planWeeks,
  raceStrategy: {
    event: { name: "HYROX Hamburg", date: RACE, division: "open_men", goalTime: "1:25:00" },
    pacing: {
      run: {
        targetPace: "5:10-5:20/km",
        targetHR: "160-172",
        notes:
          "Run 1 at 5:25. Expect heavy legs for 300 m after sleds and lunges. Push from run 7.",
      },
      roxzone: {
        targetTime: "6:00",
        notes: "Jog every transition; know each station entrance beforehand",
      },
      stations: [
        {
          station: "skierg",
          order: 1,
          load: "1000 m",
          targetTime: "4:20",
          strategy: "2:10/500m even, long strokes, breathe",
        },
        {
          station: "sled_push",
          order: 2,
          load: "152 kg x 50 m",
          targetTime: "3:00",
          strategy: "12.5 m continuous, 10 s breath at each line",
        },
        {
          station: "sled_pull",
          order: 3,
          load: "103 kg x 50 m",
          targetTime: "4:45",
          strategy: "Sit back, long pulls, walk it back when arms fade",
        },
        {
          station: "burpee_broad_jump",
          order: 4,
          load: "80 m",
          targetTime: "5:15",
          strategy: "Step down, step up, steady rhythm",
        },
        {
          station: "row",
          order: 5,
          load: "1000 m",
          targetTime: "4:30",
          strategy: "2:15/500m at 26 spm; bring HR down",
        },
        {
          station: "farmers_carry",
          order: 6,
          load: "2 x 24 kg x 200 m",
          targetTime: "2:05",
          strategy: "Unbroken, fast walk",
        },
        {
          station: "sandbag_lunges",
          order: 7,
          load: "20 kg x 100 m",
          targetTime: "4:45",
          strategy: "Never stop; one step per second",
        },
        {
          station: "wall_balls",
          order: 8,
          load: "100 reps @ 6 kg",
          targetTime: "6:15",
          strategy: "25-20-20-15-10-10 with 6 s rests",
        },
      ],
    },
    nutrition: {
      preRace: "3 h before: oats, banana, honey. 45 min before: one gel and 400 ml electrolytes",
      during: "Water at the Roxzone tables; one gel after the row",
      notes: "Rehearsed in the week 10 simulation. Nothing new on race day.",
    },
    taper: {
      startDate: "2027-01-28",
      volumeReduction: 50,
      notes:
        "Volume halves, race-pace touches stay. No heavy lunges or wall balls to failure inside 5 days.",
    },
    raceDay: {
      wakeUpTime: "4 h before wave start",
      preRaceMeal: "Oats with banana and honey, coffee",
      warmUp:
        "10 min jog, mobility, 2 min SkiErg, 10 wall balls, 3 x 20 s at race pace; done 10 min before the start",
      mentalCues: [
        "First run is free",
        "One line, one set, one breath",
        "Heavy legs last 300 meters",
        "The race starts at the row",
      ],
    },
  },
};

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "sample-plan.json");
writeFileSync(out, JSON.stringify(plan, null, 2) + "\n");
console.log(
  `Wrote ${out}: ${planWeeks.length} weeks, ${planWeeks.map((w) => w.summary.totalHours).join(" / ")} h`
);
